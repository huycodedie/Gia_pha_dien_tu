import { useCallback } from "react";

interface ToastOptions {
  title?: string;
  description?: string;
  variant?: "default" | "destructive";
}

export function useToast() {
  const toast = useCallback(
    ({ title, description, variant = "default" }: ToastOptions) => {
      console.log(`[${variant.toUpperCase()}] ${title}: ${description}`);
    },
    [],
  );

  return { toast };
}
