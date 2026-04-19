import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function GET(
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
      .select("owner_id, auth_user_id, has_account")
      .eq("handle", handle)
      .single();

    if (personError || !person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    // Check edit permissions
    let canEdit = false;
    let canCreateAccount = false;

    // 1. Own person
    if (person.auth_user_id === authUser.user.id) {
      canEdit = true;
    }

    // 2. Admin/User can edit everything
    if (profile?.role === "admin" || profile?.role === "user") {
      canEdit = true;
      canCreateAccount = !person.has_account;
    }

    // 3. Check family relationship for non-admin users
    if (!canEdit && profile?.role !== "admin") {
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

        if (!familyError && isFamily === true) {
          canEdit = true;
        }
      }
    }

    // Guest can only edit their own person
    if (profile?.role === "guest" && person.auth_user_id !== authUser.user.id) {
      canEdit = false;
    }

    return NextResponse.json({
      canEdit,
      canCreateAccount,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
