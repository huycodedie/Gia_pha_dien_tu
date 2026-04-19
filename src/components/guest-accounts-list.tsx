"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Mail, User, Shield } from "lucide-react";
import { toast } from "sonner";

interface GuestAccount {
  id: string;
  email: string;
  display_name: string;
  role: string;
  person_handle?: string;
  person_name?: string;
}

export function GuestAccountsList() {
  const { session } = useAuth();
  const [guests, setGuests] = useState<GuestAccount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (session?.access_token) {
      fetchGuestAccounts();
    }
  }, [session]);

  const fetchGuestAccounts = async () => {
    try {
      // First get guest profiles
      const { data: guestProfiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, display_name, role")
        .eq("guest_of", session?.user?.id)
        .eq("role", "guest");

      if (profilesError) throw profilesError;

      if (!guestProfiles || guestProfiles.length === 0) {
        setGuests([]);
        return;
      }

      // For each guest profile, get the corresponding person
      const guestPromises = guestProfiles.map(async (profile) => {
        const { data: person, error: personError } = await supabase
          .from("people")
          .select("handle, display_name")
          .eq("auth_user_id", profile.id)
          .single();

        return {
          id: profile.id,
          email: profile.email,
          display_name: profile.display_name,
          role: profile.role,
          person_handle: person?.handle,
          person_name: person?.display_name,
        };
      });

      const formattedGuests = await Promise.all(guestPromises);
      setGuests(formattedGuests);
    } catch (error) {
      console.error("Error fetching guest accounts:", error);
      toast.error("Không thể tải danh sách tài khoản khách");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Tài khoản khách của bạn
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Tài khoản khách của bạn ({guests.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {guests.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">
            Chưa có tài khoản khách nào
          </p>
        ) : (
          <div className="space-y-3">
            {guests.map((guest) => (
              <div
                key={guest.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{guest.display_name}</p>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {guest.email}
                    </p>
                    {guest.person_name && (
                      <p className="text-sm text-muted-foreground">
                        Liên kết với: {guest.person_name}
                      </p>
                    )}
                  </div>
                </div>
                <Badge variant="secondary">{guest.role}</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
