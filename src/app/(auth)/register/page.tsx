"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TreePine, Eye, EyeOff } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { supabase } from "@/lib/supabase";

const registerSchema = z
  .object({
    email: z.string().email("Email không hợp lệ"),
    displayName: z
      .string()
      .nonempty("Tên hiển thị không được để trống")
      .min(2, "Tên tối thiểu 2 ký tự")
      .max(100, "Tên tối đa 100 ký tự"),
    password: z.string().min(8, "Mật khẩu tối thiểu 8 ký tự"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Mật khẩu xác nhận không khớp",
    path: ["confirmPassword"],
  });

type RegisterForm = z.infer<typeof registerSchema>;

// Helper function to check if display_name exists
async function checkDisplayNameExists(displayName: string): Promise<boolean> {
  try {
    const response = await fetch("/api/auth/check-display-name", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: displayName.trim() }),
    });
    const data = await response.json();
    return data.exists === true;
  } catch (err) {
    console.error("Error checking display_name:", err);
    return false;
  }
}

function RegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteCode = searchParams.get("code") || "";
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [displayNameError, setDisplayNameError] = useState("");
  const [checkingDisplayName, setCheckingDisplayName] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) });

  const displayName = watch("displayName");

  // Check display_name availability on blur or after user stops typing
  const handleDisplayNameBlur = async () => {
    if (displayName && displayName.length >= 2) {
      setCheckingDisplayName(true);
      try {
        const exists = await checkDisplayNameExists(displayName);
        if (exists) {
          setDisplayNameError("Tên hiển thị này đã được sử dụng");
        } else {
          setDisplayNameError("");
        }
      } finally {
        setCheckingDisplayName(false);
      }
    }
  };

  const onSubmit = async (data: RegisterForm) => {
    try {
      setError("");
      setLoading(true);

      // Check if display_name already exists
      const displayNameExists = await checkDisplayNameExists(data.displayName);
      if (displayNameExists) {
        setError("Tên hiển thị này đã được sử dụng. Vui lòng chọn tên khác.");
        return;
      }

      // Check if email already exists by trying to look it up
      const { data: existingEmail } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", data.email)
        .single();

      if (existingEmail) {
        setError(
          "Email này đã được đăng ký. Vui lòng sử dụng email khác hoặc đăng nhập.",
        );
        return;
      }

      const { error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            display_name: data.displayName,
          },
        },
      });

      if (authError) {
        if (authError.message.includes("already registered")) {
          setError(
            "Email này đã được đăng ký. Vui lòng sử dụng email khác hoặc đăng nhập.",
          );
        } else if (authError.message.includes("Password")) {
          setError("Mật khẩu không đạt yêu cầu bảo mật.");
        } else {
          setError(authError.message);
        }
        return;
      }

      router.push("/");
    } catch (err) {
      setError("Đăng ký thất bại. Vui lòng thử lại.");
      console.error("Register error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-0 shadow-2xl">
      <CardHeader className="text-center space-y-2">
        <div className="flex justify-center">
          <div className="rounded-full bg-primary/10 p-3">
            <TreePine className="h-8 w-8 text-primary" />
          </div>
        </div>
        <CardTitle className="text-2xl font-bold">Tham gia Gia phả</CardTitle>
        <CardDescription>
          Đăng ký tham gia nền tảng gia phả dòng họ
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* {!inviteCode && (
                        <div className="rounded-md bg-amber-500/10 p-3 text-sm text-amber-600 dark:text-amber-400">
                            ⚠️ Bạn cần có mã mời từ Admin để đăng ký
                        </div>
                    )} */}

          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="displayName">
              Tên hiển thị
            </label>
            <Input
              id="displayName"
              placeholder="Nguyễn Văn A"
              {...register("displayName")}
              onBlur={handleDisplayNameBlur}
            />
            {errors.displayName && (
              <p className="text-xs text-destructive">
                {errors.displayName.message}
              </p>
            )}
            {displayNameError && (
              <p className="text-xs text-destructive flex items-center gap-1">
                {displayNameError}
              </p>
            )}
            {checkingDisplayName && (
              <p className="text-xs text-muted-foreground">Đang kiểm tra...</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="email">
              Email
            </label>
            <Input
              id="email"
              type="email"
              placeholder="email@example.com"
              {...register("email")}
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="password">
              Mật khẩu
            </label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Tối thiểu 8 ký tự"
                {...register("password")}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            {errors.password && (
              <p className="text-xs text-destructive">
                {errors.password.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="confirmPassword">
              Xác nhận mật khẩu
            </label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="Nhập lại mật khẩu"
              {...register("confirmPassword")}
            />
            {errors.confirmPassword && (
              <p className="text-xs text-destructive">
                {errors.confirmPassword.message}
              </p>
            )}
          </div>
          {/* <Button type="submit" className="w-full" disabled={loading || !inviteCode}> */}
          <Button
            type="submit"
            className="w-full"
            disabled={loading || !!displayNameError || checkingDisplayName}
          >
            {loading ? "Đang đăng ký..." : "Đăng ký"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      }
    >
      <RegisterContent />
    </Suspense>
  );
}
