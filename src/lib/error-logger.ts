// Error logging utility for client-side error reporting
// Sử dụng để ghi nhận lỗi từ phía client lên server

interface ErrorLogData {
  error_type:
    | "javascript"
    | "api"
    | "network"
    | "validation"
    | "auth"
    | "other";
  error_message: string;
  error_stack?: string;
  url?: string;
  user_agent?: string;
  request_data?: any;
  context_data?: any;
  severity?: "low" | "medium" | "high" | "critical";
}

class ErrorLogger {
  private static instance: ErrorLogger;
  private isInitialized = false;

  private constructor() {}

  static getInstance(): ErrorLogger {
    if (!ErrorLogger.instance) {
      ErrorLogger.instance = new ErrorLogger();
    }
    return ErrorLogger.instance;
  }

  // Initialize global error handlers
  init() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    // Global JavaScript error handler
    window.addEventListener("error", (event) => {
      this.logError({
        error_type: "javascript",
        error_message: event.message,
        error_stack: event.error?.stack,
        url: window.location.href,
        user_agent: navigator.userAgent,
        severity: "high",
      });
    });

    // Unhandled promise rejection handler
    window.addEventListener("unhandledrejection", (event) => {
      this.logError({
        error_type: "javascript",
        error_message: `Unhandled Promise Rejection: ${event.reason}`,
        url: window.location.href,
        user_agent: navigator.userAgent,
        severity: "high",
      });
    });

    // Network error handler (for fetch requests)
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      try {
        const response = await originalFetch(...args);
        if (!response.ok && response.status >= 500) {
          // Log server errors
          this.logError({
            error_type: "api",
            error_message: `HTTP ${response.status}: ${response.statusText}`,
            url: args[0] as string,
            request_data: { method: args[1]?.method || "GET" },
            severity: "medium",
          });
        }
        return response;
      } catch (error) {
        // Log network errors
        this.logError({
          error_type: "network",
          error_message: `Network Error: ${error instanceof Error ? error.message : String(error)}`,
          url: args[0] as string,
          severity: "high",
        });
        throw error;
      }
    };
  }

  // Log an error to the server
  async logError(errorData: ErrorLogData) {
    try {
      // Don't log errors in development unless explicitly requested
      if (
        process.env.NODE_ENV === "development" &&
        !errorData.context_data?.forceLog
      ) {
        console.warn("Error logged (dev mode):", errorData);
        return;
      }

      const response = await fetch("/api/errors/log", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...errorData,
          context_data: {
            ...errorData.context_data,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            url: window.location.href,
            viewport: {
              width: window.innerWidth,
              height: window.innerHeight,
            },
            userId: this.getCurrentUserId(),
          },
        }),
      });

      if (!response.ok) {
        console.error("Failed to log error to server:", response.statusText);
      }
    } catch (error) {
      // Don't recursively log errors from the error logger
      console.error("Error logging failed:", error);
    }
  }

  // Log API errors
  logApiError(error: any, context?: any) {
    this.logError({
      error_type: "api",
      error_message: error?.message || "API Error",
      error_stack: error?.stack,
      request_data: context,
      severity: "medium",
    });
  }

  // Log validation errors
  logValidationError(message: string, context?: any) {
    this.logError({
      error_type: "validation",
      error_message: message,
      context_data: context,
      severity: "low",
    });
  }

  // Log authentication errors
  logAuthError(message: string, context?: any) {
    this.logError({
      error_type: "auth",
      error_message: message,
      context_data: context,
      severity: "medium",
    });
  }

  // Get current user ID from local storage or context
  private getCurrentUserId(): string | null {
    try {
      // Try to get from localStorage (if using Supabase auth)
      const authData = localStorage.getItem("supabase.auth.token");
      if (authData) {
        const parsed = JSON.parse(authData);
        return parsed?.currentSession?.user?.id || null;
      }
    } catch (error) {
      // Ignore localStorage errors
    }
    return null;
  }
}

// Export singleton instance
export const errorLogger = ErrorLogger.getInstance();

// Export types
export type { ErrorLogData };
