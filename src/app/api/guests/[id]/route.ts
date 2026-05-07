import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: guestId } = await params;
    const authHeader = req.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!guestId) {
      return NextResponse.json({ error: "Missing guest id" }, { status: 400 });
    }

    const token = authHeader.substring(7);
    const adminSupabase = createServiceClient();

    const { data: authUser, error: authError } =
      await adminSupabase.auth.getUser(token);
    if (authError || !authUser.user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const { data: requesterProfile, error: requesterError } =
      await adminSupabase
        .from("profiles")
        .select("role")
        .eq("id", authUser.user.id)
        .single();

    if (requesterError || !requesterProfile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const { data: guest, error: guestError } = await adminSupabase
      .from("profiles")
      .select("id, guest_of, role")
      .eq("id", guestId)
      .eq("role", "guest")
      .single();

    if (guestError || !guest) {
      return NextResponse.json(
        { error: "Guest account not found" },
        { status: 404 },
      );
    }

    const canDelete =
      requesterProfile.role === "admin" || guest.guest_of === authUser.user.id;

    if (!canDelete) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error: personError } = await adminSupabase
      .from("people")
      .update({ auth_user_id: null, has_account: false })
      .eq("auth_user_id", guestId);

    if (personError) {
      return NextResponse.json(
        { error: "Failed to unlink guest from person" },
        { status: 500 },
      );
    }

    const { error: invitationError } = await adminSupabase
      .from("guest_invitations")
      .delete()
      .eq("used_by", guestId);

    if (invitationError) {
      return NextResponse.json(
        { error: "Failed to remove guest invitation" },
        { status: 500 },
      );
    }

    const { error: deleteError } =
      await adminSupabase.auth.admin.deleteUser(guestId);

    if (deleteError) {
      return NextResponse.json(
        { error: deleteError.message || "Failed to delete guest account" },
        { status: 500 },
      );
    }

    return NextResponse.json({ error: null });
  } catch (error) {
    console.error("Failed to delete guest account:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
