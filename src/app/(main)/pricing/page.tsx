"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Check,
  Clock,
  Copy,
  Crown,
  QrCode,
  Star,
  Wallet,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/components/auth-provider";
import { supabase } from "@/lib/supabase";
import {
  buildManualPaymentDetails,
  getDiscountedAmount,
  normalizeDiscountPercent,
  type ManualPaymentConfig,
  type ManualPaymentDetails,
} from "@/lib/manual-payment";

interface Plan {
  id: string;
  name: string;
  description: string;
  price: number;
  discount_percent?: number | null;
  currency: string;
  duration_days: number;
  is_free: boolean;
  max_uses: number | null;
  people_limit: number;
}

interface Subscription {
  id: string;
  plan_id: string;
  status: string;
  expires_at: string;
}

interface PaymentOrder {
  id: string;
  plan_id: string;
  amount: number;
  currency: string;
  status: "pending" | "confirmed" | "cancelled";
  transfer_note: string;
  created_at: string;
  bank_id: string | null;
  bank_name: string | null;
  account_no: string | null;
  account_name: string | null;
  plan?: {
    name: string;
  } | null;
}

interface ActiveManualOrder {
  id: string;
  planId: string;
  planName: string;
  createdAt: string;
  payment: ManualPaymentDetails;
}

function getPlanPriceSummary(plan: Plan) {
  const discountPercent = normalizeDiscountPercent(plan.discount_percent);
  const originalPrice = Number(plan.price || 0);
  const discountedPrice = getDiscountedAmount(originalPrice, discountPercent);

  return {
    originalPrice,
    discountedPrice,
    discountPercent,
    hasDiscount: discountPercent > 0 && discountedPrice < originalPrice,
  };
}

export default function PricingPage() {
  const { user, profile, refreshProfile, session } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [paymentOrders, setPaymentOrders] = useState<PaymentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [activeOrder, setActiveOrder] = useState<ActiveManualOrder | null>(
    null,
  );

  const fetchPlans = useCallback(async () => {
    const { data } = await supabase.from("plans").select("*").order("price");
    if (data) setPlans(data);
  }, []);

  const fetchSubscriptions = useCallback(async () => {
    if (!user) return;

    const { data } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active");

    if (data) setSubscriptions(data);
  }, [user]);

  const fetchPendingOrders = useCallback(async () => {
    if (!user) return;

    const { data } = await supabase
      .from("payment_orders")
      .select(
        "id, plan_id, amount, currency, status, transfer_note, created_at, bank_id, bank_name, account_no, account_name, plan:plans(name)",
      )
      .eq("user_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    // Handle the plan array issue
    const processedData = (data || []).map((order) => ({
      ...order,
      plan: Array.isArray(order.plan) ? order.plan[0] : order.plan,
    }));

    setPaymentOrders(processedData as PaymentOrder[]);
  }, [user]);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      setLoading(true);
      await fetchPlans();

      if (user) {
        await Promise.all([fetchSubscriptions(), fetchPendingOrders()]);
      } else if (!cancelled) {
        setSubscriptions([]);
        setPaymentOrders([]);
      }

      if (!cancelled) {
        setLoading(false);
      }
    };

    void loadData();

    return () => {
      cancelled = true;
    };
  }, [fetchPendingOrders, fetchPlans, fetchSubscriptions, user]);

  const upgradeRole = async (planId: string) => {
    if (!user) return;

    setUpgrading(planId);
    try {
      const { data, error } = await supabase.rpc("upgrade_user_role", {
        p_user_id: user.id,
        p_plan_id: planId,
      });

      if (error) {
        toast.error("Lỗi: " + error.message);
      } else if (data === "Success") {
        toast.success("Nâng cấp thành công.");
        await new Promise((resolve) => setTimeout(resolve, 1500));
        await refreshProfile();
        await fetchSubscriptions();
      } else if (typeof data === "string" && data.startsWith("Error:")) {
        toast.error(data);
      } else {
        toast.info(data);
      }
    } catch (err) {
      toast.error("Có lỗi xảy ra.");
      console.error("Upgrade error:", err);
    }
    setUpgrading(null);
  };

  const createManualOrder = async (plan: Plan) => {
    if (!session?.access_token) {
      toast.error("Bạn cần đăng nhập lại để tạo đơn thanh toán.");
      return;
    }

    setUpgrading(plan.id);
    try {
      const response = await fetch("/api/payments/manual/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ planId: plan.id }),
      });

      const result = await response.json();
      if (!response.ok) {
        toast.error(result.error || "Không thể tạo đơn thanh toán.");
        return;
      }

      const order = result.order;
      const nextOrder: ActiveManualOrder = {
        id: order.id,
        planId: plan.id,
        planName: order.plan_name || plan.name,
        createdAt: order.created_at,
        payment: order.payment,
      };

      setActiveOrder(nextOrder);
      await fetchPendingOrders();
      toast.success("Đã tạo đơn. Chuyển khoản đúng nội dung để được xác nhận.");
    } catch (error) {
      toast.error("Không thể tạo đơn thanh toán.");
      console.error(error);
    } finally {
      setUpgrading(null);
    }
  };

  const openPendingOrder = (order: PaymentOrder) => {
    const config: ManualPaymentConfig = {
      bankId: order.bank_id || "",
      bankName: order.bank_name || "",
      accountNo: order.account_no || "",
      accountName: order.account_name || "",
    };

    setActiveOrder({
      id: order.id,
      planId: order.plan_id,
      planName: order.plan?.name || "Gói nâng cấp",
      createdAt: order.created_at,
      payment: buildManualPaymentDetails({
        amount: order.amount,
        transferNote: order.transfer_note,
        config,
      }),
    });
  };

  const getCurrentSubscription = (planId: string) => {
    return subscriptions.find((sub) => sub.plan_id === planId);
  };

  const getActiveSubscription = () => {
    return subscriptions.find(
      (sub) => sub.status === "active" && new Date(sub.expires_at) > new Date(),
    );
  };

  const getPendingOrder = (planId: string) => {
    return paymentOrders.find((order) => order.plan_id === planId);
  };

  const isPlanAvailable = (plan: Plan) => {
    const currentSub = getCurrentSubscription(plan.id);
    if (currentSub) return false;

    // Check if user has any active subscription for other plans
    const hasActiveSubscription = subscriptions.some((sub) => {
      if (sub.plan_id === plan.id) return false; // Skip current plan check
      return sub.status === "active" && new Date(sub.expires_at) > new Date();
    });

    if (hasActiveSubscription) return false;

    if (plan.is_free) {
      return true;
    }

    return true;
  };

  const getUserRoleDisplay = () => {
    if (!profile) return "Chưa đăng nhập";

    switch (profile.role) {
      case "admin":
        return "Admin";
      case "user":
        return "Người dùng (Premium)";
      case "viewer":
        return "Người xem";
      case "guest":
        return "Khách";
      default:
        return profile.role || "Không xác định";
    }
  };

  const copyValue = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`Đã sao chép ${label}.`);
    } catch {
      toast.error(`Không thể sao chép ${label}.`);
    }
  };

  if (profile?.role === "guest") {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Không có quyền truy cập
          </h1>
          <p className="text-gray-600">
            Tài khoản khách không thể truy cập trang nâng cấp.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4 flex items-center justify-center gap-2">
          <Crown className="h-8 w-8 text-yellow-500" />
          Nâng Cấp Tài Khoản
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Gói miễn phí vẫn kích hoạt ngay. Gói trả phí sẽ tạo đơn chuyển khoản
          thủ công với QR để bạn thanh toán nhanh và admin xác nhận.
        </p>
        {user && (
          <div className="mt-4 p-4 bg-muted rounded-lg inline-block">
            <div className="text-sm text-muted-foreground">Cấp độ hiện tại</div>
            <div className="text-lg font-semibold">{getUserRoleDisplay()}</div>
          </div>
        )}
      </div>

      {paymentOrders.length > 0 && (
        <Card className="max-w-4xl mx-auto mb-8 border-amber-300 bg-amber-50/60">
          <CardContent className="p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="font-semibold text-amber-900">
                  Bạn có {paymentOrders.length} đơn chuyển khoản đang chờ xác
                  nhận
                </div>
                <div className="text-sm text-amber-800">
                  Nếu đã chuyển khoản, hãy chờ admin xác nhận hoặc mở lại QR để
                  kiểm tra nội dung chuyển khoản.
                </div>
              </div>
              <Button
                variant="outline"
                className="border-amber-300 bg-white"
                onClick={() => openPendingOrder(paymentOrders[0])}
              >
                <QrCode className="mr-2 h-4 w-4" />
                Xem đơn gần nhất
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
        {plans.map((plan) => {
          const currentSub = getCurrentSubscription(plan.id);
          const pendingOrder = getPendingOrder(plan.id);
          const isAvailable = isPlanAvailable(plan);
          const priceSummary = getPlanPriceSummary(plan);

          return (
            <Card
              key={plan.id}
              className={`relative ${!isAvailable ? "opacity-60" : ""}`}
            >
              {plan.is_free ? (
                <Badge className="absolute -top-2 left-4 bg-green-500">
                  <Star className="h-3 w-3 mr-1" />
                  Free
                </Badge>
              ) : (
                <Badge className="absolute -top-2 left-4 bg-amber-600">
                  <Wallet className="h-3 w-3 mr-1" />
                  Chuyển khoản QR
                </Badge>
              )}

              <CardHeader className="text-center">
                <CardTitle className="text-2xl">{plan.name}</CardTitle>
                {priceSummary.hasDiscount && (
                  <div className="space-y-1">
                    <div className="text-3xl font-bold text-primary">
                      {priceSummary.discountedPrice.toLocaleString("vi-VN")}{" "}
                      {plan.currency}
                    </div>
                    <Badge
                      variant="secondary"
                      className="bg-rose-100 text-rose-700"
                    >
                      Sele {priceSummary.discountPercent}%
                    </Badge>
                  </div>
                )}
                <div
                  className={
                    priceSummary.hasDiscount
                      ? "text-sm text-muted-foreground line-through"
                      : "text-3xl font-bold text-primary"
                  }
                >
                  {plan.price === 0
                    ? "Miễn phí"
                    : `${plan.price.toLocaleString("vi-VN")} ${plan.currency}`}
                </div>
                <p className="text-sm text-muted-foreground">
                  {plan.description}
                </p>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    <span>Nâng cấp từ người xem lên người dùng</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-blue-500" />
                    <span>{plan.duration_days} ngày sử dụng</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-orange-500" />
                    <span>Giới hạn {plan.people_limit} thành viên</span>
                  </div>
                  {plan.is_free && plan.max_uses && (
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-orange-500" />
                      <span>Giới hạn {plan.max_uses} lần sử dụng</span>
                    </div>
                  )}
                </div>

                {currentSub && (
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <div className="text-sm font-medium text-blue-800">
                      Đang active
                    </div>
                    <div className="text-xs text-blue-600">
                      Hết hạn:{" "}
                      {new Date(currentSub.expires_at).toLocaleDateString(
                        "vi-VN",
                      )}
                    </div>
                  </div>
                )}

                {pendingOrder && (
                  <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                    <div className="text-sm font-medium text-amber-900">
                      Đang chờ xác nhận chuyển khoản
                    </div>
                    <div className="text-xs text-amber-700 mt-1">
                      Nội dung: {pendingOrder.transfer_note}
                    </div>
                  </div>
                )}

                {(() => {
                  const activeSub = getActiveSubscription();
                  const isDisabled =
                    !user ||
                    !isPlanAvailable(plan) ||
                    upgrading === plan.id ||
                    (loading && !plan.is_free);

                  if (isDisabled && activeSub && !currentSub) {
                    return (
                      <div className="space-y-2">
                        <div className="p-2 bg-orange-50 rounded text-sm text-orange-700 text-center">
                          Bạn đang có gói active khác. Chỉ có thể mua gói mới
                          khi gói hiện tại hết hạn.
                        </div>
                        <Button className="w-full" disabled={true}>
                          Không thể mua
                        </Button>
                      </div>
                    );
                  }

                  return (
                    <Button
                      className="w-full"
                      onClick={() => {
                        if (plan.is_free) {
                          upgradeRole(plan.id);
                        } else if (pendingOrder) {
                          openPendingOrder(pendingOrder);
                        } else {
                          createManualOrder(plan);
                        }
                      }}
                      disabled={isDisabled}
                      variant={plan.is_free ? "outline" : "default"}
                    >
                      {upgrading === plan.id ? (
                        <>Đang xử lý...</>
                      ) : !user ? (
                        "Đăng nhập để nâng cấp"
                      ) : currentSub ? (
                        "Đang sử dụng"
                      ) : plan.is_free ? (
                        "Dùng thử miễn phí"
                      ) : pendingOrder ? (
                        "Xem QR chuyển khoản"
                      ) : (
                        "Tạo đơn chuyển khoản"
                      )}
                    </Button>
                  );
                })()}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="mt-12 text-center">
        <div className="bg-muted p-6 rounded-lg max-w-2xl mx-auto">
          <h3 className="text-lg font-semibold mb-2">Lưu ý quan trọng</h3>
          <ul className="text-sm text-muted-foreground space-y-1 text-left">
            <li>
              • Chuyển khoản đúng số tiền và đúng nội dung để admin đối soát.
            </li>
            <li>• Gói trả phí chỉ được kích hoạt sau khi admin xác nhận.</li>
            <li>• Gói miễn phí vẫn được xử lý ngay trong hệ thống.</li>
            <li>• Tài khoản sẽ tự động về người xem khi gói hết hạn.</li>
          </ul>
        </div>
      </div>

      <Dialog
        open={!!activeOrder}
        onOpenChange={(open) => !open && setActiveOrder(null)}
      >
        <DialogContent className="sm:max-w-xl">
          {activeOrder && (
            <>
              <DialogHeader>
                <DialogTitle>
                  Chuyển khoản cho {activeOrder.planName}
                </DialogTitle>
                <DialogDescription>
                  Sau khi chuyển khoản, admin sẽ xác nhận và kích hoạt gói cho
                  bạn. Đơn tạo lúc{" "}
                  {new Date(activeOrder.createdAt).toLocaleString("vi-VN")}.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-5 md:grid-cols-[220px_1fr]">
                <div className="rounded-lg border bg-muted/30 p-3">
                  {activeOrder.payment.qrImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={activeOrder.payment.qrImageUrl}
                      alt="QR chuyển khoản"
                      className="w-full rounded-md border bg-white"
                    />
                  ) : (
                    <div className="flex h-55 items-center justify-center rounded-md border bg-background text-center text-sm text-muted-foreground">
                      Chưa cấu hình QR. Bạn vẫn có thể chuyển khoản thủ công
                      bằng thông tin bên cạnh.
                    </div>
                  )}
                </div>

                <div className="space-y-3 text-sm">
                  <InfoRow
                    label="Ngân hàng"
                    value={activeOrder.payment.bankName}
                  />
                  <InfoRow
                    label="Số tài khoản"
                    value={activeOrder.payment.accountNo || "Chưa cấu hình"}
                    onCopy={
                      activeOrder.payment.accountNo
                        ? () =>
                            copyValue(
                              activeOrder.payment.accountNo,
                              "số tài khoản",
                            )
                        : undefined
                    }
                  />
                  <InfoRow
                    label="Chủ tài khoản"
                    value={activeOrder.payment.accountName || "Chưa cấu hình"}
                    onCopy={
                      activeOrder.payment.accountName
                        ? () =>
                            copyValue(
                              activeOrder.payment.accountName,
                              "tên chủ tài khoản",
                            )
                        : undefined
                    }
                  />
                  <InfoRow
                    label="Số tiền"
                    value={`${activeOrder.payment.amount.toLocaleString("vi-VN")} VND`}
                    onCopy={() =>
                      copyValue(
                        String(activeOrder.payment.amount),
                        "số tiền thanh toán",
                      )
                    }
                  />
                  <InfoRow
                    label="Nội dung"
                    value={activeOrder.payment.transferNote}
                    onCopy={() =>
                      copyValue(
                        activeOrder.payment.transferNote,
                        "nội dung chuyển khoản",
                      )
                    }
                  />

                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
                    Chuyển khoản đúng số tiền và đúng nội dung để admin xác nhận
                    tự động theo đơn này.
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoRow({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy?: () => void;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 flex items-center justify-between gap-3">
        <div className="font-medium break-all">{value}</div>
        {onCopy && (
          <Button variant="outline" size="sm" onClick={onCopy}>
            <Copy className="mr-2 h-4 w-4" />
            Sao chép
          </Button>
        )}
      </div>
    </div>
  );
}
