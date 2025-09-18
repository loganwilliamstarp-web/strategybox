import { useQuery } from "@tanstack/react-query";

export function useAuth() {
  const { data: user, isLoading, error } = useQuery({
    queryKey: ["/api/auth/user"],
    queryFn: async () => {
      const res = await fetch("/api/auth/user", { credentials: "include", cache: "no-store" });
      if (res.ok) {
        const userData = await res.json();
        console.log('✅ Regular auth successful:', userData.email);
        return userData;
      }
      if (res.status === 401) {
        console.log('❌ Not authenticated (auth endpoint returned 401)');
        return null;
      }
      throw new Error(`Failed to fetch user (${res.status})`);
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