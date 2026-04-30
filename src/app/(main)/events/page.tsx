"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  MapPin,
  Clock,
  Users,
  Plus,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  HelpCircle,
  Upload,
  Pin,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAuth } from "@/components/auth-provider";
import { supabase } from "@/lib/supabase";

interface EventItem {
  id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  location: string | null;
  type: string;
  is_recurring: boolean;
  is_pinned: boolean;
  image_url: string | null;
  creator_id: string;
  created_at: string;
  creator?: { display_name: string | null; email: string };
  rsvp_count?: number;
}

const typeLabels: Record<string, { label: string; emoji: string }> = {
  MEMORIAL: { label: "Giỗ", emoji: "🕯️" },
  MEETING: { label: "Họp họ", emoji: "🤝" },
  FESTIVAL: { label: "Lễ hội", emoji: "🎊" },
  QR: { label: "Ủng hộ", emoji: "💰" },
  OTHER: { label: "Khác", emoji: "📅" },
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

function CreateEventDialog({ onCreated }: { onCreated: () => void }) {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startAt, setStartAt] = useState("");
  const [location, setLocation] = useState("");
  const [type, setType] = useState("MEETING");
  const [isPinned, setIsPinned] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadImage = async (file: File): Promise<string | null> => {
    const fileExt = file.name.split(".").pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const filePath = `events/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("images")
      .upload(filePath, file);

    if (uploadError) {
      console.error("Error uploading image:", uploadError);
      return null;
    }

    const { data } = supabase.storage.from("images").getPublicUrl(filePath);

    return data.publicUrl;
  };

  const handleSubmit = async () => {
    if (!title.trim() || !startAt || !profile) return;
    setSubmitting(true);
    setError("");
    try {
      console.log("Creating event with profile:", profile);

      let imageUrl = null;
      if (imageFile) {
        imageUrl = await uploadImage(imageFile);
        if (!imageUrl) {
          setError("Không thể upload ảnh");
          setSubmitting(false);
          return;
        }
      }

      const eventData = {
        title: title.trim(),
        description: description.trim() || null,
        start_at: new Date(startAt).toISOString(),
        location: location.trim() || null,
        type,
        is_pinned: isPinned,
        image_url: imageUrl,
        creator_id: profile.id,
      };

      console.log("Event data to insert:", eventData);

      const { error: insertError, data } = await supabase
        .from("events")
        .insert(eventData);

      console.log("Insert result:", { error: insertError, data });

      if (insertError) {
        setError(insertError.message || "Không thể tạo sự kiện");
      } else {
        setOpen(false);
        setTitle("");
        setDescription("");
        setStartAt("");
        setLocation("");
        setIsPinned(false);
        setImageFile(null);
        setImagePreview(null);
        setError("");
        onCreated();
      }
    } catch (err) {
      console.error("Create event error:", err);
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {profile?.role === "user" ? (
          <Button variant="outline">
            <Plus className="mr-2 h-4 w-4" />
            Tạo sự kiện
          </Button>
        ) : null}
        {/* <Button>
          <Plus className="mr-2 h-4 w-4" />
          Tạo sự kiện
        </Button> */}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tạo sự kiện mới</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          {error && (
            <div className="text-sm text-red-500 bg-red-50 p-2 rounded">
              {error}
            </div>
          )}
          <Input
            placeholder="Tên sự kiện *"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Textarea
            placeholder="Mô tả"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
          <Input
            type="datetime-local"
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
          />
          <Input
            placeholder="Địa điểm"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
          <div className="space-y-2">
            <label className="text-sm font-medium">Ảnh sự kiện</label>
            <div className="flex items-center gap-2">
              <Input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="flex-1"
              />
              <Upload className="h-4 w-4 text-gray-500" />
            </div>
            {imagePreview && (
              <div className="mt-2">
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="w-full max-w-xs h-32 object-cover rounded-md"
                />
              </div>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="isPinned"
              checked={isPinned}
              onChange={(e) => setIsPinned(e.target.checked)}
              className="rounded"
            />
            <label
              htmlFor="isPinned"
              className="text-sm font-medium flex items-center gap-2"
            >
              <Pin className="h-4 w-4" />
              Ghim sự kiện (hiển thị ở đầu danh sách)
            </label>
          </div>
          <select
            className="w-full rounded-md border px-3 py-2 text-sm bg-background"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            {Object.entries(typeLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v.emoji} {v.label}
              </option>
            ))}
          </select>
          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={!title.trim() || !startAt || submitting}
          >
            {submitting ? "Đang tạo..." : "Tạo sự kiện"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EventCard({ event }: { event: EventItem }) {
  const router = useRouter();
  const tl = typeLabels[event.type] || typeLabels.OTHER;
  const isUpcoming = new Date(event.start_at) > new Date();

  return (
    <Card
      className={`hover:shadow-md transition-shadow cursor-pointer ${
        isUpcoming ? "border-green-200 bg-green-50/50" : ""
      } ${event.is_pinned ? "border-yellow-300 bg-yellow-50/30" : ""}`}
      onClick={() => router.push(`/events/${event.id}`)}
    >
      {event.image_url && (
        <div className="relative">
          <img
            src={event.image_url}
            alt={event.title}
            className="w-full h-32 object-cover rounded-t-lg"
          />
          {event.is_pinned && (
            <div className="absolute top-2 right-2 bg-yellow-500 text-white p-1 rounded-full">
              <Pin className="h-3 w-3" />
            </div>
          )}
        </div>
      )}
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="secondary" className="text-xs">
                {tl.emoji} {tl.label}
              </Badge>
              {event.is_pinned && !event.image_url && (
                <Badge
                  variant="outline"
                  className="text-xs text-yellow-600 border-yellow-300"
                >
                  <Pin className="h-3 w-3 mr-1" />
                  Đã ghim
                </Badge>
              )}
            </div>
            <h3 className="font-semibold">{event.title}</h3>
            <div className="flex items-center gap-1 mt-1">
              <div
                className={`w-2 h-2 rounded-full ${
                  isUpcoming ? "bg-green-500" : "bg-gray-400"
                }`}
              />
              <span className="text-xs text-muted-foreground">
                {isUpcoming ? "Sắp diễn ra" : "Đã diễn ra"}
              </span>
            </div>
          </div>
          {event.rsvp_count !== undefined && event.rsvp_count > 0 && (
            <Badge variant="outline">
              <Users className="h-3 w-3 mr-1" />
              {event.rsvp_count}
            </Badge>
          )}
        </div>
        {event.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {event.description}
          </p>
        )}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
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
        </div>
      </CardContent>
    </Card>
  );
}

export default function EventsPage() {
  const { isLoggedIn, profile } = useAuth();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEvents = useCallback(async () => {
    if (!profile) {
      console.log("No profile, skipping fetch");
      setEvents([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      console.log("Fetching events for profile:", profile);
      const { data, error } = await supabase
        .from("events")
        .select("*, creator:profiles(display_name, email)")
        .order("start_at", { ascending: false });

      console.log("Events query result:", { data, error });

      if (error) {
        console.error("Supabase error:", error);
        setEvents([]);
        return;
      }

      if (data) {
        console.log("Raw events data:", data);
        // Filter events based on permissions
        const filteredEvents = data.filter((event) => {
          const isCreator = event.creator_id === profile.id;
          const isGuest =
            profile.guest_of && profile.guest_of === event.creator_id;
          const isAdmin = profile.role === "admin";

          console.log(
            `Event "${event.title}": creator_id=${event.creator_id}, profile.id=${profile.id}, isCreator=${isCreator}, isGuest=${isGuest}, isAdmin=${isAdmin}`,
          );

          if (isCreator) return true;
          if (isGuest) return true;
          if (isAdmin) return true;

          return false;
        });

        console.log("Filtered events:", filteredEvents);
        // Sort events: pinned first, then by start_at descending
        const sortedEvents = filteredEvents.sort((a, b) => {
          if (a.is_pinned && !b.is_pinned) return -1;
          if (!a.is_pinned && b.is_pinned) return 1;
          return (
            new Date(b.start_at).getTime() - new Date(a.start_at).getTime()
          );
        });
        setEvents(sortedEvents);
      } else {
        console.log("No events data");
        setEvents([]);
      }
    } catch (err) {
      console.error("Error fetching events:", err);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    if (profile) {
      fetchEvents();
    }
  }, [fetchEvents, profile]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CalendarDays className="h-6 w-6" />
            Sự kiện
          </h1>
          <p className="text-muted-foreground">Lịch các hoạt động dòng họ</p>
        </div>
        {isLoggedIn && <CreateEventDialog onCreated={fetchEvents} />}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : events.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CalendarDays className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Chưa có sự kiện nào</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}
