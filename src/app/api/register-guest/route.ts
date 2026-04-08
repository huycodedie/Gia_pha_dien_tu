import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function POST(request: Request) {
  const body = await request.json();
  const { code, email, password, displayName } = body;

  if (!code || !email || !password || !displayName) {
    return NextResponse.json(
      { error: "Thiếu thông tin đăng ký." },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();

  const { data: invitation, error: inviteError } = await supabase
    .from("guest_invitations")
    .select("created_by, used_by, expires_at")
    .eq("code", code)
    .single();

  if (inviteError || !invitation) {
    return NextResponse.json(
      { error: "Mã mời không hợp lệ." },
      { status: 400 },
    );
  }

  if (invitation.used_by) {
    return NextResponse.json(
      { error: "Mã mời đã được sử dụng." },
      { status: 400 },
    );
  }

  if (new Date(invitation.expires_at) < new Date()) {
    return NextResponse.json({ error: "Mã mời đã hết hạn." }, { status: 400 });
  }

  const { data: authData, error: authError } =
    await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: displayName,
      },
    });

  if (authError || !authData.user) {
    return NextResponse.json(
      { error: authError?.message || "Không thể tạo tài khoản." },
      { status: 400 },
    );
  }

  const userId = authData.user.id;

  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      id: userId,
      email,
      display_name: displayName,
      role: "guest",
      guest_of: invitation.created_by,
      status: "active",
    },
    { onConflict: "id" },
  );

  if (profileError) {
    await supabase.auth.admin.deleteUser(userId);
    return NextResponse.json(
      { error: "Không thể cập nhật thông tin tài khoản." },
      { status: 500 },
    );
  }

  const { error: updateError } = await supabase
    .from("guest_invitations")
    .update({ used_by: userId })
    .eq("code", code);

  if (updateError) {
    console.error("Failed to mark invitation as used:", updateError.message);
  }

  return NextResponse.json({ error: null });
}
