import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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

    const { status, notes } = await request.json();
    const { id: errorId } = await params;
    if (!errorId) {
      return NextResponse.json(
        { error: "Error ID is required" },
        { status: 400 },
      );
    }

    // Prepare update data
    const updateData: any = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (notes !== undefined) {
      updateData.notes = notes;
    }

    // If status is 'fixed', set resolved_at and resolved_by
    if (status === "fixed") {
      updateData.resolved_at = new Date().toISOString();
      updateData.resolved_by = user.id;
    }

    // Update error log
    const { data, error } = await supabase
      .from("error_logs")
      .update(updateData)
      .eq("id", errorId)
      .select()
      .single();

    if (error) {
      console.error("Error updating error log:", error);
      return NextResponse.json(
        { error: "Không thể cập nhật lỗi" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Đã cập nhật lỗi",
      error: data,
    });
  } catch (error) {
    console.error("Error in error update API:", error);
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}
