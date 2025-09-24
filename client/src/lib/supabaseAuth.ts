// Supabase authentication client for frontend
import { createClient } from '@supabase/supabase-js';

// Supabase configuration
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://nogazoggoluvgarfvizo.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vZ2F6b2dnb2x1dmdhcmZ2aXpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxMjYyMDAsImV4cCI6MjA3MzcwMjIwMH0.ar0rWErOFGv6bvIPlniKKbcQZ6-fVv6NvbGjHkd0HxE';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Auth state management
let currentUser: any = null;
let currentToken: string | null = null;

// Initialize session on app startup
(async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      currentUser = session.user;
      currentToken = session.access_token;
      console.log('🔄 Restored Supabase session on startup:', session.user.email);
    } else {
      console.log('🔄 No existing Supabase session found on startup');
    }
  } catch (error) {
    console.error('❌ Failed to restore Supabase session:', error);
  }
})();

// Listen for auth state changes
supabase.auth.onAuthStateChange((event, session) => {
  if (session) {
    currentUser = session.user;
    currentToken = session.access_token;
    console.log('✅ Supabase auth state changed: user logged in', session.user.email);
  } else {
    currentUser = null;
    currentToken = null;
    console.log('❌ Supabase auth state changed: user logged out');
  }
});

// Get current access token
export function getAccessToken(): string | null {
  return currentToken;
}

// Get current user
export function getCurrentUser() {
  return currentUser;
}

// Login with email and password
export async function loginWithEmail(email: string, password: string) {
  console.log('🔍 Attempting Supabase login for:', email);
  
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error('❌ Supabase login error:', error);
    throw new Error(error.message);
  }

  console.log('✅ Supabase login successful:', data.user?.email);
  console.log('🔑 Access token available:', !!data.session?.access_token);
  
  return data;
}

// Register with email and password
export async function registerWithEmail(email: string, password: string, metadata: any = {}) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: metadata
    }
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

// Logout
export async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw new Error(error.message);
  }
}

// Get current session
export async function getCurrentSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) {
    throw new Error(error.message);
  }
  return session;
}

// API request with Supabase token
export async function apiRequestWithAuth(url: string, options: RequestInit = {}): Promise<any> {
  const token = getAccessToken();
  
  console.log('🔍 API request to:', url);
  console.log('🔍 Request method:', options.method || 'GET');
  console.log('🔍 Full URL:', `${window.location.origin}${url}`);
  console.log('🔑 Token available:', !!token);
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    console.log('✅ Authorization header set');
  } else {
    console.log('❌ No token available for API request');
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  console.log('🔍 Response status:', response.status);
  console.log('🔍 Response headers:', Object.fromEntries(response.headers.entries()));

  if (!response.ok) {
    if (response.status === 401) {
      // Token might be expired, try to refresh
      const session = await getCurrentSession();
      if (session) {
        // Retry with new token
        headers['Authorization'] = `Bearer ${session.access_token}`;
        const retryResponse = await fetch(url, {
          ...options,
          headers,
        });
        
        if (retryResponse.ok) {
          return retryResponse.json();
        }
      }
    }
    
    const errorText = await response.text();
    throw new Error(`API Error: ${response.status} ${errorText}`);
  }

  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return response.json();
  }
  
  return response.text();
}
