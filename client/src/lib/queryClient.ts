import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { apiRequestWithAuth } from "./supabaseAuth";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  url: string,
  options?: { 
    method?: string; 
    data?: unknown; 
  }
): Promise<any> {
  const { method = "GET", data } = options || {};
  
  // Use Supabase auth for API requests
  return await apiRequestWithAuth(url, {
    method,
    body: data ? JSON.stringify(data) : undefined,
  });
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    try {
      return await apiRequestWithAuth(queryKey.join("/") as string);
    } catch (error: any) {
      if (unauthorizedBehavior === "returnNull" && error.message.includes("401")) {
        return null;
      }
      throw error;
    }
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: true, // Enable refetch on focus for fresh data
      staleTime: 30 * 1000, // Consider data stale after 30 seconds
      cacheTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
      retry: (failureCount, error: any) => {
        // Don't retry on 401/403 errors
        if (error?.status === 401 || error?.status === 403) {
          return false;
        }
        // Retry up to 2 times for other errors
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
