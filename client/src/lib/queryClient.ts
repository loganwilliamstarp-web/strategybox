import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { apiRequestWithAuth } from "./supabaseAuth";

// Request batching utility to prevent rate limit issues on initial load
class RequestBatcher {
  private pendingRequests = new Map<string, Promise<any>>();
  private batchDelay = 500; // 500ms delay between batches
  private maxConcurrent = 1; // Maximum 1 concurrent request to avoid rate limits
  private requestQueue: Array<() => Promise<void>> = [];
  private processing = false;
  private isRateLimited = false;
  private rateLimitUntil: number = 0;

  async batchRequest<T>(key: string, requestFn: () => Promise<T>): Promise<T> {
    // If request is already pending, return the existing promise
    if (this.pendingRequests.has(key)) {
      console.log(`🔄 RequestBatcher: Reusing existing request for ${key}`);
      return this.pendingRequests.get(key)!;
    }

    // Check if we're currently rate limited
    if (this.isRateLimited && Date.now() < this.rateLimitUntil) {
      const waitTime = this.rateLimitUntil - Date.now();
      console.log(`⏳ RequestBatcher: Rate limited, waiting ${Math.ceil(waitTime / 1000)}s for ${key}`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.isRateLimited = false;
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
        } catch (error: any) {
          // Handle rate limit errors
          if (error?.status === 429 || (error instanceof Error && error.message.includes('429'))) {
            this.handleRateLimit(error);
          }
          reject(error);
        }
      });
      
      this.processQueue();
    });
  }

  private handleRateLimit(error: any): void {
    this.isRateLimited = true;
    
    // Try to extract retry-after from error message
    let retryAfter = 30; // Default 30 seconds
    if (error.message) {
      const match = error.message.match(/Try again in (\d+) seconds/);
      if (match) {
        retryAfter = parseInt(match[1]);
      }
    }
    
    this.rateLimitUntil = Date.now() + (retryAfter * 1000);
    console.warn(`🚨 RequestBatcher: Rate limited for ${retryAfter} seconds`);
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.requestQueue.length === 0) {
      return;
    }

    this.processing = true;
    
    while (this.requestQueue.length > 0) {
      // Check rate limit before processing
      if (this.isRateLimited && Date.now() < this.rateLimitUntil) {
        const waitTime = this.rateLimitUntil - Date.now();
        console.log(`⏳ RequestBatcher: Pausing queue for ${Math.ceil(waitTime / 1000)}s`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        this.isRateLimited = false;
      }

      const batch = this.requestQueue.splice(0, this.maxConcurrent);
      
      // Execute batch sequentially to avoid overwhelming the server
      for (const fn of batch) {
        await fn();
        // Add delay between individual requests
        await new Promise(resolve => setTimeout(resolve, this.batchDelay));
      }
    }
    
    this.processing = false;
  }
}

export const requestBatcher = new RequestBatcher();

// Global rate limit state to coordinate across all requests
let globalRateLimited = false;
let globalRateLimitUntil = 0;

export function handleGlobalRateLimit(error: any): void {
  if (error?.status === 429 || (error instanceof Error && error.message.includes('429'))) {
    globalRateLimited = true;
    
    // Try to extract retry-after from error message
    let retryAfter = 30; // Default 30 seconds
    if (error.message) {
      const match = error.message.match(/Try again in (\d+) seconds/);
      if (match) {
        retryAfter = parseInt(match[1]);
      }
    }
    
    globalRateLimitUntil = Date.now() + (retryAfter * 1000);
    console.warn(`🚨 Global rate limit: Waiting ${retryAfter} seconds`);
    
    // Dispatch event for UI notification
    window.dispatchEvent(new CustomEvent('rateLimitError', { 
      detail: { status: 429, retryAfter } 
    }));
  }
}

export function isGloballyRateLimited(): boolean {
  if (globalRateLimited && Date.now() < globalRateLimitUntil) {
    return true;
  }
  if (globalRateLimited && Date.now() >= globalRateLimitUntil) {
    globalRateLimited = false;
    console.log('✅ Global rate limit cleared');
  }
  return false;
}

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
      // Check global rate limit before making any request
      if (isGloballyRateLimited()) {
        throw new Error('429: Global rate limit active');
      }

      const url = queryKey.join("/") as string;
      
      if (useBatching) {
        return await requestBatcher.batchRequest(url, () => apiRequestWithAuth(url));
      } else {
        return await apiRequestWithAuth(url);
      }
    } catch (error: any) {
      // Handle rate limit errors globally
      handleGlobalRateLimit(error);
      
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
        // Don't retry rate limit errors - let the batcher handle them
        if (error?.status === 429 || 
            (error instanceof Error && (error.message.includes('429') || 
                                       error.message.includes('Rate limit') || 
                                       error.message.includes('Too Many Requests')))) {
          console.warn(`⏳ Rate limit hit - not retrying, batcher will handle`);
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
