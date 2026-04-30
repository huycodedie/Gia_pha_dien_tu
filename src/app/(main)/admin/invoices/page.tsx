"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Filter, Loader2, Receipt } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getDiscountedAmount,
  normalizeDiscountPercent,
} from "@/lib/manual-payment";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth-provider";

interface Subscription {
  id: string;
  user_id: string;
  plan_id: string;
  status: string;
  starts_at: string;
  expires_at: string;
  created_at: string;
  plan: {
    name: string;
    price: number;
    discount_percent?: number | null;
    currency: string;
    duration_days: number;
  };
  profile: {
    email: string;
    display_name: string | null;
  };
}

interface PaymentOrder {
  id: string;
  user_id: string;
  plan_id: string;
  amount: number;
  currency: string;
  status: "pending" | "confirmed" | "cancelled";
  transfer_note: string;
  admin_note: string | null;
  created_at: string;
  confirmed_at: string | null;
  cancelled_at: string | null;
  plan?: {
    name: string;
    price?: number | null;
    discount_percent?: number | null;
    currency?: string | null;
    duration_days: number;
  } | null;
  profile?: {
    email: string;
    display_name: string | null;
  };
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

const SUBSCRIPTION_STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  expired: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
  cancelled: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300",
};

const ORDER_STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
  confirmed:
    "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
};

function PriceDisplay({
  originalPrice,
  paidAmount,
  currency,
  discountPercent,
}: {
  originalPrice?: number | null;
  paidAmount: number;
  currency: string;
  discountPercent?: number | null;
}) {
  const normalizedDiscount = normalizeDiscountPercent(discountPercent);
  const hasOriginalPrice = Number.isFinite(Number(originalPrice));
  const normalizedOriginalPrice = hasOriginalPrice
    ? Number(originalPrice)
    : null;
  const computedPaidAmount =
    normalizedOriginalPrice !== null
      ? getDiscountedAmount(normalizedOriginalPrice, normalizedDiscount)
      : Number(paidAmount);
  const hasDiscount =
    normalizedOriginalPrice !== null &&
    normalizedDiscount > 0 &&
    computedPaidAmount < normalizedOriginalPrice;

  return (
    <div className="space-y-1">
      <div className="font-medium">
        {Number(paidAmount).toLocaleString("vi-VN")} {currency}
      </div>
      {hasDiscount && (
        <div className="text-xs text-muted-foreground">
          <div>
            Giá gốc: {normalizedOriginalPrice.toLocaleString("vi-VN")}{" "}
            {currency}
          </div>
          <div className="text-emerald-700">Giảm {normalizedDiscount}%</div>
        </div>
      )}
    </div>
  );
}

export default function AdminInvoicesPage() {
  const { isAdmin, loading: authLoading, session } = useAuth();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [paymentOrders, setPaymentOrders] = useState<PaymentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingOrderId, setProcessingOrderId] = useState<string | null>(
    null,
  );
  const [searchEmail, setSearchEmail] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [subscriptionRevenue, setSubscriptionRevenue] = useState(0);
  const [orderRevenue, setOrderRevenue] = useState(0);

  const fetchSubscriptions = useCallback(async () => {
    const { data, error } = await supabase
      .from("subscriptions")
      .select(
        `
          id,
          user_id,
          plan_id,
          status,
          starts_at,
          expires_at,
          created_at,
          plan:plans(name, price, discount_percent, currency, duration_days)
        `,
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching subscriptions:", error.message);
      return;
    }

    // Fetch profile data separately for each subscription
    const subscriptionsWithProfiles = await Promise.all(
      (data || []).map(async (sub) => {
        const { data: profile } = await supabase
          .from("profiles")
          .select("email, display_name")
          .eq("id", sub.user_id)
          .single();

        return {
          ...sub,
          plan: Array.isArray(sub.plan) ? sub.plan[0] : sub.plan,
          profile: profile || { email: "N/A", display_name: null },
        };
      }),
    );

    setSubscriptions(subscriptionsWithProfiles);

  }, []);

  const fetchPaymentOrders = useCallback(async () => {
    const { data, error } = await supabase
      .from("payment_orders")
      .select(
        "id, user_id, plan_id, amount, currency, status, transfer_note, admin_note, created_at, confirmed_at, cancelled_at, plan:plans(name, price, discount_percent, currency, duration_days)",
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching payment orders:", error.message);
      return;
    }

    const orders = ((data as unknown as PaymentOrder[]) || []).map((order) => ({
      ...order,
      profile: {
        email: order.user_id,
        display_name: null,
      },
    }));

    const userIds = [...new Set(orders.map((order) => order.user_id))];
    if (userIds.length === 0) {
      setPaymentOrders([]);
      return;
    }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email, display_name")
      .in("id", userIds);

    const profileMap = new Map(
      (profiles || []).map((item) => [
        item.id,
        { email: item.email, display_name: item.display_name },
      ]),
    );

    setPaymentOrders(
      orders.map((order) => ({
        ...order,
        profile: profileMap.get(order.user_id) || order.profile,
      })),
    );

    const revenue = orders
      .filter((order) => order.status === "confirmed")
      .reduce((sum, order) => sum + Number(order.amount || 0), 0);

    setOrderRevenue(revenue);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchSubscriptions(), fetchPaymentOrders()]);
    setLoading(false);
  }, [fetchPaymentOrders, fetchSubscriptions]);
  useEffect(() => {
    setTotalRevenue( orderRevenue);
  }, [orderRevenue]);

  useEffect(() => {
    if (!authLoading && isAdmin) {
      void fetchData();
    }
  }, [authLoading, fetchData, isAdmin]);

  const mutateOrder = async (orderId: string, action: "confirm" | "cancel") => {
    if (!session?.access_token) {
      toast.error("Phiên đăng nhập đã hết hạn.");
      return;
    }

    setProcessingOrderId(orderId);
    try {
      const response = await fetch(
        `/api/admin/manual-payments/${orderId}/${action}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({}),
        },
      );

      const result = await response.json();
      if (!response.ok) {
        toast.error(result.error || "Không thể cập nhật đơn.");
        return;
      }

      toast.success(
        action === "confirm"
          ? "Đã xác nhận thanh toán."
          : "Đã hủy đơn thanh toán.",
      );
      await fetchData();
    } catch (error) {
      toast.error("Không thể cập nhật đơn thanh toán.");
      console.error(error);
    } finally {
      setProcessingOrderId(null);
    }
  };

  const filteredSubscriptions = subscriptions.filter((sub) => {
    const keyword = searchEmail.toLowerCase();
    const matchesEmail =
      sub.profile.email?.toLowerCase().includes(keyword) ||
      sub.profile.display_name?.toLowerCase().includes(keyword);
    const matchesStatus = filterStatus === "all" || sub.status === filterStatus;
    return matchesEmail && matchesStatus;
  });

  const filteredPendingOrders = paymentOrders.filter((order) => {
    const keyword = searchEmail.toLowerCase();
    const matchesEmail =
      order.profile?.email?.toLowerCase().includes(keyword) ||
      order.profile?.display_name?.toLowerCase().includes(keyword) ||
      order.transfer_note.toLowerCase().includes(keyword);
    const matchesPendingSection =
      order.status === "pending" &&
      (filterStatus === "all" || order.status === filterStatus);
    return matchesEmail && matchesPendingSection;
  });

  const filteredHistoryOrders = paymentOrders.filter((order) => {
    const keyword = searchEmail.toLowerCase();
    const matchesEmail =
      order.profile?.email?.toLowerCase().includes(keyword) ||
      order.profile?.display_name?.toLowerCase().includes(keyword) ||
      order.transfer_note.toLowerCase().includes(keyword);
    const matchesStatus =
      filterStatus === "all" || order.status === filterStatus;
    return (
      matchesEmail &&
      (order.status === "confirmed" || order.status === "cancelled") &&
      matchesStatus
    );
  });

  const exportToCSV = () => {
    const headers = [
      "Loai",
      "Email",
      "Ten nguoi dung",
      "Goi",
      "So tien",
      "Trang thai",
      "Noi dung chuyen khoan",
      "Ngay tao",
    ];

    const pendingRows = filteredPendingOrders.map((order) => [
      "Manual payment",
      order.profile?.email || order.user_id,
      order.profile?.display_name || "N/A",
      order.plan?.name || "N/A",
      order.plan?.price &&
      normalizeDiscountPercent(order.plan.discount_percent) > 0
        ? `${Number(order.plan.price).toLocaleString("vi-VN")} ${order.plan.currency || order.currency} -> ${Number(order.amount).toLocaleString("vi-VN")} ${order.currency} (-${normalizeDiscountPercent(order.plan.discount_percent)}%)`
        : `${Number(order.amount).toLocaleString("vi-VN")} ${order.currency}`,
      order.status,
      order.transfer_note,
      formatDateTime(order.created_at),
    ]);

    const historyOrderRows = filteredHistoryOrders.map((order) => [
      order.status === "confirmed" ? "Confirmed payment" : "Cancelled payment",
      order.profile?.email || order.user_id,
      order.profile?.display_name || "N/A",
      order.plan?.name || "N/A",
      order.plan?.price &&
      normalizeDiscountPercent(order.plan.discount_percent) > 0
        ? `${Number(order.plan.price).toLocaleString("vi-VN")} ${order.plan.currency || order.currency} -> ${Number(order.amount).toLocaleString("vi-VN")} ${order.currency} (-${normalizeDiscountPercent(order.plan.discount_percent)}%)`
        : `${Number(order.amount).toLocaleString("vi-VN")} ${order.currency}`,
      order.status,
      order.transfer_note,
      formatDateTime(
        order.status === "confirmed"
          ? order.confirmed_at || order.created_at
          : order.cancelled_at || order.created_at,
      ),
    ]);

    const subscriptionRows = filteredSubscriptions.map((sub) => [
      "Subscription",
      sub.profile.email,
      sub.profile.display_name || "N/A",
      sub.plan.name,
      normalizeDiscountPercent(sub.plan.discount_percent) > 0
        ? `${sub.plan.price?.toLocaleString("vi-VN")} ${sub.plan.currency} -> ${getDiscountedAmount(sub.plan.price, sub.plan.discount_percent).toLocaleString("vi-VN")} ${sub.plan.currency} (-${normalizeDiscountPercent(sub.plan.discount_percent)}%)`
        : `${sub.plan.price?.toLocaleString("vi-VN")} ${sub.plan.currency}`,
      sub.status,
      "",
      formatDateTime(sub.created_at),
    ]);

    const csv = [
      headers.join(","),
      ...pendingRows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
      ...historyOrderRows.map((row) =>
        row.map((cell) => `"${cell}"`).join(","),
      ),
      ...subscriptionRows.map((row) =>
        row.map((cell) => `"${cell}"`).join(","),
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `manual-payments-${new Date().toISOString().split("T")[0]}.csv`,
    );
    link.click();
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="text-center py-10">
        <p className="text-red-600">Bạn không có quyền truy cập trang này</p>
      </div>
    );
  }

  const pendingCount = paymentOrders.filter(
    (order) => order.status === "pending",
  ).length;
  const confirmedCount = paymentOrders.filter(
    (order) => order.status === "confirmed",
  ).length;
  const cancelledCount = paymentOrders.filter(
    (order) => order.status === "cancelled",
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Receipt className="h-6 w-6" />
            Hóa đơn nâng cấp
          </h1>
          <p className="text-muted-foreground">
            Quản lý đơn chuyển khoản thủ công và lịch sử kích hoạt gói nâng cấp
          </p>
        </div>
        <Button onClick={exportToCSV} variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Xuất CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Đơn chờ xác nhận
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">{pendingCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Đơn đã xác nhận
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">
              {confirmedCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Đơn đã hủy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">{cancelledCount}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Tổng doanh thu
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {totalRevenue.toLocaleString("vi-VN")} VND
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Đơn chuyển khoản thủ công chưa xác nhận (
            {filteredPendingOrders.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Tên người dùng</TableHead>
                  <TableHead>Gói</TableHead>
                  <TableHead>Số tiền</TableHead>
                  <TableHead>Nội dung chuyển khoản</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Ngày tạo</TableHead>
                  <TableHead>Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPendingOrders.length > 0 ? (
                  filteredPendingOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">
                        {order.profile?.email || order.user_id}
                      </TableCell>
                      <TableCell>
                        {order.profile?.display_name || "N/A"}
                      </TableCell>
                      <TableCell>{order.plan?.name || "N/A"}</TableCell>
                      <TableCell>
                        <PriceDisplay
                          originalPrice={order.plan?.price}
                          paidAmount={Number(order.amount)}
                          currency={order.plan?.currency || order.currency}
                          discountPercent={order.plan?.discount_percent}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {order.transfer_note}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={ORDER_STATUS_COLORS[order.status] || ""}
                        >
                          Chờ xác nhận
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDateTime(order.created_at)}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => mutateOrder(order.id, "confirm")}
                            disabled={processingOrderId === order.id}
                          >
                            Xác nhận
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => mutateOrder(order.id, "cancel")}
                            disabled={processingOrderId === order.id}
                          >
                            Hủy
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center text-muted-foreground py-8"
                    >
                      Không có đơn chuyển khoản nào đang chờ xác nhận
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Bộ lọc
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-medium">Tìm kiếm</label>
            <Input
              placeholder="Nhập email, tên hoặc mã chuyển khoản..."
              value={searchEmail}
              onChange={(e) => setSearchEmail(e.target.value)}
              className="mt-2"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Trạng thái</label>
            <select
              className="w-full rounded-md border px-3 py-2 text-sm bg-background mt-2"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">Tất cả</option>
              <option value="confirmed">Đã xác nhận</option>
              <option value="cancelled">Đã hủy</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Lịch sử đơn đã xử lý (
            {filteredSubscriptions.length + filteredHistoryOrders.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Tên người dùng</TableHead>
                  <TableHead>Gói nâng cấp</TableHead>
                  <TableHead>Loại</TableHead>
                  <TableHead>Giá</TableHead>
                  <TableHead>Nội dung chuyển khoản</TableHead>
                  <TableHead>Thời hạn</TableHead>
                  <TableHead>Ngày tạo H/Đ</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Ngày X/N hóa đơn</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredHistoryOrders.length>
                0 ? (
                  <>
                    {filteredHistoryOrders.map((order) => (
                      <TableRow key={`history-${order.id}`}>
                        <TableCell className="font-medium">
                          {order.profile?.email || order.user_id}
                        </TableCell>
                        <TableCell>
                          {order.profile?.display_name || "N/A"}
                        </TableCell>
                        <TableCell>{order.plan?.name || "N/A"}</TableCell>
                        <TableCell>
                          <Badge className={ORDER_STATUS_COLORS[order.status]}>
                            {order.status === "confirmed"
                              ? "Chuyển khoản"
                              : "Thất bại"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <PriceDisplay
                            originalPrice={order.plan?.price}
                            paidAmount={Number(order.amount)}
                            currency={order.plan?.currency || order.currency}
                            discountPercent={order.plan?.discount_percent}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {order.transfer_note}
                        </TableCell>
                        <TableCell>
                          {order.plan?.duration_days || 0} ngày
                        </TableCell>
                        <TableCell>
                          {formatDateTime(order.created_at)}
                        </TableCell>
                        <TableCell>
                          <Badge className={ORDER_STATUS_COLORS[order.status]}>
                            {order.status === "confirmed"
                              ? "Đã xác nhận"
                              : "Đã hủy"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {formatDateTime(
                            order.status === "confirmed"
                              ? order.confirmed_at || order.created_at
                              : order.cancelled_at || order.created_at,
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </>
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={10}
                      className="text-center text-muted-foreground py-8"
                    >
                      Không tìm thấy lịch sử đơn đã xử lý
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Gói đang subscription (
            {filteredSubscriptions.length + filteredHistoryOrders.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Tên người dùng</TableHead>
                  <TableHead>Gói nâng cấp</TableHead>
                  <TableHead>Loại</TableHead>
                  <TableHead>Giá</TableHead>
                  <TableHead>Thời hạn</TableHead>     
                  <TableHead>Ngày hết hạn</TableHead>         
                  <TableHead>Trạng thái</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSubscriptions.length >
                0 ? (
                  <>
                    {filteredSubscriptions.map((sub) => (
                      <TableRow key={sub.id}>
                        <TableCell className="font-medium">
                          {sub.profile.email}
                        </TableCell>
                        <TableCell>
                          {sub.profile.display_name || "N/A"}
                        </TableCell>
                        <TableCell>{sub.plan.name}</TableCell>
                        <TableCell>
                          <Badge
                            className={
                              SUBSCRIPTION_STATUS_COLORS[sub.status] || ""
                            }
                          >
                            Subscription
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <PriceDisplay
                            originalPrice={sub.plan.price}
                            paidAmount={getDiscountedAmount(
                              sub.plan.price,
                              sub.plan.discount_percent,
                            )}
                            currency={sub.plan.currency}
                            discountPercent={sub.plan.discount_percent}
                          />
                        </TableCell>
                        
                        <TableCell>{sub.plan.duration_days} ngày</TableCell>
                        <TableCell>-</TableCell>
                        <TableCell>
                          <Badge
                            className={
                              SUBSCRIPTION_STATUS_COLORS[sub.status] || ""
                            }
                          >
                            {sub.status === "active"
                              ? "Đang hoạt động"
                              : sub.status === "expired"
                                ? "Đã hết hạn"
                                : "Đã hủy"}
                          </Badge>
                        </TableCell>
                 
                      </TableRow>
                    ))}
                  </>
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={10}
                      className="text-center text-muted-foreground py-8"
                    >
                      Không tìm thấy lịch sử subscription
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
