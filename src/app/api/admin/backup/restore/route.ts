import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, supabase } from "@/lib/supabase";

interface BackupData {
  exported_at: string;
  people?: Array<any>;
  families?: Array<any>;
  profiles?: Array<any>;
  contributions?: Array<any>;
  posts?: Array<any>;
  comments?: Array<any>;
  notifications?: Array<any>;
  guest_invitations?: Array<any>;
  plans?: Array<any>;
  subscriptions?: Array<any>;
  user_plan_usage?: Array<any>;
  bank_accounts?: Array<any>;
  payment_orders?: Array<any>;
}

export async function POST(req: NextRequest) {
  try {
    // Parse backup data and backup key from request
    let body;
    try {
      body = await req.json();
    } catch (parseError: any) {
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 },
      );
    }

    const providedKey = body?.backupKey;
    const expectedKey = process.env.KEY_BACKUP;

    if (!providedKey || typeof providedKey !== "string") {
      return NextResponse.json(
        { error: "Backup key is required" },
        { status: 401 },
      );
    }

    if (!expectedKey || typeof expectedKey !== "string") {
      return NextResponse.json(
        { error: "Backup key not configured" },
        { status: 500 },
      );
    }

    const providedKeyBase64 = Buffer.from(providedKey, "utf-8").toString(
      "base64",
    );
    const normalizedProvidedKey =
      providedKeyBase64 === expectedKey ? providedKeyBase64 : providedKey;

    if (normalizedProvidedKey !== expectedKey) {
      return NextResponse.json(
        { error: "Invalid backup key" },
        { status: 403 },
      );
    }

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
      await serviceClient
        .from("contributions")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
      await serviceClient
        .from("payment_orders")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
      await serviceClient
        .from("user_plan_usage")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
      await serviceClient
        .from("subscriptions")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
      await serviceClient
        .from("guest_invitations")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
      await serviceClient
        .from("bank_accounts")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
      await serviceClient
        .from("plans")
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

      if (backupData.plans && backupData.plans.length > 0) {
        const { error: plansError } = await serviceClient
          .from("plans")
          .insert(backupData.plans);
        if (plansError) {
          errors.push(`Plans: ${plansError.message}`);
        } else {
          restoredCount += backupData.plans.length;
        }
      }

      if (backupData.subscriptions && backupData.subscriptions.length > 0) {
        const { error: subscriptionsError } = await serviceClient
          .from("subscriptions")
          .insert(backupData.subscriptions);
        if (subscriptionsError) {
          errors.push(`Subscriptions: ${subscriptionsError.message}`);
        } else {
          restoredCount += backupData.subscriptions.length;
        }
      }

      if (backupData.user_plan_usage && backupData.user_plan_usage.length > 0) {
        const { error: userPlanUsageError } = await serviceClient
          .from("user_plan_usage")
          .insert(backupData.user_plan_usage);
        if (userPlanUsageError) {
          errors.push(`User Plan Usage: ${userPlanUsageError.message}`);
        } else {
          restoredCount += backupData.user_plan_usage.length;
        }
      }

      if (backupData.bank_accounts && backupData.bank_accounts.length > 0) {
        const { error: bankAccountsError } = await serviceClient
          .from("bank_accounts")
          .insert(backupData.bank_accounts);
        if (bankAccountsError) {
          errors.push(`Bank Accounts: ${bankAccountsError.message}`);
        } else {
          restoredCount += backupData.bank_accounts.length;
        }
      }

      if (backupData.payment_orders && backupData.payment_orders.length > 0) {
        const { error: paymentOrdersError } = await serviceClient
          .from("payment_orders")
          .insert(backupData.payment_orders);
        if (paymentOrdersError) {
          errors.push(`Payment Orders: ${paymentOrdersError.message}`);
        } else {
          restoredCount += backupData.payment_orders.length;
        }
      }

      if (backupData.contributions && backupData.contributions.length > 0) {
        const { error: contributionsError } = await serviceClient
          .from("contributions")
          .insert(backupData.contributions);
        if (contributionsError) {
          errors.push(`Contributions: ${contributionsError.message}`);
        } else {
          restoredCount += backupData.contributions.length;
        }
      }

      if (backupData.posts && backupData.posts.length > 0) {
        const { error: postsError } = await serviceClient
          .from("posts")
          .insert(backupData.posts);
        if (postsError) {
          errors.push(`Posts: ${postsError.message}`);
        } else {
          restoredCount += backupData.posts.length;
        }
      }

      if (backupData.comments && backupData.comments.length > 0) {
        const { error: commentsError } = await serviceClient
          .from("comments")
          .insert(backupData.comments);
        if (commentsError) {
          errors.push(`Comments: ${commentsError.message}`);
        } else {
          restoredCount += backupData.comments.length;
        }
      }

      if (backupData.notifications && backupData.notifications.length > 0) {
        const { error: notificationsError } = await serviceClient
          .from("notifications")
          .insert(backupData.notifications);
        if (notificationsError) {
          errors.push(`Notifications: ${notificationsError.message}`);
        } else {
          restoredCount += backupData.notifications.length;
        }
      }

      if (
        backupData.guest_invitations &&
        backupData.guest_invitations.length > 0
      ) {
        const { error: guestInvitationsError } = await serviceClient
          .from("guest_invitations")
          .insert(backupData.guest_invitations);
        if (guestInvitationsError) {
          errors.push(`Guest Invitations: ${guestInvitationsError.message}`);
        } else {
          restoredCount += backupData.guest_invitations.length;
        }
      }
    } catch (error: any) {
      return NextResponse.json(
        { error: error.message || "Restore failed" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      restoredCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}
