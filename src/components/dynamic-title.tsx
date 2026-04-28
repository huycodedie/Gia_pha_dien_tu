"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";

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

  const familyName = useMemo(() => {
    if (profile?.display_name) {
      // Extract family name from display name
      // For Vietnamese names, take first 2 words as surname
      const nameParts = profile.display_name.trim().split(" ");
      return nameParts.length >= 2
        ? nameParts.slice(0, 2).join(" ")
        : profile.display_name;
    }
    return "";
  }, [profile]);

  useEffect(() => {
    const baseTitle = "Gia phả dòng họ . . .";
    const title = familyName ? `Gia phả họ ${familyName}` : baseTitle;
    document.title = title;
  }, [familyName]);

  return null; // This component doesn't render anything
}
