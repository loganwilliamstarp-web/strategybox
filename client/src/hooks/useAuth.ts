import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, getCurrentUser, getAccessToken, apiRequestWithAuth, waitForSessionInitialization } from "@/lib/supabaseAuth";
import { useState, useEffect } from "react";

export function useAuth() {
  const [initialAuthCheck, setInitialAuthCheck] = useState(false);
  const queryClient = useQueryClient();
  
  // Check for existing session on mount
  useEffect(() => {
    const checkInitialAuth = async () => {
      // Wait for session initialization to complete first
      await waitForSessionInitialization();
      
      const currentUser = getCurrentUser();
      const token = getAccessToken();
      console.log('🔍 Initial auth check:', { 
        hasUser: !!currentUser, 
        hasToken: !!token,
        userEmail: currentUser?.email 
      });
      
      // If we have a user but no cached data, try to get fresh session
      if (currentUser && token) {
        console.log('🔄 Found existing session, pre-populating auth cache');
        // Pre-populate the query cache with user data to prevent loading state
        try {
          queryClient.setQueryData(["/api/auth/user"], {
            id: currentUser.id,
            email: currentUser.email,
            firstName: currentUser.user_metadata?.firstName || '',
            lastName: currentUser.user_metadata?.lastName || ''
          });
        } catch (error) {
          console.log('⚠️ Could not pre-populate auth cache:', error);
        }
      }
      
      setInitialAuthCheck(true);
    };
    
    checkInitialAuth();
  }, []);

  const { data: user, isLoading, error } = useQuery({
    queryKey: ["/api/auth/user"],
    queryFn: async () => {
      try {
        // Wait for session initialization to complete first
        await waitForSessionInitialization();
        
        // First check if we have a current Supabase session
        const currentUser = getCurrentUser();
        const token = getAccessToken();
        
        if (!currentUser || !token) {
          console.log('❌ No Supabase session found');
          return null;
        }

        // Verify with backend
        const userData = await apiRequestWithAuth("/api/auth/user");
        console.log('✅ Supabase auth successful:', userData.email);
        return userData;
      } catch (error) {
        console.log('❌ Supabase auth failed:', error);
        return null;
      }
    },
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity, // Never consider stale - persist until logout
    gcTime: Infinity, // Keep in cache indefinitely
    enabled: initialAuthCheck, // Only run query after initial auth check is complete
  });

  return {
    user,
    isLoading: isLoading || !initialAuthCheck,
    isAuthenticated: !!user,
    error,
  };
}