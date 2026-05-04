import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

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

    // Get query parameters
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "100");
    const offset = parseInt(url.searchParams.get("offset") || "0");
    const status = url.searchParams.get("status");
    const error_type = url.searchParams.get("error_type");

    // Build query
    let query = supabase
      .from("error_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    if (error_type && error_type !== "all") {
      query = query.eq("error_type", error_type);
    }

    const { data: errors, error } = await query;

    if (error) {
      console.error("Error fetching error logs:", error);
      return NextResponse.json(
        { error: "Không thể lấy danh sách lỗi" },
        { status: 500 },
      );
    }

    return NextResponse.json({ errors: errors || [] });
  } catch (error) {
    console.error("Error in error logs API:", error);
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}
