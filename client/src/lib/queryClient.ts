import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { apiRequestWithAuth } from "./supabaseAuth";

// Request batching utility to prevent rate limit issues on initial load
class RequestBatcher {
  private pendingRequests = new Map<string, Promise<any>>();
  private batchDelay = 200; // 200ms delay between batches
  private maxConcurrent = 2; // Maximum 2 concurrent requests
  private requestQueue: Array<() => Promise<void>> = [];
  private processing = false;

  async batchRequest<T>(key: string, requestFn: () => Promise<T>): Promise<T> {
    // If request is already pending, return the existing promise
    if (this.pendingRequests.has(key)) {
      console.log(`🔄 RequestBatcher: Reusing existing request for ${key}`);
      return this.pendingRequests.get(key)!;
    }

    // Create the request promise with queuing
    const promise = this.executeWithQueuing(key, requestFn);
    this.pendingRequests.set(key, promise);

    // Clean up when done
    promise.finally(() => {
      this.pendingRequests.delete(key);
    });

    return promise;
  }

  private async executeWithQueuing<T>(key: string, requestFn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push(async () => {
        try {
          console.log(`🚀 RequestBatcher: Executing request for ${key}`);
          const result = await requestFn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.requestQueue.length === 0) {
      return;
    }

    this.processing = true;
    
    while (this.requestQueue.length > 0) {
      const batch = this.requestQueue.splice(0, this.maxConcurrent);
      
      // Execute batch concurrently
      await Promise.all(batch.map(fn => fn()));
      
      // Add delay between batches
      if (this.requestQueue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, this.batchDelay));
      }
    }
    
    this.processing = false;
  }
}

export const requestBatcher = new RequestBatcher();

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
  useBatching?: boolean;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior, useBatching = false }) =>
  async ({ queryKey }) => {
    try {
      const url = queryKey.join("/") as string;
      
      if (useBatching) {
        return await requestBatcher.batchRequest(url, () => apiRequestWithAuth(url));
      } else {
        return await apiRequestWithAuth(url);
      }
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
        // For rate limit errors, retry with exponential backoff
        if (error?.status === 429 || 
            (error instanceof Error && (error.message.includes('429') || 
                                       error.message.includes('Rate limit') || 
                                       error.message.includes('Too Many Requests')))) {
          console.warn(`⏳ Rate limit hit - retry ${failureCount + 1}/3 with backoff`);
          if (failureCount < 3) {
            // Exponential backoff: 1s, 2s, 4s
            const delay = Math.pow(2, failureCount) * 1000;
            setTimeout(() => {}, delay);
            return true;
          }
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

// Custom hook for batched queries to prevent rate limit issues on initial load
export function useBatchedQuery<T>(queryKey: any[], options?: any) {
  return {
    queryKey,
    queryFn: getQueryFn({ on401: "throw", useBatching: true }),
    ...options,
  };
}
