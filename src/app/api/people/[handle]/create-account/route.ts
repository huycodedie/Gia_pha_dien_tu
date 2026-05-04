import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ handle: string }> },
) {
  try {
    const { handle } = await params;
    const authHeader = req.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const adminSupabase = createServiceClient();

    const { data: authUser, error: authError } =
      await adminSupabase.auth.getUser(token);
    if (authError || !authUser.user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const { data: profile, error: profileError } = await adminSupabase
      .from("profiles")
      .select("role")
      .eq("id", authUser.user.id)
      .single();

    const { data: person, error: personError } = await adminSupabase
      .from("people")
      .select("display_name, birth_date, email, has_account, owner_id, auth_user_id")
      .eq("handle", handle)
      .single();

    if (personError || !person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    const canEditDirectly =
      person.owner_id === authUser.user.id ||
      person.auth_user_id === authUser.user.id ||
      profile?.role === "admin";

    let canEditFamily = false;
    if (!canEditDirectly && profile?.role === "user") {
      const { data: myPerson, error: myPersonError } = await adminSupabase
        .from("people")
        .select("handle")
        .eq("auth_user_id", authUser.user.id)
        .limit(1)
        .single();

      if (!myPersonError && myPerson?.handle) {
        const { data: isFamily, error: familyError } = await adminSupabase.rpc(
          "is_family_member",
          {
            p_person_handle: myPerson.handle,
            p_target_person_handle: handle,
          },
        );

        canEditFamily = !familyError && isFamily === true;
      }
    }

    if (!canEditDirectly && !canEditFamily) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (person.has_account) {
      return NextResponse.json(
        { error: "Account already exists" },
        { status: 400 },
      );
    }

    if (!person.birth_date) {
      return NextResponse.json(
        { error: "Birth date required" },
        { status: 400 },
      );
    }

    if (personError || !person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    if (person.has_account) {
      return NextResponse.json(
        { error: "Account already exists" },
        { status: 400 },
      );
    }

    if (!person.birth_date) {
      return NextResponse.json(
        { error: "Birth date required" },
        { status: 400 },
      );
    }

    const nameSlug =
      (person.display_name || "user")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]/g, "")
        .toLowerCase() || "user";

    const savedEmail =
      typeof person.email === "string"
        ? person.email.trim().replace(/^"+|"+$/g, "")
        : "";

    if (savedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(savedEmail)) {
      return NextResponse.json(
        { error: "Saved person email is invalid" },
        { status: 400 },
      );
    }

    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const email = savedEmail || `${nameSlug}${randomNum}@gmail.com`;
    const password = "12345678";

    const { data: createData, error: createError } =
      await adminSupabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          display_name: person.display_name,
        },
      });

    if (createError || !createData.user) {
      return NextResponse.json(
        { error: createError?.message || "Failed to create account" },
        { status: 500 },
      );
    }

    const userId = createData.user.id;

    const { error: updatePersonError } = await adminSupabase
      .from("people")
      .update({ auth_user_id: userId, has_account: true })
      .eq("handle", handle);

    if (updatePersonError) {
      await adminSupabase.auth.admin.deleteUser(userId);
      return NextResponse.json(
        { error: "Failed to update person record" },
        { status: 500 },
      );
    }

    const { error: profileUpdateError } = await adminSupabase
      .from("profiles")
      .upsert(
        {
          id: userId,
          email,
          display_name: person.display_name,
          role: "guest",
          status: "active",
          guest_of: authUser.user.id,
        },
        { onConflict: "id" },
      );

    if (profileUpdateError) {
      await adminSupabase
        .from("people")
        .update({ auth_user_id: null, has_account: false })
        .eq("handle", handle);
      await adminSupabase.auth.admin.deleteUser(userId);
      return NextResponse.json(
        { error: "Failed to update profile role" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      email,
      password,
      person_handle: handle,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
