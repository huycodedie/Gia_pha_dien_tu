"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Clock,
  HelpCircle,
  Loader2,
  MapPin,
  Pin,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/components/auth-provider";
import { supabase } from "@/lib/supabase";

type EventType = "MEMORIAL" | "MEETING" | "FESTIVAL" | "QR" | "OTHER";
type RsvpStatus = "GOING" | "MAYBE" | "NOT_GOING";

interface EventDetail {
  id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  location: string | null;
  type: EventType;
  is_recurring: boolean;
  is_pinned: boolean;
  image_url: string | null;
  creator_id: string;
  creator?: { display_name: string | null; email: string | null } | null;
}

interface EventRsvp {
  id: string;
  event_id: string;
  user_id: string;
  status: RsvpStatus;
  user?: { display_name: string | null; email: string | null } | null;
}

const typeLabels: Record<EventType, { label: string; icon: string }> = {
  MEMORIAL: { label: "Giỗ", icon: "🕯️" },
  MEETING: { label: "Họp họ", icon: "🤝" },
  FESTIVAL: { label: "Lễ hội", icon: "🎊" },
  QR: { label: "Ủng hộ", icon: "💰" },
  OTHER: { label: "Khác", icon: "📅" },
};

const rsvpOptions: Array<{
  status: RsvpStatus;
  label: string;
  icon: typeof Check;
  variant: "default" | "secondary" | "destructive";
}> = [
  { status: "GOING", label: "Tham dự", icon: Check, variant: "default" },
  { status: "MAYBE", label: "Có thể", icon: HelpCircle, variant: "secondary" },
  { status: "NOT_GOING", label: "Không đi", icon: X, variant: "destructive" },
];

const rsvpLabels: Record<RsvpStatus, string> = {
  GOING: "Tham dự",
  MAYBE: "Có thể",
  NOT_GOING: "Không đi",
};

function getParamId(id: string | string[] | undefined) {
  if (Array.isArray(id)) return id[0];
  return id;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("vi-VN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function displayName(rsvp: EventRsvp) {
  return rsvp.user?.display_name || rsvp.user?.email?.split("@")[0] || "Thành viên";
}

export default function EventDetailPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = getParamId(params.id);
  const { user, isLoggedIn } = useAuth();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [rsvps, setRsvps] = useState<EventRsvp[]>([]);
  const [myRsvp, setMyRsvp] = useState<RsvpStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingRsvp, setSavingRsvp] = useState<RsvpStatus | "DELETE" | null>(null);
  const [error, setError] = useState("");

  const fetchEvent = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    setError("");

    const { data, error: eventError } = await supabase
      .from("events")
      .select("*, creator:profiles(display_name, email)")
      .eq("id", eventId)
      .maybeSingle();

    if (eventError) {
      setError(eventError.message || "Không thể tải sự kiện.");
      setEvent(null);
      setLoading(false);
      return;
    }

    if (!data) {
      setEvent(null);
      setRsvps([]);
      setMyRsvp(null);
      setLoading(false);
      return;
    }

    const { data: rsvpData, error: rsvpError } = await supabase
      .from("event_rsvps")
      .select("*, user:profiles(display_name, email)")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true });

    if (rsvpError) {
      setError(rsvpError.message || "Không thể tải danh sách phản hồi.");
      setEvent(data as EventDetail);
      setRsvps([]);
      setMyRsvp(null);
      setLoading(false);
      return;
    }

    const loadedRsvps = (rsvpData ?? []) as EventRsvp[];
    setEvent(data as EventDetail);
    setRsvps(loadedRsvps);
    setMyRsvp(
      user
        ? loadedRsvps.find((rsvp) => rsvp.user_id === user.id)?.status ?? null
        : null,
    );
    setLoading(false);
  }, [eventId, user]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchEvent();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [fetchEvent]);

  const counts = useMemo(() => {
    return rsvps.reduce<Record<RsvpStatus, number>>(
      (acc, rsvp) => {
        acc[rsvp.status] += 1;
        return acc;
      },
      { GOING: 0, MAYBE: 0, NOT_GOING: 0 },
    );
  }, [rsvps]);

  const handleRsvp = async (status: RsvpStatus) => {
    if (!user || !eventId) return;
    setSavingRsvp(status);
    setError("");

    const { error: saveError } = await supabase.from("event_rsvps").upsert(
      { event_id: eventId, user_id: user.id, status },
      { onConflict: "event_id,user_id" },
    );

    if (saveError) {
      setError(saveError.message || "Không thể lưu phản hồi.");
      setSavingRsvp(null);
      return;
    }

    await fetchEvent();
    setSavingRsvp(null);
  };

  const deleteMyRsvp = async () => {
    if (!user || !eventId) return;
    setSavingRsvp("DELETE");
    setError("");

    const { error: deleteError } = await supabase
      .from("event_rsvps")
      .delete()
      .eq("event_id", eventId)
      .eq("user_id", user.id);

    if (deleteError) {
      setError(deleteError.message || "Không thể hủy phản hồi.");
      setSavingRsvp(null);
      return;
    }

    await fetchEvent();
    setSavingRsvp(null);
  };

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/events")}>
          <ArrowLeft className="h-4 w-4" />
          Quay lại
        </Button>
        <div className="rounded-md border px-4 py-8 text-center text-muted-foreground">
          {error || "Không tìm thấy sự kiện hoặc bạn không có quyền xem."}
        </div>
      </div>
    );
  }

  const typeLabel = typeLabels[event.type] || typeLabels.OTHER;
  const isUpcoming = new Date(event.start_at) > new Date();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button variant="ghost" size="sm" onClick={() => router.push("/events")}>
        <ArrowLeft className="h-4 w-4" />
        Quay lại
      </Button>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <Card className={event.is_pinned ? "border-yellow-300" : ""}>
        {event.image_url && (
          <img
            src={event.image_url}
            alt={event.title}
            className="h-64 w-full rounded-t-lg object-cover"
          />
        )}
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              {typeLabel.icon} {typeLabel.label}
            </Badge>
            {event.is_pinned && (
              <Badge variant="outline" className="border-yellow-300 text-yellow-700">
                <Pin className="h-3 w-3" />
                Đã ghim
              </Badge>
            )}
            <Badge variant={isUpcoming ? "default" : "secondary"}>
              {isUpcoming ? "Sắp diễn ra" : "Đã diễn ra"}
            </Badge>
            {event.is_recurring && <Badge variant="outline">Lặp lại</Badge>}
          </div>
          <CardTitle className="break-words text-2xl">{event.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {event.description && (
            <p className="whitespace-pre-wrap text-muted-foreground">{event.description}</p>
          )}

          <div className="grid gap-3 text-sm md:grid-cols-2">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <span>{formatDateTime(event.start_at)}</span>
            </div>
            {event.end_at && (
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4" />
                <span>Kết thúc: {formatDateTime(event.end_at)}</span>
              </div>
            )}
            {event.location && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                <span>{event.location}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span>{counts.GOING} người tham dự</span>
            </div>
          </div>

          {isLoggedIn && (
            <div className="space-y-3 border-t pt-4">
              <div className="flex flex-wrap gap-2">
                {rsvpOptions.map((option) => (
                  <Button
                    key={option.status}
                    variant={myRsvp === option.status ? option.variant : "outline"}
                    size="sm"
                    disabled={savingRsvp !== null}
                    onClick={() => handleRsvp(option.status)}
                  >
                    {savingRsvp === option.status ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <option.icon className="h-4 w-4" />
                    )}
                    {option.label}
                  </Button>
                ))}
                {myRsvp && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={savingRsvp !== null}
                    onClick={deleteMyRsvp}
                  >
                    {savingRsvp === "DELETE" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    Hủy phản hồi
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                <span>Tham dự: {counts.GOING}</span>
                <span>Có thể: {counts.MAYBE}</span>
                <span>Không đi: {counts.NOT_GOING}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {rsvps.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Danh sách phản hồi</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {rsvps.map((rsvp) => (
                <div
                  key={rsvp.id}
                  className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate">{displayName(rsvp)}</span>
                  <Badge variant="secondary">{rsvpLabels[rsvp.status]}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
