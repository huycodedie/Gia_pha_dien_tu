"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  TreePine,
  Users,
  Image,
  Activity,
  Newspaper,
  CalendarDays,
  Crown,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth-provider";

interface Stats {
  people: number;
  families: number;
  profiles: number;
  posts: number;
  events: number;
  media: number;
}

export default function HomePage() {
  const { user, profile } = useAuth();
  const [stats, setStats] = useState<Stats>({
    people: 0,
    families: 0,
    profiles: 0,
    posts: 0,
    events: 0,
    media: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const tables = [
          "people",
          "families",
          "profiles",
          "posts",
          "events",
        ] as const;
        const counts: Record<string, number> = {};
        
        for (const t of tables) {
          let query = supabase.from(t).select("*", { count: "exact", head: true });
          
          // Apply filters for people and families based on user role
          if ((t === "people" || t === "families") && user && profile) {
            if (profile.role === "admin") {
              // Admin sees all data
            } else if (profile.role === "guest" && profile.guest_of) {
              // Guest sees only creator's data or demo data
              query = query.or(`owner_id.eq.${profile.guest_of},owner_id.is.null`);
            } else {
              // Regular user sees only their data or demo data
              query = query.or(`owner_id.eq.${user.id},owner_id.is.null`);
            }
          }
          
          const { count } = await query;
          counts[t] = count || 0;
        }
        
        setStats(counts as unknown as Stats);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, [user, profile]);

  const cards = [
    {
      title: "Thành viên gia phả",
      icon: TreePine,
      value: stats.people,
      desc: "Trong cơ sở dữ liệu",
      href: "/tree",
    },
    {
      title: "Dòng họ (families)",
      icon: Users,
      value: stats.families,
      desc: "Gia đình đã ghi nhận",
      href: "/tree",
    },
    // { title: 'Tài khoản', icon: Users, value: stats.profiles, desc: 'Người dùng đã đăng ký', href: '/directory' },
    {
      title: "Bài viết",
      icon: Newspaper,
      value: stats.posts,
      desc: "Bảng tin dòng họ",
      href: "/feed",
    },
    {
      title: "Sự kiện",
      icon: CalendarDays,
      value: stats.events,
      desc: "Hoạt động sắp tới",
      href: "/events",
    },
    {
      title: "Nâng cấp tài khoản",
      icon: Crown,
      value: null,
      desc: "Mở khóa tính năng",
      href: "/pricing",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Trang chủ</h1>
        <p className="text-muted-foreground">
          Chào mừng đến với Gia phả dòng họ
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.title} href={c.href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{c.title}</CardTitle>
                <c.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {loading ? "..." : c.value}
                </div>
                <p className="text-xs text-muted-foreground">{c.desc}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bắt đầu nhanh</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Link href="/tree">
              <Button variant="outline">🌳 Xem cây gia phả</Button>
            </Link>
            <Link href="/feed">
              <Button variant="outline">📰 Bảng tin</Button>
            </Link>
            <Link href="/events">
              <Button variant="outline">📅 Sự kiện</Button>
            </Link>
            <Link href="/book">
              <Button variant="outline">📖 Sách gia phả</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
