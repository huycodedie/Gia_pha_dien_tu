import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    const {
      error_type,
      error_message,
      error_stack,
      url,
      user_agent,
      request_data,
      context_data,
      severity = "medium",
    } = await request.json();

    // Validate required fields
    if (!error_type || !error_message) {
      return NextResponse.json(
        { error: "error_type và error_message là bắt buộc" },
        { status: 400 },
      );
    }

    // Get user ID from session if available
    const supabase = createServiceClient();
    let user = null;
    const authHeader = request.headers.get("authorization");

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser(token);
      user = authUser;
    }

    // Get client IP
    const ip_address =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      "unknown";

    // Generate session ID if not provided
    const session_id =
      request.cookies.get("session_id")?.value ||
      `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Insert error log
    const { data, error } = await supabase
      .from("error_logs")
      .insert({
        user_id: user?.id || null,
        session_id,
        error_type,
        error_message,
        error_stack,
        user_agent,
        url,
        ip_address,
        request_data,
        context_data,
        severity,
      })
      .select()
      .single();

    if (error) {
      console.error("Error inserting error log:", error);
      return NextResponse.json(
        { error: "Không thể ghi nhận lỗi" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Lỗi đã được ghi nhận",
      error_id: data.id,
    });
  } catch (error) {
    console.error("Error in error logging API:", error);
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}

// GET endpoint để lấy thống kê lỗi (cho admin)
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const supabase = createServiceClient();

    // Check if user is admin
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 },
      );
    }

    // Get error statistics
    const { data: stats, error: statsError } = await supabase.rpc(
      "get_error_statistics",
    );

    if (statsError) {
      // Fallback: manual aggregation
      const { data: errors } = await supabase
        .from("error_logs")
        .select("error_type, severity, status, created_at")
        .order("created_at", { ascending: false })
        .limit(1000);

      const stats = {
        total_errors: errors?.length || 0,
        by_type: errors?.reduce((acc: any, err: any) => {
          acc[err.error_type] = (acc[err.error_type] || 0) + 1;
          return acc;
        }, {}),
        by_severity: errors?.reduce((acc: any, err: any) => {
          acc[err.severity] = (acc[err.severity] || 0) + 1;
          return acc;
        }, {}),
        by_status: errors?.reduce((acc: any, err: any) => {
          acc[err.status] = (acc[err.status] || 0) + 1;
          return acc;
        }, {}),
        recent_errors: errors?.slice(0, 10),
      };

      return NextResponse.json({ stats });
    }

    return NextResponse.json({ stats });
  } catch (error) {
    console.error("Error getting error statistics:", error);
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}
