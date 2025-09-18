// Clean authentication hook for frontend rebuild
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiCall } from '../lib/api';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export function useAuth() {
  const queryClient = useQueryClient();

  // Get current user - try simple auth first
  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ['auth', 'user'],
    queryFn: async () => {
      try {
        // Try simple auth first
        return await apiCall('/api/simple-auth/user');
      } catch (simpleError) {
        try {
          // Fallback to regular auth
          return await apiCall('/api/auth/user');
        } catch (error) {
          return null; // Not authenticated
        }
      }
    },
    staleTime: 0,
    cacheTime: 0,
  });

  // Login mutation - try simple auth first, then regular auth
  const loginMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      // Try simple auth first (has demo user ready)
      try {
        const result = await apiCall('/api/simple-login', { method: 'POST' });
        return result;
      } catch (simpleError) {
        // Fallback to regular login
        return apiCall('/api/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['auth']);
    },
  });

  // Logout mutation
  const logoutMutation = useMutation({
    mutationFn: async () => {
      return apiCall('/api/logout', { method: 'POST' });
    },
    onSuccess: () => {
      queryClient.setQueryData(['auth', 'user'], null);
      queryClient.clear();
    },
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login: loginMutation.mutate,
    logout: logoutMutation.mutate,
    isLoginLoading: loginMutation.isLoading,
  };
}
