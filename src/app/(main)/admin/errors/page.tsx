import { Suspense } from "react";
import { ErrorLogsManager } from "@/components/admin/error-logs-manager";

export default function ErrorLogsPage() {
  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Quản lý Lỗi</h1>
        <p className="text-gray-600 mt-2">
          Theo dõi và quản lý tất cả lỗi mà người dùng gặp phải trong hệ thống
        </p>
      </div>

      <Suspense fallback={<div>Đang tải...</div>}>
        <ErrorLogsManager />
      </Suspense>
    </div>
  );
}
