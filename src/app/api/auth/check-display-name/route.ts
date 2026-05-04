import { supabase } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const { displayName } = await request.json();

    if (!displayName || displayName.trim().length === 0) {
      return Response.json(
        { exists: false, message: "Tên hiển thị không được để trống" },
        { status: 200 },
      );
    }

    // Query the profiles table to check if display_name exists
    const { data, error } = await supabase
      .from("profiles")
      .select("id")
      .eq("display_name", displayName.trim())
      .single();

    if (error && error.code === "PGRST116") {
      // No row found - display_name doesn't exist
      return Response.json({ exists: false }, { status: 200 });
    }

    if (error) {
      console.error("Error checking display_name:", error);
      return Response.json(
        { exists: false, message: "Lỗi kiểm tra tên hiển thị" },
        { status: 500 },
      );
    }

    // Display_name exists
    return Response.json(
      {
        exists: !!data,
        message: data ? "Tên hiển thị này đã tồn tại" : undefined,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("Error:", err);
    return Response.json(
      { exists: false, message: "Có lỗi xảy ra" },
      { status: 500 },
    );
  }
}
