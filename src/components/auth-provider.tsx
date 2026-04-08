"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabase";
import type { User, Session } from "@supabase/supabase-js";

export type UserRole = "admin" | "user" | "viewer" | "guest" | null;

interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  role: UserRole;
  status: string;
  person_handle: string | null;
  avatar_url: string | null;
  guest_of: string | null;
}

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: UserRole;
  loading: boolean;
  isAdmin: boolean;
  isMember: boolean;
  isLoggedIn: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (
    email: string,
    password: string,
    displayName?: string,
  ) => Promise<{ error?: string }>;
  signUpGuest: (
    invitationCode: string,
    email: string,
    password: string,
    displayName: string,
  ) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      if (!error && data) {
        setProfile(data as Profile);
      } else {
        setProfile(null);
      }
    } catch {
      setProfile(null);
    }
  }, []);

  const ensureProfile = useCallback(
    async (u: User) => {
      // Create profile if it doesn't exist (handles signup)
      const { data: existing } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", u.id)
        .maybeSingle();

      if (!existing) {
        await supabase.from("profiles").insert({
          id: u.id,
          email: u.email || "",
          display_name:
            u.user_metadata?.display_name || u.email?.split("@")[0] || "",
          role: "member",
          status: "active",
        });
      }
      await fetchProfile(u.id);
    },
    [fetchProfile],
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) ensureProfile(s.user);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        ensureProfile(s.user);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [ensureProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      if (error.message.includes("Invalid login credentials")) {
        return { error: "Email hoặc mật khẩu không đúng" };
      }
      return { error: error.message };
    }
    // Fetch and check profile status
    if (data.user) {
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("status")
        .eq("id", data.user.id)
        .maybeSingle();
      if (profileError) {
        await supabase.auth.signOut();
        return { error: "Lỗi khi kiểm tra tài khoản. Vui lòng thử lại." };
      }
      if (!profileData || profileData.status !== "active") {
        await supabase.auth.signOut();
        return {
          error:
            "Tài khoản của bạn đã bị khóa hoặc email không tồn tại. Vui lòng liên hệ quản trị viên.",
        };
      }
    }
    return {};
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, displayName?: string) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName || email.split("@")[0] },
        },
      });
      if (error) {
        if (error.message.includes("already registered")) {
          return { error: "Email đã được đăng ký. Hãy đăng nhập." };
        }
        return { error: error.message };
      }
      // If email confirmation is required
      if (data.user && !data.session) {
        return { error: "Đã đăng ký! Kiểm tra email để xác nhận tài khoản." };
      }
      // If auto-logged in, sign out to prevent auto-login
      if (data.session) {
        await supabase.auth.signOut();
      }
      return {};
    },
    [],
  );

  const signUpGuest = useCallback(
    async (
      invitationCode: string,
      email: string,
      password: string,
      displayName: string,
    ) => {
      const response = await fetch("/api/register-guest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code: invitationCode,
          email,
          password,
          displayName,
        }),
      });

      const result = await response.json();
      if (result.error) {
        return { error: result.error };
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        return { error: signInError.message };
      }

      return {};
    },
    [],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id);
  }, [user, fetchProfile]);

  const role = profile?.role ?? null;

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        role,
        loading,
        isAdmin: role === "admin",
        isMember: role === "viewer" || role === "admin",
        isLoggedIn: !!user,
        signIn,
        signUp,
        signUpGuest,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
