"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Users, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth-provider";

interface Person {
  handle: string;
  displayName: string;
  gender: number;
  birthYear?: number;
  deathYear?: number;
  isLiving: boolean;
  isPrivacyFiltered: boolean;
  _privacyNote?: string;
}

export default function PeopleListPage() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [genderFilter, setGenderFilter] = useState<number | null>(null);
  const [livingFilter, setLivingFilter] = useState<boolean | null>(null);

  useEffect(() => {
    const fetchPeople = async () => {
      if (!user || !profile) return;

      try {
        const { supabase } = await import("@/lib/supabase");
        const ownerId = profile.role === "guest" ? profile.guest_of : user.id;
        const { data, error } = await supabase
          .from("people")
          .select(
            "handle, display_name, gender, birth_year, death_year, is_living, is_privacy_filtered",
          )
          .or(`owner_id.eq.${ownerId},owner_id.is.null`)
          .order("display_name", { ascending: true });
        if (!error && data) {
          setPeople(
            data.map((row: Record<string, unknown>) => ({
              handle: row.handle as string,
              displayName: row.display_name as string,
              gender: row.gender as number,
              birthYear: row.birth_year as number | undefined,
              deathYear: row.death_year as number | undefined,
              isLiving: row.is_living as boolean,
              isPrivacyFiltered: row.is_privacy_filtered as boolean,
            })),
          );
        }
      } catch {
        /* ignore */
      }
      setLoading(false);
    };
    fetchPeople();
  }, [user, profile]);

  const filtered = people.filter((p) => {
    if (search && !p.displayName.toLowerCase().includes(search.toLowerCase()))
      return false;
    if (genderFilter !== null && p.gender !== genderFilter) return false;
    if (livingFilter !== null && p.isLiving !== livingFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Users className="h-6 w-6" />
          Thành viên gia phả
        </h1>
        <p className="text-muted-foreground">
          {people.length} người trong gia phả
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tìm theo tên..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant={genderFilter === null ? "default" : "outline"}
            size="sm"
            onClick={() => setGenderFilter(null)}
          >
            Tất cả
          </Button>
          <Button
            variant={genderFilter === 1 ? "default" : "outline"}
            size="sm"
            onClick={() => setGenderFilter(1)}
          >
            Nam
          </Button>
          <Button
            variant={genderFilter === 2 ? "default" : "outline"}
            size="sm"
            onClick={() => setGenderFilter(2)}
          >
            Nữ
          </Button>
        </div>
        <div className="flex gap-2">
          <Button
            variant={livingFilter === null ? "default" : "outline"}
            size="sm"
            onClick={() => setLivingFilter(null)}
          >
            Tất cả
          </Button>
          <Button
            variant={livingFilter === true ? "default" : "outline"}
            size="sm"
            onClick={() => setLivingFilter(true)}
          >
            Còn sống
          </Button>
          <Button
            variant={livingFilter === false ? "default" : "outline"}
            size="sm"
            onClick={() => setLivingFilter(false)}
          >
            Đã mất
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : (
            <div className="max-h-[600px] overflow-auto relative">
              <table className="w-full caption-bottom text-sm">
                <thead className="sticky top-0 z-50 bg-background shadow-sm [&_tr]:border-b">
                  <tr className="border-b transition-colors">
                    <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap">
                      Họ tên
                    </th>
                    <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap">
                      Giới tính
                    </th>
                    <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap">
                      Năm sinh
                    </th>
                    <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap">
                      Năm mất
                    </th>
                    <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap">
                      Trạng thái
                    </th>
                  </tr>
                </thead>
                <tbody className="[&_tr:last-child]:border-0">
                  {filtered.map((p) => (
                    <tr
                      key={p.handle}
                      className="cursor-pointer border-b transition-colors hover:bg-accent/50"
                      onClick={() => router.push(`/people/${p.handle}`)}
                    >
                      <td className="p-2 align-middle whitespace-nowrap font-medium">
                        {p.displayName}
                        {p.isPrivacyFiltered && (
                          <span className="ml-1 text-amber-500">🔒</span>
                        )}
                      </td>
                      <td className="p-2 align-middle whitespace-nowrap">
                        <Badge variant="outline">
                          {p.gender === 1 ? "Nam" : p.gender === 2 ? "Nữ" : "?"}
                        </Badge>
                      </td>
                      <td className="p-2 align-middle whitespace-nowrap">
                        {p.birthYear || "—"}
                      </td>
                      <td className="p-2 align-middle whitespace-nowrap">
                        {p.deathYear || (p.isLiving ? "—" : "?")}
                      </td>
                      <td className="p-2 align-middle whitespace-nowrap">
                        <Badge variant={p.isLiving ? "default" : "secondary"}>
                          {p.isLiving ? "Còn sống" : "Đã mất"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr className="border-b transition-colors">
                      <td
                        colSpan={5}
                        className="p-2 align-middle whitespace-nowrap text-center text-muted-foreground py-8"
                      >
                        {search
                          ? "Không tìm thấy kết quả"
                          : "Chưa có dữ liệu gia phả"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
