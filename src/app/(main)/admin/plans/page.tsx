"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CreditCard, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { supabase } from "@/lib/supabase";
import {
  getDiscountedAmount,
  normalizeDiscountPercent,
} from "@/lib/manual-payment";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface PlanRecord {
  id: string;
  name: string;
  description: string | null;
  price: number;
  discount_percent: number | null;
  currency: string;
  duration_days: number;
  from_role: string;
  to_role: string;
  is_free: boolean;
  max_uses: number | null;
  people_limit: number;
  created_at: string;
}

interface BankAccountRecord {
  id: string;
  bank_id: string;
  bank_name: string;
  account_no: string;
  account_name: string;
  branch_name: string | null;
  note: string | null;
  is_active: boolean;
  created_at: string;
}

const emptyPlanForm = {
  name: "",
  description: "",
  price: "0",
  discount_percent: "0",
  currency: "VND",
  duration_days: "30",
  from_role: "viewer",
  to_role: "user",
  is_free: false,
  max_uses: "",
  people_limit: "30",
};

const emptyBankForm = {
  bank_id: "",
  bank_name: "",
  account_no: "",
  account_name: "",
  branch_name: "",
  note: "",
};

const BANK_OPTIONS = [
  { bankId: "MBBank", bankName: "Ngân hàng TMCP Quân đội (MB Bank)" },
  {
    bankId: "VCB",
    bankName: "Ngân hàng TMCP Ngoại thương Việt Nam (Vietcombank)",
  },
  {
    bankId: "TCB",
    bankName: "Ngân hàng TMCP Kỹ thương Việt Nam (Techcombank)",
  },
  { bankId: "ACB", bankName: "Ngân hàng TMCP Á Châu (ACB)" },
  {
    bankId: "VPBank",
    bankName: "Ngân hàng TMCP Việt Nam Thịnh Vượng (VPBank)",
  },
  { bankId: "TPBank", bankName: "Ngân hàng TMCP Tiên Phong (TPBank)" },
  {
    bankId: "BIDV",
    bankName: "Ngân hàng TMCP Đầu tư và Phát triển Việt Nam (BIDV)",
  },
  {
    bankId: "VietinBank",
    bankName: "Ngân hàng TMCP Công thương Việt Nam (VietinBank)",
  },
  {
    bankId: "Sacombank",
    bankName: "Ngân hàng TMCP Sài Gòn Thương Tín (Sacombank)",
  },
  {
    bankId: "HDBank",
    bankName: "Ngân hàng TMCP Phát triển Thành phố Hồ Chí Minh (HDBank)",
  },
  { bankId: "OCB", bankName: "Ngân hàng TMCP Phương Đông (OCB)" },
  { bankId: "VIB", bankName: "Ngân hàng TMCP Quốc tế Việt Nam (VIB)" },
  { bankId: "SeABank", bankName: "Ngân hàng TMCP Đông Nam Á (SeABank)" },
  { bankId: "SHB", bankName: "Ngân hàng TMCP Sài Gòn - Hà Nội (SHB)" },
  { bankId: "MSB", bankName: "Ngân hàng TMCP Hàng Hải Việt Nam (MSB)" },
  {
    bankId: "Eximbank",
    bankName: "Ngân hàng TMCP Xuất Nhập khẩu Việt Nam (Eximbank)",
  },
];

export default function AdminPlansPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<PlanRecord[]>([]);
  const [planPurchaseCounts, setPlanPurchaseCounts] = useState<
    Record<string, number>
  >({});
  const [bankAccounts, setBankAccounts] = useState<BankAccountRecord[]>([]);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [editingBankId, setEditingBankId] = useState<string | null>(null);
  const [savingPlan, setSavingPlan] = useState(false);
  const [savingBank, setSavingBank] = useState(false);
  const [planForm, setPlanForm] = useState(emptyPlanForm);
  const [bankForm, setBankForm] = useState(emptyBankForm);

  const activeBank = useMemo(
    () => bankAccounts.find((account) => account.is_active) || null,
    [bankAccounts],
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
  
    const [
      { data: planData, error: planError },
      { data: bankData, error: bankError },
      { data: subscriptionData, error: subscriptionError },
    ] = await Promise.all([
      supabase.from("plans").select("*").order("price", { ascending: true }),
      supabase
        .from("bank_accounts")
        .select("*")
        .order("is_active", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase.from("subscriptions").select("plan_id, status")
    ]);

    if (planError) {
      toast.error(planError.message);
    } else {
      setPlans((planData as PlanRecord[]) || []);
    }

    if (bankError) {
      toast.error(bankError.message);
    } else {
      setBankAccounts((bankData as BankAccountRecord[]) || []);
    }

    if (subscriptionError) {
      toast.error(subscriptionError.message);
    } else {
      const counts = (
        (subscriptionData as { plan_id: string }[] | null) || []
      ).reduce<Record<string, number>>((acc, item) => {
        acc[item.plan_id] = (acc[item.plan_id] || 0) + 1;
        return acc;
      }, {});
      setPlanPurchaseCounts(counts);
    }
    
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!authLoading && isAdmin) {
      const timer = window.setTimeout(() => {
        void fetchData();
      }, 0);

      return () => window.clearTimeout(timer);
    }
  }, [authLoading, fetchData, isAdmin]);

  const resetPlanForm = () => {
    setEditingPlanId(null);
    setPlanForm(emptyPlanForm);
  };

  const resetBankForm = () => {
    setEditingBankId(null);
    setBankForm(emptyBankForm);
  };

  const submitPlan = async () => {
    setSavingPlan(true);

    const payload = {
      name: planForm.name.trim(),
      description: planForm.description.trim() || null,
      price: Number(planForm.price),
      discount_percent: normalizeDiscountPercent(planForm.discount_percent),
      currency: planForm.currency.trim() || "VND",
      duration_days: Number(planForm.duration_days),
      from_role: planForm.from_role,
      to_role: planForm.to_role,
      is_free: planForm.is_free,
      max_uses:
        planForm.max_uses.trim() === "" ? null : Number(planForm.max_uses),
      people_limit: Number(planForm.people_limit),
    };

    const query = editingPlanId
      ? supabase.from("plans").update(payload).eq("id", editingPlanId)
      : supabase.from("plans").insert(payload);

    const { error } = await query;
    setSavingPlan(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(editingPlanId ? "Đã cập nhật gói." : "Đã tạo gói mới.");
    resetPlanForm();
    await fetchData();
  };

  const deletePlan = async (planId: string) => {
    const { error } = await supabase.from("plans").delete().eq("id", planId);
    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Đã xóa gói.");
    if (editingPlanId === planId) {
      resetPlanForm();
    }
    await fetchData();
  };

  const startEditPlan = (plan: PlanRecord) => {
    setEditingPlanId(plan.id);
    setPlanForm({
      name: plan.name,
      description: plan.description || "",
      price: String(plan.price),
      discount_percent: String(plan.discount_percent || 0),
      currency: plan.currency,
      duration_days: String(plan.duration_days),
      from_role: plan.from_role,
      to_role: plan.to_role,
      is_free: plan.is_free,
      max_uses: plan.max_uses === null ? "" : String(plan.max_uses),
      people_limit: String(plan.people_limit),
    });
  };

  const submitBankAccount = async () => {
    setSavingBank(true);

    const payload = {
      bank_id: bankForm.bank_id.trim(),
      bank_name: bankForm.bank_name.trim(),
      account_no: bankForm.account_no.trim(),
      account_name: bankForm.account_name.trim(),
      branch_name: bankForm.branch_name.trim() || null,
      note: bankForm.note.trim() || null,
    };

    const query = editingBankId
      ? supabase.from("bank_accounts").update(payload).eq("id", editingBankId)
      : supabase.from("bank_accounts").insert(payload);

    const { error } = await query;
    setSavingBank(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(
      editingBankId
        ? "Đã cập nhật tài khoản ngân hàng."
        : "Đã thêm tài khoản ngân hàng.",
    );
    resetBankForm();
    await fetchData();
  };

  const setActiveBankAccount = async (bankId: string) => {
    const { error: clearError } = await supabase
      .from("bank_accounts")
      .update({ is_active: false })
      .eq("is_active", true)
      .neq("id", bankId);

    if (clearError) {
      toast.error(clearError.message);
      return;
    }

    const { error } = await supabase
      .from("bank_accounts")
      .update({ is_active: true })
      .eq("id", bankId);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Đã đổi tài khoản nhận tiền đang hoạt động.");
    await fetchData();
  };

  const deleteBankAccount = async (bankId: string) => {
    const { error } = await supabase
      .from("bank_accounts")
      .delete()
      .eq("id", bankId);
    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Đã xóa tài khoản ngân hàng.");
    if (editingBankId === bankId) {
      resetBankForm();
    }
    await fetchData();
  };

  const startEditBankAccount = (account: BankAccountRecord) => {
    setEditingBankId(account.id);
    setBankForm({
      bank_id: account.bank_id,
      bank_name: account.bank_name,
      account_no: account.account_no,
      account_name: account.account_name,
      branch_name: account.branch_name || "",
      note: account.note || "",
    });
  };

  const handleBankSelection = (bankId: string) => {
    const bank = BANK_OPTIONS.find((item) => item.bankId === bankId);
    if (!bank) return;

    setBankForm((prev) => ({
      ...prev,
      bank_id: bank.bankId,
      bank_name: bank.bankName,
    }));
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <CreditCard className="h-6 w-6" />
          Cấu hình thanh toán và gói nâng cấp
        </h1>
        <p className="text-muted-foreground">
          Quản lý tài khoản ngân hàng nhận tiền và CRUD gói nâng cấp tài khoản.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Tài khoản ngân hàng nhận tiền</CardTitle>
            <CardDescription>
              Tài khoản đang active sẽ được dùng khi tạo QR chuyển khoản mới.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeBank ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm">
                <div className="font-medium text-emerald-900">
                  Đang hoạt động
                </div>
                <div className="mt-1 text-emerald-800">
                  {activeBank.bank_name} - {activeBank.account_no} -{" "}
                  {activeBank.account_name}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                Chưa có tài khoản ngân hàng nào được đánh dấu active.
              </div>
            )}

            <div className="grid gap-3">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Chọn ngân hàng</label>
                <Select
                  value={bankForm.bank_id}
                  onValueChange={handleBankSelection}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn ngân hàng để tự động điền mã và tên" />
                  </SelectTrigger>
                  <SelectContent>
                    {BANK_OPTIONS.map((bank) => (
                      <SelectItem key={bank.bankId} value={bank.bankId}>
                        {bank.bankName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Input
                placeholder="Mã ngân hàng VietQR, ví dụ MBBank"
                value={bankForm.bank_id}
                onChange={(e) =>
                  setBankForm((prev) => ({ ...prev, bank_id: e.target.value }))
                }
              />
              <Input
                placeholder="Tên ngân hàng"
                value={bankForm.bank_name}
                onChange={(e) =>
                  setBankForm((prev) => ({
                    ...prev,
                    bank_name: e.target.value,
                  }))
                }
              />
              <Input
                placeholder="Số tài khoản"
                value={bankForm.account_no}
                onChange={(e) =>
                  setBankForm((prev) => ({
                    ...prev,
                    account_no: e.target.value,
                  }))
                }
              />
              <Input
                placeholder="Tên chủ tài khoản"
                value={bankForm.account_name}
                onChange={(e) =>
                  setBankForm((prev) => ({
                    ...prev,
                    account_name: e.target.value,
                  }))
                }
              />
              <Input
                placeholder="Chi nhánh"
                value={bankForm.branch_name}
                onChange={(e) =>
                  setBankForm((prev) => ({
                    ...prev,
                    branch_name: e.target.value,
                  }))
                }
              />
              <Textarea
                placeholder="Ghi chú thêm"
                value={bankForm.note}
                onChange={(e) =>
                  setBankForm((prev) => ({ ...prev, note: e.target.value }))
                }
              />
            </div>

            <div className="flex gap-2">
              <Button onClick={submitBankAccount} disabled={savingBank}>
                <Plus className="mr-2 h-4 w-4" />
                {editingBankId ? "Lưu tài khoản" : "Thêm tài khoản"}
              </Button>
              {editingBankId && (
                <Button variant="outline" onClick={resetBankForm}>
                  Hủy sửa
                </Button>
              )}
            </div>

            <div className="space-y-3">
              {bankAccounts.map((account) => (
                <div
                  key={account.id}
                  className="rounded-lg border p-4 flex flex-col gap-3"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1 text-sm">
                      <div className="font-medium">{account.bank_name}</div>
                      <div>{account.account_no}</div>
                      <div>{account.account_name}</div>
                      {account.note && (
                        <div className="text-muted-foreground">
                          {account.note}
                        </div>
                      )}
                    </div>
                    {account.is_active && <Badge>Đang active</Badge>}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={account.is_active ? "secondary" : "default"}
                      onClick={() => setActiveBankAccount(account.id)}
                    >
                      {account.is_active ? "Đang dùng" : "Đặt active"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => startEditBankAccount(account)}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Sửa
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => deleteBankAccount(account.id)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Xóa
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Gói nâng cấp tài khoản</CardTitle>
            <CardDescription>
              Thêm, sửa, xóa gói nâng cấp và cấu hình giới hạn sử dụng.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3">
              <Input
                placeholder="Tên gói"
                value={planForm.name}
                onChange={(e) =>
                  setPlanForm((prev) => ({ ...prev, name: e.target.value }))
                }
              />
              <Textarea
                placeholder="Mô tả gói"
                value={planForm.description}
                onChange={(e) =>
                  setPlanForm((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  placeholder="Giá"
                  type="number"
                  value={planForm.price}
                  onChange={(e) =>
                    setPlanForm((prev) => ({ ...prev, price: e.target.value }))
                  }
                />
                <Input
                  placeholder="Tiền tệ"
                  value={planForm.currency}
                  onChange={(e) =>
                    setPlanForm((prev) => ({
                      ...prev,
                      currency: e.target.value,
                    }))
                  }
                />
                <Input
                  placeholder="Giảm giá (%)"
                  type="number"
                  min="0"
                  max="99"
                  value={planForm.discount_percent}
                  onChange={(e) =>
                    setPlanForm((prev) => ({
                      ...prev,
                      discount_percent: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  placeholder="Số ngày"
                  type="number"
                  value={planForm.duration_days}
                  onChange={(e) =>
                    setPlanForm((prev) => ({
                      ...prev,
                      duration_days: e.target.value,
                    }))
                  }
                />
                <Input
                  placeholder="Giới hạn thành viên"
                  type="number"
                  value={planForm.people_limit}
                  onChange={(e) =>
                    setPlanForm((prev) => ({
                      ...prev,
                      people_limit: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  placeholder="From role"
                  value={planForm.from_role}
                  onChange={(e) =>
                    setPlanForm((prev) => ({
                      ...prev,
                      from_role: e.target.value,
                    }))
                  }
                />
                <Input
                  placeholder="To role"
                  value={planForm.to_role}
                  onChange={(e) =>
                    setPlanForm((prev) => ({
                      ...prev,
                      to_role: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  placeholder="Số lần dùng tối đa"
                  type="number"
                  value={planForm.max_uses}
                  onChange={(e) =>
                    setPlanForm((prev) => ({
                      ...prev,
                      max_uses: e.target.value,
                    }))
                  }
                />
                <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={planForm.is_free}
                    onChange={(e) =>
                      setPlanForm((prev) => ({
                        ...prev,
                        is_free: e.target.checked,
                      }))
                    }
                  />
                  Gói miễn phí
                </label>
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={submitPlan} disabled={savingPlan}>
                <Plus className="mr-2 h-4 w-4" />
                {editingPlanId ? "Lưu gói" : "Thêm gói"}
              </Button>
              {editingPlanId && (
                <Button variant="outline" onClick={resetPlanForm}>
                  Hủy sửa
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách gói hiện có</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tên gói</TableHead>
                  <TableHead>Giá</TableHead>
                  <TableHead>Số lượng</TableHead>
                  <TableHead>Thời hạn</TableHead>
                  <TableHead>Giới hạn</TableHead>
                  <TableHead>Loại</TableHead>
                  <TableHead>Tạo lúc</TableHead>
                  <TableHead>Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((plan) => (
                  <TableRow key={plan.id}>
                    <TableCell>
                      <div className="font-medium">{plan.name}</div>
                      {plan.description && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {plan.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div>
                        {Number(plan.price).toLocaleString("vi-VN")}{" "}
                        {plan.currency}
                      </div>
                      {normalizeDiscountPercent(plan.discount_percent) > 0 && (
                        <div className="text-xs text-emerald-700">
                          Còn{" "}
                          {getDiscountedAmount(
                            plan.price,
                            plan.discount_percent,
                          ).toLocaleString("vi-VN")}{" "}
                          {plan.currency} (-
                          {normalizeDiscountPercent(plan.discount_percent)}%)
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {(planPurchaseCounts[plan.id] || 0).toLocaleString(
                          "vi-VN",
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        lượt mua/kích hoạt
                      </div>
                    </TableCell>
                    <TableCell>{plan.duration_days} ngày</TableCell>
                    <TableCell>
                      {plan.people_limit} người
                      {plan.max_uses !== null && (
                        <div className="text-xs text-muted-foreground">
                          Tối đa {plan.max_uses} lần
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={plan.is_free ? "secondary" : "default"}>
                        {plan.is_free ? "Miễn phí" : "Trả phí"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(plan.created_at).toLocaleString("vi-VN")}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => startEditPlan(plan)}
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          Sửa
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => deletePlan(plan.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Xóa
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
