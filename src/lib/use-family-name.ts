import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { supabase } from "@/lib/supabase";

export function useFamilyName() {
  const { profile } = useAuth();
  const [familyName, setFamilyName] = useState("");

  useEffect(() => {
    if (profile?.role === "admin") {
      setFamilyName("Quản trị");
      return;
    }

    let cancelled = false;

    const loadFamilyName = async () => {
      const userId = profile?.id;
      let query = supabase
        .from("people")
        .select("display_name, owner_id")
        .eq("gender", 1)
        .eq("is_patrilineal", true)
        .order("generation")
        .order("display_name")
        .limit(1);

      if (userId) {
        if (profile?.role === "admin") {
          // Admin can see all trees.
        } else if (profile?.role === "guest" && profile.guest_of) {
          query = query.or(`owner_id.eq.${profile.guest_of},owner_id.is.null`);
        } else {
          query = query.or(`owner_id.eq.${userId},owner_id.is.null`);
        }
      } else {
        query = query.is("owner_id", null);
      }

      const { data, error } = await query;
      if (error) {
        console.warn("Failed to fetch dynamic tree title:", error.message);
        return;
      }

      const displayName = data?.[0]?.display_name;
      if (!cancelled && displayName) {
        const nameParts = displayName.trim().split(/\s+/);
        setFamilyName(nameParts.slice(0, 2).join(" ") || "");
      }
    };

    loadFamilyName();

    return () => {
      cancelled = true;
    };
  }, [profile?.id, profile?.role, profile?.guest_of]);

  return familyName;
}
