"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Database,
  Download,
  Upload,
  AlertCircle,
  CheckCircle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth-provider";

export default function BackupPage() {
  const { isAdmin } = useAuth();
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [backupKey, setBackupKey] = useState("");
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createBackup = async () => {
    setCreating(true);
    setMessage(null);
    try {
      // Export all data from Supabase
      const { data: people } = await supabase.from("people").select("*");
      const { data: families } = await supabase.from("families").select("*");
      const { data: profiles } = await supabase.from("profiles").select("*");
      const { data: contributions } = await supabase
        .from("contributions")
        .select("*");
      const { data: posts } = await supabase.from("posts").select("*");
      const { data: comments } = await supabase.from("comments").select("*");
      const { data: notifications } = await supabase
        .from("notifications")
        .select("*");
      const { data: guest_invitations } = await supabase
        .from("guest_invitations")
        .select("*");
      const { data: plans } = await supabase.from("plans").select("*");
      const { data: subscriptions } = await supabase
        .from("subscriptions")
        .select("*");
      const { data: user_plan_usage } = await supabase
        .from("user_plan_usage")
        .select("*");
      const { data: bank_accounts } = await supabase
        .from("bank_accounts")
        .select("*");
      const { data: payment_orders } = await supabase
        .from("payment_orders")
        .select("*");

      const backup = {
        exported_at: new Date().toISOString(),
        people: people || [],
        families: families || [],
        profiles: profiles || [],
        contributions: contributions || [],
        posts: posts || [],
        comments: comments || [],
        notifications: notifications || [],
        guest_invitations: guest_invitations || [],
        plans: plans || [],
        subscriptions: subscriptions || [],
        user_plan_usage: user_plan_usage || [],
        bank_accounts: bank_accounts || [],
        payment_orders: payment_orders || [],
      };

      // Download as JSON
      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `giapha-backup-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setLastBackup(new Date().toISOString());
      setMessage({ type: "success", text: "Xuất backup thành công!" });
    } catch (error) {
      setMessage({ type: "error", text: "Lỗi khi xuất backup" });
      console.error("Backup error:", error);
    } finally {
      setCreating(false);
    }
  };

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setRestoring(true);
    setMessage(null);
    try {
      const content = await file.text();
      const backupData = JSON.parse(content);

      if (!backupKey.trim()) {
        throw new Error("Vui lòng nhập mật mã khôi phục.");
      }

      // Get auth token
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      // Call restore API
      const response = await fetch("/api/admin/backup/restore", {
        method: "POST",
        headers,
        body: JSON.stringify({ backup: backupData, backupKey }),
      });

      const result = await response.json();

      if (!response.ok) {
        const errorMessage =
          result.error === "Invalid backup key"
            ? "Mật mã khôi phục không đúng. Vui lòng kiểm tra lại KEY_BACKUP."
            : result.error || "Restore failed";
        throw new Error(errorMessage);
      }

      setMessage({
        type: "success",
        text: `${result.message}${result.errors ? ` (Lỗi: ${result.errors.join(", ")})` : ""}`,
      });

      // Refresh stats
      setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      console.error("Restore error:", error);
      setMessage({
        type: "error",
        text:
          error instanceof Error ? error.message : "Lỗi khi khôi phục backup",
      });
    } finally {
      setRestoring(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="space-y-6">
      {message && (
        <div
          className={`flex items-center gap-2 p-4 rounded-lg ${
            message.type === "success"
              ? "bg-green-50 text-green-900"
              : "bg-red-50 text-red-900"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle className="h-5 w-5" />
          ) : (
            <AlertCircle className="h-5 w-5" />
          )}
          <span className="text-sm">{message.text}</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Database className="h-6 w-6" />
            Sao lưu & Khôi phục
          </h1>
          <p className="text-muted-foreground">Quản lý sao lưu cơ sở dữ liệu</p>
        </div>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-end">
          <div className="flex-1 md:max-w-sm">
            <Input
              value={backupKey}
              onChange={(e) => setBackupKey(e.target.value)}
              placeholder="Nhập mật mã khôi phục"
              type="password"
              className="w-full"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button onClick={createBackup} disabled={creating || restoring}>
              <Download className="mr-2 h-4 w-4" />
              {creating ? "Đang xuất..." : "Xuất backup JSON"}
            </Button>
            <Button
              onClick={triggerFileInput}
              disabled={restoring || creating}
              variant="outline"
            >
              {restoring ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Đang khôi phục...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Khôi phục từ file
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileSelect}
        className="hidden"
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Thông tin database</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <DatabaseStats />
          {lastBackup && (
            <p className="text-sm text-muted-foreground">
              Backup gần nhất: {new Date(lastBackup).toLocaleString("vi-VN")}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hướng dẫn</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            <strong>Xuất backup:</strong> Nhấn "Xuất backup JSON" để tải xuống
            toàn bộ dữ liệu từ tất cả các bảng trong hệ thống (people, families,
            profiles, contributions, posts, comments, notifications,
            guest_invitations, plans, subscriptions, user_plan_usage,
            bank_accounts, payment_orders, events).
          </p>
          <p>
            <strong>Khôi phục:</strong> Nhấn "Khôi phục từ file" và chọn file
            backup JSON để khôi phục dữ liệu. Trước khi khôi phục, hãy nhập "mật
            mã khôi phục" tương ứng với biến môi trường KEY_BACKUP.
            <span className="text-red-600 font-semibold">
              ⚠️ Điều này sẽ ghi đè toàn bộ dữ liệu hiện tại!
            </span>
          </p>
          <p>
            <strong>Thời gian sao lưu:</strong>{" "}
            {new Date().toLocaleString("vi-VN")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function DatabaseStats() {
  const [stats, setStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const tables = [
        "people",
        "families",
        "profiles",
        "contributions",
        "posts",
        "comments",
        "notifications",
        "guest_invitations",
        "plans",
        "subscriptions",
        "user_plan_usage",
        "bank_accounts",
        "payment_orders",
        "events",
      ];
      const counts: Record<string, number> = {};
      for (const t of tables) {
        const { count } = await supabase
          .from(t)
          .select("*", { count: "exact", head: true });
        counts[t] = count || 0;
      }
      setStats(counts);
      setLoading(false);
    }
    load();
  }, []);

  if (loading)
    return (
      <div className="animate-pulse text-sm text-muted-foreground">
        Đang tải...
      </div>
    );

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-3">
      {Object.entries(stats).map(([table, count]) => (
        <div key={table} className="rounded-lg border p-3 text-center">
          <p className="text-2xl font-bold">{count}</p>
          <p className="text-xs text-muted-foreground">{table}</p>
        </div>
      ))}
    </div>
  );
}
