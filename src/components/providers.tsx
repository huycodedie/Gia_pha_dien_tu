"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { AuthProvider } from "@/components/auth-provider";
import { Toaster } from "sonner";
import { DynamicTitle } from "@/components/dynamic-title";
import { errorLogger } from "@/lib/error-logger";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: 1,
          },
        },
      }),
  );

  // Initialize error logger
  useEffect(() => {
    errorLogger.init();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <NextThemesProvider
        attribute="class"
        defaultTheme="light"
        enableSystem
        disableTransitionOnChange
      >
        <AuthProvider>
          <DynamicTitle />
          {children}
          <Toaster position="top-right" />
        </AuthProvider>
      </NextThemesProvider>
    </QueryClientProvider>
  );
}
