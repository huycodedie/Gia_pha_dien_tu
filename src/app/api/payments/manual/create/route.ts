import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import {
  buildManualPaymentDetails,
  buildQrPayload,
  buildTransferNote,
  getDiscountedAmount,
  type ManualPaymentConfig,
} from "@/lib/manual-payment";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { planId } = await req.json();
    if (!planId) {
      return NextResponse.json(
        { error: "Thiếu thông tin gói nâng cấp." },
        { status: 400 },
      );
    }

    const supabase = createServiceClient();
    const token = authHeader.substring(7);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const [{ data: profile }, { data: plan }, { data: activeSub }] =
      await Promise.all([
        supabase.from("profiles").select("role").eq("id", user.id).single(),
        supabase
          .from("plans")
          .select(
            "id, name, description, price, currency, is_free, discount_percent",
          )
          .eq("id", planId)
          .single(),
        supabase
          .from("subscriptions")
          .select("id")
          .eq("user_id", user.id)
          .eq("plan_id", planId)
          .eq("status", "active")
          .maybeSingle(),
      ]);

    const { data: activeBankAccount } = await supabase
      .from("bank_accounts")
      .select("bank_id, bank_name, account_no, account_name")
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (profile?.role === "guest") {
      return NextResponse.json(
        { error: "Tài khoản khách không thể tạo đơn nâng cấp." },
        { status: 403 },
      );
    }

    if (!plan) {
      return NextResponse.json(
        { error: "Không tìm thấy gói nâng cấp." },
        { status: 404 },
      );
    }

    if (!activeBankAccount) {
      return NextResponse.json(
        { error: "Chưa có tài khoản ngân hàng đang hoạt động để nhận chuyển khoản." },
        { status: 400 },
      );
    }

    const amount = getDiscountedAmount(plan.price, plan.discount_percent);

    if (plan.is_free || amount <= 0) {
      return NextResponse.json(
        { error: "Gói này không cần thanh toán thủ công." },
        { status: 400 },
      );
    }

    if (activeSub) {
      return NextResponse.json(
        { error: "Bạn đang có gói này còn hiệu lực." },
        { status: 409 },
      );
    }

    const { data: canUsePlan, error: canUsePlanError } = await supabase.rpc(
      "can_use_plan",
      {
        p_user_id: user.id,
        p_plan_id: planId,
      },
    );

    if (canUsePlanError) {
      return NextResponse.json(
        { error: canUsePlanError.message },
        { status: 500 },
      );
    }

    if (!canUsePlan) {
      return NextResponse.json(
        { error: "Bạn đã dùng hết số lần cho gói này." },
        { status: 409 },
      );
    }

    const { data: existingPending } = await supabase
      .from("payment_orders")
      .select(
        "id, amount, currency, transfer_note, status, created_at, bank_id, bank_name, account_no, account_name",
      )
      .eq("user_id", user.id)
      .eq("plan_id", planId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingPending) {
      const config: ManualPaymentConfig = {
        bankId: existingPending.bank_id || activeBankAccount.bank_id,
        bankName: existingPending.bank_name || activeBankAccount.bank_name,
        accountNo: existingPending.account_no || activeBankAccount.account_no,
        accountName:
          existingPending.account_name || activeBankAccount.account_name,
      };
      const transferNote = existingPending.transfer_note.startsWith("TMP-")
        ? buildTransferNote(existingPending.id)
        : existingPending.transfer_note;
      const qrPayload = buildQrPayload(
        transferNote,
        Number(existingPending.amount),
        config,
      );

      if (
        transferNote !== existingPending.transfer_note ||
        !existingPending.transfer_note
      ) {
        await supabase
          .from("payment_orders")
          .update({
            transfer_note: transferNote,
            qr_payload: qrPayload,
            bank_id: config.bankId,
            bank_name: config.bankName,
            account_no: config.accountNo,
            account_name: config.accountName,
          })
          .eq("id", existingPending.id);
      }

      return NextResponse.json({
        success: true,
        order: {
          ...existingPending,
          transfer_note: transferNote,
          plan_name: plan.name,
          original_amount: Number(plan.price),
          discount_percent: Number(plan.discount_percent || 0),
          payment: buildManualPaymentDetails({
            amount: existingPending.amount,
            transferNote,
            config,
          }),
        },
      });
    }

    const config: ManualPaymentConfig = {
      bankId: activeBankAccount.bank_id,
      bankName: activeBankAccount.bank_name,
      accountNo: activeBankAccount.account_no,
      accountName: activeBankAccount.account_name,
    };
    const { data: createdOrder, error: createError } = await supabase
      .from("payment_orders")
      .insert({
        user_id: user.id,
        plan_id: plan.id,
        amount,
        currency: plan.currency || "VND",
        transfer_note: `TMP-${Date.now()}`,
        qr_payload: "{}",
        bank_id: config.bankId,
        bank_name: config.bankName,
        account_no: config.accountNo,
        account_name: config.accountName,
      })
      .select("id, amount, currency")
      .single();

    if (createError || !createdOrder) {
      return NextResponse.json(
        { error: createError?.message || "Không thể tạo đơn thanh toán." },
        { status: 500 },
      );
    }

    const transferNote = buildTransferNote(createdOrder.id);
    const qrPayload = buildQrPayload(transferNote, amount, config);

    const { data: finalizedOrder, error: finalizeError } = await supabase
      .from("payment_orders")
      .update({
        transfer_note: transferNote,
        qr_payload: qrPayload,
      })
      .eq("id", createdOrder.id)
      .select("id, amount, currency, transfer_note, status, created_at")
      .single();

    if (finalizeError || !finalizedOrder) {
      return NextResponse.json(
        { error: finalizeError?.message || "Không thể cập nhật đơn thanh toán." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      order: {
        ...finalizedOrder,
        plan_name: plan.name,
        original_amount: Number(plan.price),
        discount_percent: Number(plan.discount_percent || 0),
        payment: buildManualPaymentDetails({
          amount,
          transferNote,
          config,
        }),
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
