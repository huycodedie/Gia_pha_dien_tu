"use client";

import { useState } from "react";
import {
  X,
  Send,
  MessageSquarePlus,
  UserPlus,
  Heart,
  Baby,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth-provider";
import { addSpouse, addChild } from "@/lib/supabase-data";
import type { TreeNode } from "@/lib/tree-layout";

const CONTRIBUTION_FIELDS = [
  {
    key: "gender",
    label: "Giới tính",
    type: "select",
    options: [
      { label: "Nam", value: "1" },
      { label: "Nữ", value: "2" },
      { label: "Không rõ", value: "0" },
    ],
    placeholder: "Chọn giới tính...",
  },
  {
    key: "birth_date",
    label: "Ngày/Tháng/Năm sinh",
    type: "date",
    placeholder: "YYYY-MM-DD",
  },
  {
    key: "death_date",
    label: "Ngày/Tháng/Năm mất",
    type: "date",
    placeholder: "YYYY-MM-DD",
  },
  {
    key: "birth_year",
    label: "Năm sinh",
    type: "number",
    placeholder: "VD: 1950",
  },
  {
    key: "death_year",
    label: "Năm mất",
    type: "number",
    placeholder: "VD: 2020",
  },
  {
    key: "display_name",
    label: "Họ tên",
    type: "text",
    placeholder: "VD: Lê Văn A",
  },
  {
    key: "biography",
    label: "Tiểu sử",
    type: "textarea",
    placeholder: "Thông tin tiểu sử...",
  },
  {
    key: "occupation",
    label: "Nghề nghiệp",
    type: "text",
    placeholder: "VD: Giáo viên",
  },
  { key: "address", label: "Địa chỉ", type: "text", placeholder: "VD: Hà Nội" },
  {
    key: "phone",
    label: "Số điện thoại",
    type: "text",
    placeholder: "VD: 0901234567",
  },
  {
    key: "other",
    label: "Thông tin khác",
    type: "textarea",
    placeholder: "Bổ sung thông tin...",
  },
];

interface ContributeDialogProps {
  personHandle: string;
  personName: string;
  onClose: () => void;
}

export function ContributeDialog({
  personHandle,
  personName,
  onClose,
}: ContributeDialogProps) {
  const { user, profile, isLoggedIn } = useAuth();
  const [selectedField, setSelectedField] = useState(
    CONTRIBUTION_FIELDS[0].key,
  );
  const [newValue, setNewValue] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const fieldInfo = CONTRIBUTION_FIELDS.find((f) => f.key === selectedField)!;

  const handleSubmit = async () => {
    if (!newValue.trim()) {
      setError("Vui lòng nhập thông tin");
      return;
    }
    if (!isLoggedIn || !user) {
      setError("Bạn cần đăng nhập để đóng góp");
      return;
    }

    setSending(true);
    setError("");

    const { error: insertError } = await supabase.from("contributions").insert({
      author_id: user.id,
      author_email: profile?.email || user.email || "",
      person_handle: personHandle,
      person_name: personName,
      field_name: selectedField,
      field_label: fieldInfo.label,
      old_value: null,
      new_value: newValue.trim(),
      note: note.trim() || null,
      status: "pending",
    });

    setSending(false);

    if (insertError) {
      setError(insertError.message);
    } else {
      setSent(true);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-[420px] max-w-[95vw] animate-in zoom-in-95 fade-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2">
            <MessageSquarePlus className="w-5 h-5 text-blue-500" />
            <div>
              <h3 className="font-semibold text-sm">Đóng góp thông tin</h3>
              <p className="text-xs text-muted-foreground">{personName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted">
            <X className="w-4 h-4" />
          </button>
        </div>

        {sent ? (
          /* Success state */
          <div className="p-8 text-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-green-100 mx-auto flex items-center justify-center">
              <Send className="w-6 h-6 text-green-600" />
            </div>
            <h4 className="font-semibold text-green-700">Đã gửi đóng góp!</h4>
            <p className="text-xs text-muted-foreground">
              Quản trị viên sẽ xem xét và phê duyệt.
            </p>
            <Button variant="outline" size="sm" onClick={onClose}>
              Đóng
            </Button>
          </div>
        ) : (
          /* Form */
          <div className="p-5 space-y-4">
            {!isLoggedIn && (
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-700 dark:text-amber-400">
                ⚠️ Bạn cần{" "}
                <a href="/login" className="underline font-medium">
                  đăng nhập
                </a>{" "}
                để đóng góp thông tin.
              </div>
            )}

            {error && (
              <div className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
                {error}
              </div>
            )}

            {/* Field selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Loại thông tin
              </label>
              <select
                value={selectedField}
                onChange={(e) => setSelectedField(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm bg-background"
              >
                {CONTRIBUTION_FIELDS.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Value input */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {fieldInfo.label}
              </label>
              {fieldInfo.type === "textarea" ? (
                <textarea
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder={fieldInfo.placeholder}
                  className="w-full rounded-lg border px-3 py-2 text-sm bg-background min-h-[80px] resize-y"
                  rows={3}
                />
              ) : fieldInfo.type === "select" && "options" in fieldInfo ? (
                <select
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm bg-background"
                >
                  <option value="">{fieldInfo.placeholder}</option>
                  {fieldInfo.options?.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  type={fieldInfo.type}
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder={fieldInfo.placeholder}
                />
              )}
            </div>

            {/* Note */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Ghi chú (tuỳ chọn)
              </label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="VD: Theo lời kể của bác Hai..."
              />
            </div>

            {/* Submit */}
            <Button
              className="w-full"
              disabled={sending || !isLoggedIn}
              onClick={handleSubmit}
            >
              {sending ? (
                "Đang gửi..."
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" /> Gửi đóng góp
                </>
              )}
            </Button>

            <p className="text-[10px] text-center text-muted-foreground">
              Đóng góp sẽ được quản trị viên xem xét trước khi áp dụng.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// === Add Spouse Dialog ===
interface AddSpouseDialogProps {
  person: TreeNode;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddSpouseDialog({
  person,
  onClose,
  onSuccess,
}: AddSpouseDialogProps) {
  const { isLoggedIn } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [isMale, setIsMale] = useState(false);
  const [isFemale, setIsFemale] = useState(person.gender === 1);
  const [birthYear, setBirthYear] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const [deathYear, setDeathYear] = useState("");
  const [deathMonth, setDeathMonth] = useState("");
  const [deathDay, setDeathDay] = useState("");
  const [isLiving, setIsLiving] = useState(true);
  const [isPatrilineal, setIsPatrilineal] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [facebook, setFacebook] = useState("");
  const [currentAddress, setCurrentAddress] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const gender = isMale ? 1 : isFemale ? 2 : 0;

  const handleSubmit = async () => {
    if (!displayName.trim()) {
      toast.error("Vui lòng nhập họ tên");
      return;
    }
    if (gender === 0) {
      toast.error("Vui lòng chọn giới tính");
      return;
    }
    if (!birthYear || !birthMonth || !birthDay) {
      toast.error("Vui lòng nhập đầy đủ ngày tháng năm sinh");
      return;
    }
    if (!isLoggedIn) {
      toast.error("Bạn cần đăng nhập để thêm người");
      return;
    }

    setSending(true);
    setError("");

    const birthDateStr =
      birthYear && birthMonth && birthDay
        ? `${birthYear}-${birthMonth.padStart(2, "0")}-${birthDay.padStart(2, "0")}`
        : undefined;
    const deathDateStr =
      deathYear && deathMonth && deathDay
        ? `${deathYear}-${deathMonth.padStart(2, "0")}-${deathDay.padStart(2, "0")}`
        : undefined;

    const result = await addSpouse(person.handle, {
      displayName: displayName.trim(),
      gender,
      birthYear: birthYear ? parseInt(birthYear) : undefined,
      birthDate: birthDateStr,
      deathYear: deathYear ? parseInt(deathYear) : undefined,
      deathDate: deathDateStr,
      isLiving,
      isPatrilineal,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      facebook: facebook.trim() || undefined,
      currentAddress: currentAddress.trim() || undefined,
    });

    setSending(false);

    if (result.error) {
      toast.error(result.error);
      setError(result.error);
    } else {
      toast.success("Thêm vợ/chồng thành công!");
      onSuccess();
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-[420px] max-w-[95vw] max-h-[85vh] flex flex-col animate-in zoom-in-95 fade-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0">
          <div className="flex items-center gap-2">
            <Heart className="w-5 h-5 text-red-500" />
            <div>
              <h3 className="font-semibold text-sm">Thêm vợ/chồng</h3>
              <p className="text-xs text-muted-foreground">
                cho {person.displayName}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {!isLoggedIn && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-700 dark:text-amber-400">
              ⚠️ Bạn cần{" "}
              <a href="/login" className="underline font-medium">
                đăng nhập
              </a>{" "}
              để thêm người.
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 block">
                Họ tên *
              </label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="VD: Trần Thị Lan"
                className="text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 block">
                Giới tính
              </label>
              <div className="flex gap-4">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="male-spouse"
                    checked={isMale}
                    onChange={(e) => {
                      setIsMale(e.target.checked);
                      if (e.target.checked) setIsFemale(false);
                    }}
                    className="rounded"
                  />
                  <label htmlFor="male-spouse" className="text-sm">
                    Nam
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="female-spouse"
                    checked={isFemale}
                    onChange={(e) => {
                      setIsFemale(e.target.checked);
                      if (e.target.checked) setIsMale(false);
                    }}
                    className="rounded"
                  />
                  <label htmlFor="female-spouse" className="text-sm">
                    Nữ
                  </label>
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">
                Ngày sinh
              </label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[10px] text-slate-500">Năm</label>
                  <Input
                    type="number"
                    value={birthYear}
                    onChange={(e) => setBirthYear(e.target.value)}
                    placeholder="YYYY"
                    className="text-sm"
                    min="1800"
                    max="2100"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-slate-500">Tháng</label>
                  <Input
                    type="number"
                    value={birthMonth}
                    onChange={(e) => setBirthMonth(e.target.value)}
                    placeholder="MM"
                    className="text-sm"
                    min="1"
                    max="12"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-slate-500">Ngày</label>
                  <Input
                    type="number"
                    value={birthDay}
                    onChange={(e) => setBirthDay(e.target.value)}
                    placeholder="DD"
                    className="text-sm"
                    min="1"
                    max="31"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isLiving"
                checked={isLiving}
                onChange={(e) => setIsLiving(e.target.checked)}
                className="rounded"
              />
              <label
                htmlFor="isLiving"
                className="text-xs text-slate-600 dark:text-slate-400"
              >
                Còn sống
              </label>
            </div>


            {isLiving === false && (
            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">
                Ngày mất
              </label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[10px] text-slate-500">Năm</label>
                  <Input
                    type="number"
                    value={deathYear}
                    onChange={(e) => setDeathYear(e.target.value)}
                    placeholder="YYYY"
                    className="text-sm"
                    min="1800"
                    max="2100"
                    disabled={isLiving}
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-slate-500">Tháng</label>
                  <Input
                    type="number"
                    value={deathMonth}
                    onChange={(e) => setDeathMonth(e.target.value)}
                    placeholder="MM"
                    className="text-sm"
                    min="1"
                    max="12"
                    disabled={isLiving}
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-slate-500">Ngày</label>
                  <Input
                    type="number"
                    value={deathDay}
                    onChange={(e) => setDeathDay(e.target.value)}
                    placeholder="DD"
                    className="text-sm"
                    min="1"
                    max="31"
                    disabled={isLiving}
                  />
                </div>
              </div>
            </div>
            )}
            
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isPatrilineal"
                checked={isPatrilineal}
                onChange={(e) => setIsPatrilineal(e.target.checked)}
                className="rounded"
              />
              <label
                htmlFor="isPatrilineal"
                className="text-xs text-slate-600 dark:text-slate-400"
              >
                Là người trong tộc
              </label>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 block">
                Email
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="VD: email@example.com"
                className="text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 block">
                Số điện thoại
              </label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="VD: 0901234567"
                className="text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 block">
                Facebook
              </label>
              <Input
                value={facebook}
                onChange={(e) => setFacebook(e.target.value)}
                placeholder="VD: https://facebook.com/username"
                className="text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 block">
                Địa chỉ hiện tại
              </label>
              <Input
                value={currentAddress}
                onChange={(e) => setCurrentAddress(e.target.value)}
                placeholder="VD: Hà Nội, Việt Nam"
                className="text-sm"
              />
            </div>
          </div>
        </div>

        <div className="border-t px-5 py-3 flex-shrink-0 space-y-3">
          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/30 p-3 text-xs text-red-700 dark:text-red-400">
              {error}
            </div>
          )}

          <Button
            className="w-full"
            disabled={sending || !isLoggedIn}
            onClick={handleSubmit}
          >
            {sending ? (
              "Đang thêm..."
            ) : (
              <>
                <UserPlus className="w-4 h-4 mr-2" /> Thêm vợ/chồng
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// === Add Child Dialog ===
interface AddChildDialogProps {
  familyHandle: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddChildDialog({
  familyHandle,
  onClose,
  onSuccess,
}: AddChildDialogProps) {
  const { isLoggedIn } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [isMale, setIsMale] = useState(false);
  const [isFemale, setIsFemale] = useState(false);
  const [birthYear, setBirthYear] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const [deathYear, setDeathYear] = useState("");
  const [deathMonth, setDeathMonth] = useState("");
  const [deathDay, setDeathDay] = useState("");
  const [isLiving, setIsLiving] = useState(true);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [facebook, setFacebook] = useState("");
  const [currentAddress, setCurrentAddress] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const gender = isMale ? 1 : isFemale ? 2 : 0;

  const handleSubmit = async () => {
    if (!displayName.trim()) {
      toast.error("Vui lòng nhập họ tên");
      return;
    }
    if (gender === 0) {
      toast.error("Vui lòng chọn giới tính");
      return;
    }
    if (!birthYear || !birthMonth || !birthDay) {
      toast.error("Vui lòng nhập đầy đủ ngày tháng năm sinh");
      return;
    }
    if (!isLoggedIn) {
      toast.error("Bạn cần đăng nhập để thêm người");
      return;
    }

    setSending(true);
    setError("");

    const birthDateStr =
      birthYear && birthMonth && birthDay
        ? `${birthYear}-${birthMonth.padStart(2, "0")}-${birthDay.padStart(2, "0")}`
        : undefined;
    const deathDateStr =
      deathYear && deathMonth && deathDay
        ? `${deathYear}-${deathMonth.padStart(2, "0")}-${deathDay.padStart(2, "0")}`
        : undefined;

    const result = await addChild(familyHandle, {
      displayName: displayName.trim(),
      gender,
      birthYear: birthYear ? parseInt(birthYear) : undefined,
      birthDate: birthDateStr,
      deathYear: deathYear ? parseInt(deathYear) : undefined,
      deathDate: deathDateStr,
      isLiving,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      facebook: facebook.trim() || undefined,
      currentAddress: currentAddress.trim() || undefined,
    });

    setSending(false);

    if (result.error) {
      toast.error(result.error);
      setError(result.error);
    } else {
      toast.success("Thêm con thành công!");
      onSuccess();
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-[420px] max-w-[95vw] max-h-[85vh] flex flex-col animate-in zoom-in-95 fade-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0">
          <div className="flex items-center gap-2">
            <Baby className="w-5 h-5 text-blue-500" />
            <div>
              <h3 className="font-semibold text-sm">Thêm con</h3>
              <p className="text-xs text-muted-foreground">vào gia đình</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {!isLoggedIn && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-700 dark:text-amber-400">
              ⚠️ Bạn cần{" "}
              <a href="/login" className="underline font-medium">
                đăng nhập
              </a>{" "}
              để thêm người.
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 block">
                Họ tên *
              </label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="VD: Nguyễn Văn An"
                className="text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 block">
                Giới tính
              </label>
              <div className="flex gap-4">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="male-child"
                    checked={isMale}
                    onChange={(e) => {
                      setIsMale(e.target.checked);
                      if (e.target.checked) setIsFemale(false);
                    }}
                    className="rounded"
                  />
                  <label htmlFor="male-child" className="text-sm">
                    Nam
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="female-child"
                    checked={isFemale}
                    onChange={(e) => {
                      setIsFemale(e.target.checked);
                      if (e.target.checked) setIsMale(false);
                    }}
                    className="rounded"
                  />
                  <label htmlFor="female-child" className="text-sm">
                    Nữ
                  </label>
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">
                Ngày sinh
              </label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[10px] text-slate-500">Năm</label>
                  <Input
                    type="number"
                    value={birthYear}
                    onChange={(e) => setBirthYear(e.target.value)}
                    placeholder="YYYY"
                    className="text-sm"
                    min="1800"
                    max="2100"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-slate-500">Tháng</label>
                  <Input
                    type="number"
                    value={birthMonth}
                    onChange={(e) => setBirthMonth(e.target.value)}
                    placeholder="MM"
                    className="text-sm"
                    min="1"
                    max="12"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-slate-500">Ngày</label>
                  <Input
                    type="number"
                    value={birthDay}
                    onChange={(e) => setBirthDay(e.target.value)}
                    placeholder="DD"
                    className="text-sm"
                    min="1"
                    max="31"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isLiving"
                checked={isLiving}
                onChange={(e) => setIsLiving(e.target.checked)}
                className="rounded"
              />
              <label
                htmlFor="isLiving"
                className="text-xs text-slate-600 dark:text-slate-400"
              >
                Còn sống
              </label>
            </div>

            {isLiving === false && (
            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">
                Ngày mất
              </label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[10px] text-slate-500">Năm</label>
                  <Input
                    type="number"
                    value={deathYear}
                    onChange={(e) => setDeathYear(e.target.value)}
                    placeholder="YYYY"
                    className="text-sm"
                    min="1800"
                    max="2100"
                    disabled={isLiving}
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-slate-500">Tháng</label>
                  <Input
                    type="number"
                    value={deathMonth}
                    onChange={(e) => setDeathMonth(e.target.value)}
                    placeholder="MM"
                    className="text-sm"
                    min="1"
                    max="12"
                    disabled={isLiving}
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-slate-500">Ngày</label>
                  <Input
                    type="number"
                    value={deathDay}
                    onChange={(e) => setDeathDay(e.target.value)}
                    placeholder="DD"
                    className="text-sm"
                    min="1"
                    max="31"
                    disabled={isLiving}
                  />
                </div>
              </div>
            </div>
            )}
            

            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 block">
                Email
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="VD: email@example.com"
                className="text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 block">
                Số điện thoại
              </label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="VD: 0901234567"
                className="text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 block">
                Facebook
              </label>
              <Input
                value={facebook}
                onChange={(e) => setFacebook(e.target.value)}
                placeholder="VD: https://facebook.com/username"
                className="text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 block">
                Địa chỉ hiện tại
              </label>
              <Input
                value={currentAddress}
                onChange={(e) => setCurrentAddress(e.target.value)}
                placeholder="VD: Hà Nội, Việt Nam"
                className="text-sm"
              />
            </div>
          </div>
        </div>

        <div className="border-t px-5 py-3 flex-shrink-0 space-y-3">
          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/30 p-3 text-xs text-red-700 dark:text-red-400">
              {error}
            </div>
          )}

          <Button
            className="w-full"
            disabled={sending || !isLoggedIn}
            onClick={handleSubmit}
          >
            {sending ? (
              "Đang thêm..."
            ) : (
              <>
                <UserPlus className="w-4 h-4 mr-2" /> Thêm con
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
