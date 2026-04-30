"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  CalendarRange,
  Clock,
  Edit,
  ImagePlus,
  MapPin,
  Pin,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/components/auth-provider";
import { supabase } from "@/lib/supabase";

type EventType = "MEMORIAL" | "MEETING" | "FESTIVAL" | "QR" | "OTHER";
type EventFilter = "ALL" | "UPCOMING" | "PAST" | "PINNED";
type ViewMode = "LIST" | "MONTH";

interface EventRsvp {
  status: "GOING" | "MAYBE" | "NOT_GOING";
}

interface EventItem {
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
  created_at: string;
  creator?: { display_name: string | null; email: string | null } | null;
  event_rsvps?: EventRsvp[];
}

const typeLabels: Record<EventType, { label: string; icon: string }> = {
  MEMORIAL: { label: "Giỗ", icon: "🕯️" },
  MEETING: { label: "Họp họ", icon: "🤝" },
  FESTIVAL: { label: "Lễ hội", icon: "🎊" },
  QR: { label: "Ủng hộ", icon: "💰" },
  OTHER: { label: "Khác", icon: "📅" },
};

const filterLabels: Record<EventFilter, string> = {
  ALL: "Tất cả",
  UPCOMING: "Sắp diễn ra",
  PAST: "Đã diễn ra",
  PINNED: "Đã ghim",
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toLocalInputValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function getStoragePathFromUrl(url: string | null) {
  if (!url) return null;
  const marker = "/storage/v1/object/public/events/";
  const index = url.indexOf(marker);
  if (index === -1) return null;
  return decodeURIComponent(url.slice(index + marker.length));
}

async function removeEventImage(imageUrl: string | null) {
  const path = getStoragePathFromUrl(imageUrl);
  if (path) await supabase.storage.from("events").remove([path]);
}

async function uploadEventImage(userId: string, file: File) {
  const ext = file.name.split(".").pop() || "jpg";
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}`;
  const path = `${userId}/${id}.${ext}`;

  const { error } = await supabase.storage.from("events").upload(path, file, {
    upsert: false,
  });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from("events").getPublicUrl(path);
  return data.publicUrl;
}

function canManageEvent(
  profile: { id: string; role: string | null } | null,
  event?: EventItem,
) {
  if (!profile) return false;
  if (profile.role === "admin") return true;
  if (!event) return profile.role === "user";
  return profile.role === "user" && event.creator_id === profile.id;
}

function EventDialog({
  event,
  onSaved,
}: {
  event?: EventItem;
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState(event?.title ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [startAt, setStartAt] = useState(toLocalInputValue(event?.start_at ?? null));
  const [endAt, setEndAt] = useState(toLocalInputValue(event?.end_at ?? null));
  const [location, setLocation] = useState(event?.location ?? "");
  const [type, setType] = useState<EventType>(event?.type ?? "MEETING");
  const [isPinned, setIsPinned] = useState(event?.is_pinned ?? false);
  const [isRecurring, setIsRecurring] = useState(event?.is_recurring ?? false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(
    event?.image_url ?? null,
  );

  const isEditing = !!event;
  const canSubmit = canManageEvent(profile, event);

  const resetCreateForm = () => {
    if (isEditing) return;
    setTitle("");
    setDescription("");
    setStartAt("");
    setEndAt("");
    setLocation("");
    setType("MEETING");
    setIsPinned(false);
    setIsRecurring(false);
    setImageFile(null);
    setImagePreview(null);
  };

  const handleImageChange = (file: File | undefined) => {
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleSubmit = async () => {
    if (!profile || !title.trim() || !startAt || !canSubmit) return;
    if (endAt && new Date(endAt) < new Date(startAt)) {
      setError("Thời gian kết thúc phải sau thời gian bắt đầu.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      let imageUrl = event?.image_url ?? null;
      if (imageFile) {
        imageUrl = await uploadEventImage(profile.id, imageFile);
        if (event?.image_url) await removeEventImage(event.image_url);
      }

      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        start_at: new Date(startAt).toISOString(),
        end_at: endAt ? new Date(endAt).toISOString() : null,
        location: location.trim() || null,
        type,
        is_recurring: isRecurring,
        is_pinned: isPinned,
        image_url: imageUrl,
        creator_id: event?.creator_id ?? profile.id,
      };

      const request = isEditing
        ? supabase.from("events").update(payload).eq("id", event.id)
        : supabase.from("events").insert(payload);
      const { error: saveError } = await request;

      if (saveError) {
        setError(saveError.message || "Không thể lưu sự kiện.");
        return;
      }

      setOpen(false);
      resetCreateForm();
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!canSubmit) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={isEditing ? "ghost" : "outline"} size={isEditing ? "sm" : "default"}>
          {isEditing ? <Edit className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {isEditing ? "Sửa" : "Tạo sự kiện"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Sửa sự kiện" : "Tạo sự kiện mới"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <Input
            placeholder="Tên sự kiện *"
            value={title}
            onChange={(eventValue) => setTitle(eventValue.target.value)}
          />
          <Textarea
            placeholder="Mô tả"
            value={description}
            onChange={(eventValue) => setDescription(eventValue.target.value)}
            rows={3}
          />
          <div className="grid gap-3 md:grid-cols-2">
            <Input
              type="datetime-local"
              value={startAt}
              onChange={(eventValue) => setStartAt(eventValue.target.value)}
            />
            <Input
              type="datetime-local"
              value={endAt}
              onChange={(eventValue) => setEndAt(eventValue.target.value)}
            />
          </div>
          <Input
            placeholder="Địa điểm"
            value={location}
            onChange={(eventValue) => setLocation(eventValue.target.value)}
          />
          <Select value={type} onValueChange={(value) => setType(value as EventType)}>
            <SelectTrigger>
              <SelectValue placeholder="Loại sự kiện" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(typeLabels).map(([key, value]) => (
                <SelectItem key={key} value={key}>
                  {value.icon} {value.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <label className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm">
            <ImagePlus className="h-4 w-4" />
            <span>Chọn ảnh sự kiện</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(eventValue) => handleImageChange(eventValue.target.files?.[0])}
            />
          </label>
          {imagePreview && (
            <div className="relative overflow-hidden rounded-md border">
              <img src={imagePreview} alt="Ảnh sự kiện" className="h-40 w-full object-cover" />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="absolute right-2 top-2"
                onClick={() => {
                  setImageFile(null);
                  setImagePreview(null);
                }}
              >
                <X className="h-4 w-4" />
                Bỏ ảnh
              </Button>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isPinned}
                onChange={(eventValue) => setIsPinned(eventValue.target.checked)}
              />
              Ghim sự kiện
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={(eventValue) => setIsRecurring(eventValue.target.checked)}
              />
              Sự kiện lặp lại
            </label>
          </div>

          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={!title.trim() || !startAt || submitting}
          >
            {submitting ? "Đang lưu..." : "Lưu sự kiện"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EventCard({
  event,
  profile,
  onChanged,
}: {
  event: EventItem;
  profile: { id: string; role: string | null } | null;
  onChanged: () => void;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const typeLabel = typeLabels[event.type] || typeLabels.OTHER;
  const isUpcoming = new Date(event.start_at) > new Date();
  const goingCount =
    event.event_rsvps?.filter((rsvp) => rsvp.status === "GOING").length ?? 0;
  const canEdit = canManageEvent(profile, event);

  const deleteEvent = async () => {
    if (!canEdit || !confirm("Xóa sự kiện này?")) return;
    setDeleting(true);
    setError("");
    const { error: deleteError } = await supabase
      .from("events")
      .delete()
      .eq("id", event.id);

    if (deleteError) {
      setError(deleteError.message || "Không thể xóa sự kiện.");
      setDeleting(false);
      return;
    }

    await removeEventImage(event.image_url);
    onChanged();
  };

  const togglePinned = async () => {
    if (!canEdit) return;
    const { error: pinError } = await supabase
      .from("events")
      .update({ is_pinned: !event.is_pinned })
      .eq("id", event.id);

    if (pinError) {
      setError(pinError.message || "Không thể cập nhật ghim.");
      return;
    }
    onChanged();
  };

  return (
    <Card className={event.is_pinned ? "border-yellow-300 bg-yellow-50/40" : ""}>
      {event.image_url && (
        <button
          type="button"
          className="block w-full overflow-hidden rounded-t-lg"
          onClick={() => router.push(`/events/${event.id}`)}
        >
          <img src={event.image_url} alt={event.title} className="h-40 w-full object-cover" />
        </button>
      )}
      <CardContent className="space-y-3 p-4">
        {error && <div className="text-sm text-red-600">{error}</div>}
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            onClick={() => router.push(`/events/${event.id}`)}
          >
            <div className="mb-2 flex flex-wrap items-center gap-2">
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
            </div>
            <h3 className="break-words text-base font-semibold">{event.title}</h3>
          </button>
          {canEdit && (
            <div className="flex shrink-0 items-center gap-1">
              <Button variant="ghost" size="sm" onClick={togglePinned}>
                <Pin className="h-4 w-4" />
              </Button>
              <EventDialog event={event} onSaved={onChanged} />
              <Button variant="ghost" size="sm" onClick={deleteEvent} disabled={deleting}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {event.description && (
          <p className="line-clamp-2 text-sm text-muted-foreground">{event.description}</p>
        )}

        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDate(event.start_at)} · {formatTime(event.start_at)}
          </span>
          {event.location && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {event.location}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            {goingCount} tham dự
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function MonthView({ events }: { events: EventItem[] }) {
  const grouped = useMemo(() => {
    return events.reduce<Record<string, EventItem[]>>((acc, event) => {
      const key = new Date(event.start_at).toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
      });
      acc[key] = [...(acc[key] ?? []), event];
      return acc;
    }, {});
  }, [events]);

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {Object.entries(grouped).map(([day, dayEvents]) => (
        <Card key={day}>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2 font-medium">
              <CalendarRange className="h-4 w-4" />
              {day}
            </div>
            <div className="space-y-2">
              {dayEvents.map((event) => (
                <div key={event.id} className="rounded-md border p-2 text-sm">
                  <div className="font-medium">{event.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatTime(event.start_at)}
                    {event.location ? ` · ${event.location}` : ""}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function EventsPage() {
  const { isLoggedIn, profile } = useAuth();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<EventType | "ALL">("ALL");
  const [eventFilter, setEventFilter] = useState<EventFilter>("ALL");
  const [viewMode, setViewMode] = useState<ViewMode>("LIST");
  const [nowMs, setNowMs] = useState(0);

  const fetchEvents = useCallback(async () => {
    if (!profile) {
      setEvents([]);
      setLoading(false);
      setNowMs(Date.now());
      return;
    }

    setLoading(true);
    setError("");
    const { data, error: fetchError } = await supabase
      .from("events")
      .select("*, creator:profiles(display_name, email), event_rsvps(status)")
      .order("is_pinned", { ascending: false })
      .order("start_at", { ascending: false });

    if (fetchError) {
      setError(fetchError.message || "Không thể tải danh sách sự kiện.");
      setEvents([]);
      setLoading(false);
      setNowMs(Date.now());
      return;
    }

    setEvents((data ?? []) as EventItem[]);
    setNowMs(Date.now());
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    if (!profile) return;

    const timeoutId = window.setTimeout(() => {
      void fetchEvents();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [fetchEvents, profile]);

  const filteredEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return events.filter((event) => {
      const startTime = new Date(event.start_at).getTime();
      const matchesQuery =
        !normalizedQuery ||
        event.title.toLowerCase().includes(normalizedQuery) ||
        event.description?.toLowerCase().includes(normalizedQuery) ||
        event.location?.toLowerCase().includes(normalizedQuery);
      const matchesType = typeFilter === "ALL" || event.type === typeFilter;
      const matchesStatus =
        eventFilter === "ALL" ||
        (eventFilter === "UPCOMING" && startTime >= nowMs) ||
        (eventFilter === "PAST" && startTime < nowMs) ||
        (eventFilter === "PINNED" && event.is_pinned);

      return matchesQuery && matchesType && matchesStatus;
    });
  }, [eventFilter, events, nowMs, query, typeFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <CalendarDays className="h-6 w-6" />
            Sự kiện
          </h1>
          <p className="text-muted-foreground">Lịch các hoạt động dòng họ</p>
        </div>
        {isLoggedIn && <EventDialog onSaved={fetchEvents} />}
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_170px_170px_150px]">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Tìm theo tên, mô tả, địa điểm"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <Select
            value={typeFilter}
            onValueChange={(value) => setTypeFilter(value as EventType | "ALL")}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tất cả loại</SelectItem>
              {Object.entries(typeLabels).map(([key, value]) => (
                <SelectItem key={key} value={key}>
                  {value.icon} {value.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={eventFilter}
            onValueChange={(value) => setEventFilter(value as EventFilter)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(filterLabels).map(([key, value]) => (
                <SelectItem key={key} value={key}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={viewMode} onValueChange={(value) => setViewMode(value as ViewMode)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="LIST">Danh sách</SelectItem>
              <SelectItem value="MONTH">Theo ngày</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
        </div>
      ) : filteredEvents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CalendarDays className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">Chưa có sự kiện phù hợp</p>
          </CardContent>
        </Card>
      ) : viewMode === "MONTH" ? (
        <MonthView events={filteredEvents} />
      ) : (
        <div className="grid gap-4">
          {filteredEvents.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              profile={profile}
              onChanged={fetchEvents}
            />
          ))}
        </div>
      )}
    </div>
  );
}
