import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const supabase = createServiceClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Find user's expired subscriptions
    const { data: expiredSubs, error: selectError } = await supabase
      .from("subscriptions")
      .select("id, plan_id, user_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .lt("expires_at", new Date().toISOString());

    if (selectError) {
      return NextResponse.json({ error: selectError.message }, { status: 500 });
    }

    if (!expiredSubs || expiredSubs.length === 0) {
      return NextResponse.json({
        success: true,
        downgraded_count: 0,
      });
    }

    // Get plan info for downgrading
    let downgradedCount = 0;

    for (const expiredSub of expiredSubs) {
      const { data: planData } = await supabase
        .from("plans")
        .select("from_role")
        .eq("id", expiredSub.plan_id)
        .single();

      if (!planData) continue;

      // Mark subscription as expired
      await supabase
        .from("subscriptions")
        .update({ status: "expired" })
        .eq("id", expiredSub.id);

      // Downgrade user role - bypass RLS for this system operation
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ role: planData.from_role })
        .eq("id", user.id);

      if (!updateError) {
        downgradedCount++;

        // Create expiry notification
        await supabase.from("notifications").insert({
          user_id: user.id,
          type: "SYSTEM",
          title: "Tài khoản User đã hết hạn",
          message:
            "Tài khoản nâng cấp của bạn đã hết hạn và đã quay về role Viewer. Vui lòng gia hạn để tiếp tục sử dụng tính năng.",
          link_url: "/pricing",
        });
      }
    }

    return NextResponse.json({
      success: true,
      downgraded_count: downgradedCount,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}
