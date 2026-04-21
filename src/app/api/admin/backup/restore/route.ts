import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, supabase } from "@/lib/supabase";

interface BackupData {
  exported_at: string;
  people?: Array<any>;
  families?: Array<any>;
  profiles?: Array<any>;
}

export async function POST(req: NextRequest) {
  try {
    // Check if user is admin
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Check admin role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Admin required" }, { status: 403 });
    }

    // Parse backup data from request
    const body = await req.json();
    const backupData: BackupData = body.backup;

    if (!backupData || !backupData.exported_at) {
      return NextResponse.json(
        { error: "Invalid backup format" },
        { status: 400 },
      );
    }

    const serviceClient = createServiceClient();
    let restoredCount = 0;
    let errors: string[] = [];

    try {
      // Delete existing data (in order to avoid foreign key conflicts)
      await serviceClient
        .from("comments")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
      await serviceClient
        .from("posts")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
      await serviceClient
        .from("notifications")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
      await serviceClient
        .from("events")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
      await serviceClient.from("families").delete().neq("handle", "");
      await serviceClient.from("people").delete().neq("handle", "");

      // Restore data in correct order
      if (backupData.people && backupData.people.length > 0) {
        const { error: peopleError } = await serviceClient
          .from("people")
          .insert(backupData.people);
        if (peopleError) {
          errors.push(`People: ${peopleError.message}`);
        } else {
          restoredCount += backupData.people.length;
        }
      }

      if (backupData.families && backupData.families.length > 0) {
        const { error: familiesError } = await serviceClient
          .from("families")
          .insert(backupData.families);
        if (familiesError) {
          errors.push(`Families: ${familiesError.message}`);
        } else {
          restoredCount += backupData.families.length;
        }
      }

      if (backupData.profiles && backupData.profiles.length > 0) {
        const { error: profilesError } = await serviceClient
          .from("profiles")
          .upsert(backupData.profiles);
        if (profilesError) {
          errors.push(`Profiles: ${profilesError.message}`);
        } else {
          restoredCount += backupData.profiles.length;
        }
      }

      return NextResponse.json({
        success: errors.length === 0,
        restored_count: restoredCount,
        errors: errors.length > 0 ? errors : null,
        message:
          errors.length === 0
            ? `Khôi phục thành công ${restoredCount} bản ghi`
            : "Khôi phục hoàn tất với một số lỗi",
      });
    } catch (error: any) {
      return NextResponse.json(
        { error: error.message || "Restore failed" },
        { status: 500 },
      );
    }
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}
