"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  Eye,
  CheckCircle,
  XCircle,
  Clock,
  Search,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ErrorLog {
  id: string;
  user_id: string | null;
  session_id: string;
  error_type: string;
  error_message: string;
  error_stack: string | null;
  user_agent: string | null;
  url: string | null;
  ip_address: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "new" | "investigating" | "fixed" | "ignored";
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  notes: string | null;
}

interface ErrorStats {
  total_errors: number;
  by_type: Record<string, number>;
  by_severity: Record<string, number>;
  by_status: Record<string, number>;
  recent_errors: ErrorLog[];
}

export function ErrorLogsManager() {
  const [stats, setStats] = useState<ErrorStats | null>(null);
  const [errors, setErrors] = useState<ErrorLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedError, setSelectedError] = useState<ErrorLog | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<
    "new" | "investigating" | "fixed" | "ignored"
  >("investigating");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    loadErrorData();
  }, []);

  const loadErrorData = async () => {
    try {
      setLoading(true);

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      const headers: Record<string, string> = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      // Load statistics
      const statsResponse = await fetch("/api/errors/log", {
        headers,
        credentials: "same-origin",
      });
      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        setStats(statsData.stats);
      } else if (statsResponse.status === 401) {
        toast({
          title: "Không có quyền",
          description: "Vui lòng đăng nhập lại để xem thống kê lỗi.",
          variant: "destructive",
        });
        setStats(null);
      } else {
        const errorData = await statsResponse.json();
        console.error("Error loading stats:", errorData);
      }

      // Load error logs
      const errorsResponse = await fetch("/api/errors", {
        headers,
        credentials: "same-origin",
      });
      if (errorsResponse.ok) {
        const errorsData = await errorsResponse.json();
        setErrors(errorsData.errors || []);
      } else if (errorsResponse.status === 401) {
        toast({
          title: "Không có quyền",
          description: "Vui lòng đăng nhập lại để xem danh sách lỗi.",
          variant: "destructive",
        });
        setErrors([]);
      } else {
        const errorData = await errorsResponse.json();
        console.error("Error loading errors:", errorData);
      }
    } catch (error) {
      console.error("Error loading error data:", error);
      toast({
        title: "Lỗi",
        description: "Không thể tải dữ liệu lỗi.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const toggledSelection = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  };

  const selectAll = () => {
    const ids = filteredErrors.map((error) => error.id);
    setSelectedIds(ids);
  };

  const deselectAll = () => setSelectedIds([]);

  const bulkUpdateErrorStatus = async () => {
    if (selectedIds.length === 0) {
      toast({
        title: "Chưa chọn lỗi",
        description: "Vui lòng chọn ít nhất một lỗi để cập nhật.",
        variant: "destructive",
      });
      return;
    }

    try {
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

      const results = await Promise.all(
        selectedIds.map((errorId) =>
          fetch(`/api/errors/${errorId}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ status: bulkStatus }),
          }),
        ),
      );

      const failed = await Promise.all(
        results.map(async (response) => ({
          ok: response.ok,
          status: response.status,
          body: await response.json().catch(() => ({})),
        })),
      );

      const failedItem = failed.find((item) => !item.ok);
      if (failedItem) {
        const message =
          failedItem.body.error || "Không thể cập nhật một số lỗi.";
        toast({
          title: "Lỗi",
          description: message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Thành công",
          description: `Đã cập nhật ${selectedIds.length} lỗi sang trạng thái ${bulkStatus}.`,
        });
      }

      setSelectedIds([]);
      loadErrorData();
    } catch (error) {
      console.error("Error bulk updating error status:", error);
      toast({
        title: "Lỗi",
        description: "Không thể cập nhật trạng thái hàng loạt.",
        variant: "destructive",
      });
    }
  };

  const updateErrorStatus = async (
    errorId: string,
    status: string,
    notes?: string,
  ) => {
    try {
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

      const response = await fetch(`/api/errors/${errorId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ status, notes }),
      });

      if (response.ok) {
        toast({
          title: "Thành công",
          description: "Đã cập nhật trạng thái lỗi.",
        });
        loadErrorData();
      } else {
        const errorData = await response.json();
        if (response.status === 401) {
          toast({
            title: "Không có quyền",
            description: "Vui lòng đăng nhập lại để cập nhật trạng thái lỗi.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Lỗi",
            description: errorData.error || "Không thể cập nhật lỗi.",
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      console.error("Error updating error status:", error);
      toast({
        title: "Lỗi",
        description: "Không thể cập nhật lỗi.",
        variant: "destructive",
      });
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-red-500";
      case "high":
        return "bg-orange-500";
      case "medium":
        return "bg-yellow-500";
      case "low":
        return "bg-green-500";
      default:
        return "bg-gray-500";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "new":
        return "bg-blue-500";
      case "investigating":
        return "bg-purple-500";
      case "fixed":
        return "bg-green-500";
      case "ignored":
        return "bg-gray-500";
      default:
        return "bg-gray-500";
    }
  };

  const filteredErrors = errors.filter((error) => {
    const matchesStatus =
      filterStatus === "all" || error.status === filterStatus;
    const matchesType = filterType === "all" || error.error_type === filterType;
    const matchesSearch =
      searchTerm === "" ||
      error.error_message.toLowerCase().includes(searchTerm.toLowerCase()) ||
      error.error_type.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesStatus && matchesType && matchesSearch;
  });

  if (loading) {
    return <div className="text-center py-8">Đang tải dữ liệu...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tổng lỗi</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total_errors}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Lỗi mới</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats.by_status?.new || 0}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Đang xử lý</CardTitle>
              <Eye className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats.by_status?.investigating || 0}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Đã sửa</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats.by_status?.fixed || 0}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Bộ lọc</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <Input
                placeholder="Tìm kiếm lỗi..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Trạng thái" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="new">Mới</SelectItem>
                <SelectItem value="investigating">Đang xử lý</SelectItem>
                <SelectItem value="fixed">Đã sửa</SelectItem>
                <SelectItem value="ignored">Bỏ qua</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Loại lỗi" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="javascript">JavaScript</SelectItem>
                <SelectItem value="api">API</SelectItem>
                <SelectItem value="network">Network</SelectItem>
                <SelectItem value="validation">Validation</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hành động hàng loạt</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="inline-flex items-center rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                onClick={() =>
                  selectedIds.length === filteredErrors.length
                    ? deselectAll()
                    : selectAll()
                }
              >
                {selectedIds.length === filteredErrors.length
                  ? "Bỏ chọn tất cả"
                  : "Chọn tất cả"}
              </button>
              <span className="text-sm text-slate-600">
                {selectedIds.length} lỗi đã chọn
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Select
                value={bulkStatus}
                onValueChange={(value) => setBulkStatus(value as any)}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Chọn trạng thái" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">Mới</SelectItem>
                  <SelectItem value="investigating">Đang xử lý</SelectItem>
                  <SelectItem value="fixed">Đã sửa</SelectItem>
                  <SelectItem value="ignored">Bỏ qua</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="secondary"
                onClick={bulkUpdateErrorStatus}
                disabled={selectedIds.length === 0}
              >
                Cập nhật hàng loạt
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle>Danh sách lỗi</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <input
                    type="checkbox"
                    checked={
                      filteredErrors.length > 0 &&
                      filteredErrors.every((error) =>
                        selectedIds.includes(error.id),
                      )
                    }
                    onChange={(event) => {
                      if (event.target.checked) {
                        selectAll();
                      } else {
                        deselectAll();
                      }
                    }}
                  />
                </TableHead>
                <TableHead>Thời gian</TableHead>
                <TableHead>Loại</TableHead>
                <TableHead>Mức độ</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Lỗi</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredErrors.map((error) => (
                <TableRow key={error.id}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(error.id)}
                      onChange={() => toggledSelection(error.id)}
                    />
                  </TableCell>
                  <TableCell>
                    {new Date(error.created_at).toLocaleString("vi-VN")}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{error.error_type}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={`${getSeverityColor(error.severity)} text-white`}
                    >
                      {error.severity}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={`${getStatusColor(error.status)} text-white`}
                    >
                      {error.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[300px] truncate">
                    {error.error_message}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedError(error)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>Chi tiết lỗi</DialogTitle>
                          </DialogHeader>
                          {selectedError && (
                            <div className="space-y-4">
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <label className="font-semibold">ID:</label>
                                  <p className="text-sm text-gray-600">
                                    {selectedError.id}
                                  </p>
                                </div>
                                <div>
                                  <label className="font-semibold">
                                    User ID:
                                  </label>
                                  <p className="text-sm text-gray-600">
                                    {selectedError.user_id || "N/A"}
                                  </p>
                                </div>
                                <div>
                                  <label className="font-semibold">
                                    Session ID:
                                  </label>
                                  <p className="text-sm text-gray-600">
                                    {selectedError.session_id}
                                  </p>
                                </div>
                                <div>
                                  <label className="font-semibold">
                                    IP Address:
                                  </label>
                                  <p className="text-sm text-gray-600">
                                    {selectedError.ip_address}
                                  </p>
                                </div>
                              </div>

                              <div>
                                <label className="font-semibold">
                                  Error Message:
                                </label>
                                <p className="text-sm bg-red-50 p-2 rounded mt-1">
                                  {selectedError.error_message}
                                </p>
                              </div>

                              {selectedError.error_stack && (
                                <div>
                                  <label className="font-semibold">
                                    Stack Trace:
                                  </label>
                                  <pre className="text-xs bg-gray-100 p-2 rounded mt-1 overflow-x-auto">
                                    {selectedError.error_stack}
                                  </pre>
                                </div>
                              )}

                              <div>
                                <label className="font-semibold">URL:</label>
                                <p className="text-sm text-gray-600">
                                  {selectedError.url || "N/A"}
                                </p>
                              </div>

                              <div>
                                <label className="font-semibold">
                                  User Agent:
                                </label>
                                <p className="text-sm text-gray-600">
                                  {selectedError.user_agent || "N/A"}
                                </p>
                              </div>
                            </div>
                          )}
                        </DialogContent>
                      </Dialog>

                      <Select
                        value={error.status}
                        onValueChange={(value) =>
                          updateErrorStatus(error.id, value)
                        }
                      >
                        <SelectTrigger className="w-[120px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="new">Mới</SelectItem>
                          <SelectItem value="investigating">
                            Đang xử lý
                          </SelectItem>
                          <SelectItem value="fixed">Đã sửa</SelectItem>
                          <SelectItem value="ignored">Bỏ qua</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
