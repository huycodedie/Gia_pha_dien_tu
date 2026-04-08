"use client";

import { useEffect, useState } from "react";
import { Users, Plus, Copy, Trash2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/components/auth-provider";
import {
  createGuestInvitation,
  getMyGuests,
  removeGuest,
  getMyPendingInvitations,
} from "@/lib/supabase-data";
import { toast } from "sonner";

interface Guest {
  id: string;
  email: string;
  display_name: string;
  created_at: string;
}

interface PendingInvitation {
  id: string;
  code: string;
  expires_at: string;
  created_at: string;
}

export default function GuestsPage() {
  const { user, profile } = useAuth();
  const [guests, setGuests] = useState<Guest[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<
    PendingInvitation[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (user) {
      fetchGuests();
    }
  }, [user]);

  const fetchGuests = async () => {
    const guestList = await getMyGuests();
    const pendingList = await getMyPendingInvitations();
    setGuests(guestList);
    setPendingInvitations(pendingList);
    setLoading(false);
  };

  const copyTextToClipboard = async (text: string) => {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    if (typeof document !== "undefined") {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.top = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
      const successful = document.execCommand("copy");
      document.body.removeChild(textarea);
      return successful;
    }

    return false;
  };

  const handleCreateInvitation = async () => {
    setCreating(true);
    const { code, error } = await createGuestInvitation();

    if (error) {
      toast.error("Không thể tạo mã mời: " + error);
    } else if (code) {
      const invitationUrl = `${window.location.origin}/register-guest?code=${code}`;

      // Always show the URL in toast for manual copy
      toast.success(invitationUrl, {
        duration: 10000,
      });

      // Try to copy only the URL to clipboard
      try {
        const copied = await copyTextToClipboard(invitationUrl);
        if (copied) {
          toast.success("Đã sao chép link mời!");
        }
      } catch (clipboardError) {
        console.warn("Clipboard not available:", clipboardError);
      }

      // Refresh the pending invitations list
      fetchGuests();
    }
    setCreating(false);
  };

  const handleRemoveGuest = async (guestId: string, guestName: string) => {
    if (!confirm(`Bạn có chắc muốn xóa tài khoản khách "${guestName}"?`)) {
      return;
    }

    const { error } = await removeGuest(guestId);
    if (error) {
      toast.error("Không thể xóa tài khoản: " + error);
    } else {
      toast.success("Đã xóa tài khoản khách");
      fetchGuests();
    }
  };

  const copyInvitationLink = async (code: string) => {
    const invitationUrl = `${window.location.origin}/register-guest?code=${code}`;

    try {
      const copied = await copyTextToClipboard(invitationUrl);
      if (copied) {
        toast.success("Đã sao chép link mời!");
      } else {
        toast.success(invitationUrl, { duration: 10000 });
      }
    } catch (clipboardError) {
      console.warn("Clipboard not available:", clipboardError);
      toast.success(invitationUrl, { duration: 10000 });
    }
  };

  // Only users can access this page
  if (profile?.role !== "user") {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Không có quyền truy cập
          </h1>
          <p className="text-gray-600">
            Chỉ tài khoản user mới có thể quản lý tài khoản khách.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Quản lý tài khoản khách
        </h1>
        <p className="text-gray-600">
          Tạo mã mời để chia sẻ cây gia phả của bạn với thành viên gia đình hoặc
          bạn bè.
        </p>
      </div>

      {/* Create Invitation */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Tạo mã mời mới
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600 mb-4">
            Tạo một mã mời duy nhất để chia sẻ với người khác. Họ có thể sử dụng
            mã này để tạo tài khoản khách và xem cây gia phả của bạn.
          </p>
          <Button
            onClick={handleCreateInvitation}
            disabled={creating}
            className="flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            {creating ? "Đang tạo..." : "Tạo mã mời"}
          </Button>
        </CardContent>
      </Card>

      {/* Pending Invitations */}
      {pendingInvitations.length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ExternalLink className="w-5 h-5" />
              Mã mời đang chờ ({pendingInvitations.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {pendingInvitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div>
                    <h3 className="font-medium font-mono">{invitation.code}</h3>
                    <p className="text-sm text-gray-600">
                      Hết hạn:{" "}
                      {new Date(invitation.expires_at).toLocaleDateString(
                        "vi-VN",
                      )}
                    </p>
                    <p className="text-xs text-gray-500">
                      Tạo:{" "}
                      {new Date(invitation.created_at).toLocaleDateString(
                        "vi-VN",
                      )}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyInvitationLink(invitation.code)}
                    className="flex items-center gap-2"
                  >
                    <Copy className="w-4 h-4" />
                    Sao chép
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Guest List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Tài khoản khách ({guests.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-gray-500">Đang tải...</p>
          ) : guests.length === 0 ? (
            <p className="text-center text-gray-500">
              Chưa có tài khoản khách nào. Tạo mã mời để bắt đầu.
            </p>
          ) : (
            <div className="space-y-4">
              {guests.map((guest) => (
                <div
                  key={guest.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div>
                    <h3 className="font-medium">{guest.display_name}</h3>
                    <p className="text-sm text-gray-600">{guest.email}</p>
                    <p className="text-xs text-gray-500">
                      Tạo:{" "}
                      {new Date(guest.created_at).toLocaleDateString("vi-VN")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">Khách</Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        handleRemoveGuest(guest.id, guest.display_name)
                      }
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Hướng dẫn</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-gray-600">
          <p>• Tài khoản khách chỉ có thể xem cây gia phả của bạn</p>
          <p>• Họ không thể chỉnh sửa thông tin hoặc tạo nội dung mới</p>
          <p>• Họ không thể truy cập trang nâng cấp tài khoản</p>
          <p>• Bạn có thể xóa tài khoản khách bất cứ lúc nào</p>
          <p>• Mã mời có hiệu lực trong 30 ngày</p>
        </CardContent>
      </Card>
    </div>
  );
}
