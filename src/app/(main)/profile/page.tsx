"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/components/auth-provider";
import { updateAccountProfile } from "@/lib/supabase-data";

export default function ProfilePage() {
  const { user, profile, refreshProfile, isLoggedIn } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.display_name || "");
    setEmail(profile.email || "");
    setPhone(profile.phone || "");
  }, [profile]);

  async function handleSave() {
    if (!profile || !user) {
      toast.error("Vui lòng đăng nhập để cập nhật hồ sơ.");
      return;
    }

    const trimmedName = displayName.trim();
    const trimmedEmail = email.trim();
    const cleanedEmail = trimmedEmail.replace(/^"+|"+$/g, "");
    const trimmedPhone = phone.trim();

    if (!trimmedName) {
      toast.error("Tên hiển thị không được để trống.");
      return;
    }

    if (!cleanedEmail) {
      toast.error("Email không được để trống.");
      return;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(cleanedEmail)) {
      toast.error("Email không hợp lệ.");
      return;
    }

    if (cleanedEmail !== trimmedEmail) {
      setEmail(cleanedEmail);
    }

    if (password && password.length < 6) {
      toast.error("Mật khẩu phải có ít nhất 6 ký tự.");
      return;
    }

    if (password && password !== confirmPassword) {
      toast.error("Mật khẩu và xác nhận mật khẩu không trùng khớp.");
      return;
    }

    setLoading(true);

    const result = await updateAccountProfile({
      displayName: trimmedName,
      email: cleanedEmail,
      password: password || undefined,
      phone: trimmedPhone || null,
    });

    if (result.error) {
      toast.error(result.error || "Không thể cập nhật hồ sơ.");
      setLoading(false);
      return;
    }

    await refreshProfile();
    setPassword("");
    setConfirmPassword("");
    setLoading(false);
    toast.success("Cập nhật hồ sơ thành công.");
  }

  if (!isLoggedIn) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center">
        <h1 className="text-xl font-semibold">Hồ sơ cá nhân</h1>
        <p className="mt-2 text-muted-foreground">
          Vui lòng đăng nhập để xem và chỉnh sửa thông tin tài khoản của bạn.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Hồ sơ cá nhân</h1>
        <p className="text-sm text-muted-foreground">
          Chỉnh sửa tên hiển thị, email, mật khẩu và số điện thoại của bạn.
        </p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <div>
            <CardTitle>Thông tin tài khoản</CardTitle>
            <CardDescription>
              Thay đổi thông tin liên hệ và bảo mật tài khoản.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="displayName">
              Tên hiển thị
            </label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Tên hiển thị"
            />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="email">
              Email
            </label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
            />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="phone">
              Số điện thoại
            </label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+84 912 345 678"
            />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="password">
              Mật khẩu mới
            </label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Để trống nếu không đổi"
            />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="confirmPassword">
              Xác nhận mật khẩu mới
            </label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Nhập lại mật khẩu mới"
            />
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          <Button onClick={handleSave} disabled={loading}>
            {loading ? "Đang lưu..." : "Lưu thay đổi"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
