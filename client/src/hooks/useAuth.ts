import { useQuery } from "@tanstack/react-query";
import { supabase, getCurrentUser, getAccessToken, apiRequestWithAuth } from "@/lib/supabaseAuth";

export function useAuth() {
  const { data: user, isLoading, error } = useQuery({
    queryKey: ["/api/auth/user"],
    queryFn: async () => {
      try {
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
    staleTime: 0,
    cacheTime: 0,
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    error,
  };
}