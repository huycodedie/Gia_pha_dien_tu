import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const { adminNote } = await req.json().catch(() => ({ adminNote: null }));

    const supabase = createServiceClient();
    const token = authHeader.substring(7);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Admin required" }, { status: 403 });
    }

    const { data: order } = await supabase
      .from("payment_orders")
      .select("user_id, transfer_note, plan:plans(name)")
      .eq("id", id)
      .single();

    const { data, error } = await supabase.rpc("approve_manual_payment_order", {
      p_order_id: id,
      p_admin_id: user.id,
      p_admin_note: adminNote || null,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (data !== "Success") {
      return NextResponse.json(
        { error: data || "Không thể xác nhận thanh toán." },
        { status: 400 },
      );
    }

    if (order?.user_id) {
      await supabase.from("notifications").insert({
        user_id: order.user_id,
        type: "SYSTEM",
        title: "Thanh toán đã được xác nhận",
        message: `Đơn chuyển khoản ${order.transfer_note} cho gói ${(order.plan as { name?: string } | null)?.name || "nâng cấp"} đã được xác nhận.`,
        link_url: "/pricing",
      });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
