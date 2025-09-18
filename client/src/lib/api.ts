// Clean API client for frontend rebuild
import { QueryClient } from '@tanstack/react-query';

// Simple fetch wrapper with proper error handling
export async function apiCall(url: string, options: RequestInit = {}): Promise<any> {
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return response.json();
  }
  
  return response.text();
}

// Clean React Query client with no caching issues
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0, // Always fetch fresh data
      cacheTime: 0, // No caching
      refetchOnWindowFocus: true,
      refetchOnMount: true,
      retry: 1,
    },
  },
});
