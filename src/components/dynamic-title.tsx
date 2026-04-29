"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { supabase } from "@/lib/supabase";
import { useFamilyName } from "@/lib/use-family-name";

export function DynamicTitle() {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return null; // Don't render anything on server
  }

  return <DynamicTitleClient />;
}

function DynamicTitleClient() {
  const { profile } = useAuth();
  const familyName = useFamilyName();

  useEffect(() => {
    const baseTitle = "Gia phả dòng họ . . .";
    const title =
      familyName === "Quản trị"
        ? familyName
        : familyName
          ? `Gia phả họ ${familyName}`
          : baseTitle;
    document.title = title;
  }, [familyName]);

  return null;
}
