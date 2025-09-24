import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequestWithAuth } from "@/lib/supabaseAuth";

interface RefreshResults {
  marketData: boolean;
  optionsChains: boolean;
  portfolioSummary: boolean;
  userTickers: boolean;
  timestamp: string;
  userId: string;
}

interface RefreshResponse {
  success: boolean;
  message: string;
  results: RefreshResults;
  refreshedComponents: number;
  timestamp: string;
}

export function useDataRefresh() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const refreshMutation = useMutation({
    mutationFn: async (): Promise<RefreshResponse> => {
      console.log('🔄 Making authenticated API request to /api/refresh-all-data');
      return await apiRequestWithAuth("/api/refresh-all-data", {
        method: "POST",
      });
    },
    onSuccess: (data) => {
      console.log("🔄 Data refresh completed:", data);
      
      // Invalidate all relevant queries to force fresh data
      queryClient.invalidateQueries({ queryKey: ["/api/tickers"], refetchType: "inactive" });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/summary"], refetchType: "inactive" });
      queryClient.invalidateQueries({ queryKey: ["/api/market-data/status"] });
      
      // Invalidate all options chain queries
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const queryKey = query.queryKey[0];
          return typeof queryKey === 'string' && queryKey.includes('/api/market-data/options-chain');
        }
      });

      toast({
        title: "Data Refreshed! 🎉",
        description: `Successfully refreshed ${data.refreshedComponents} data components`,
        duration: 3000,
      });
    },
    onError: (error: Error) => {
      console.error("❌ Data refresh failed:", error);
      toast({
        title: "Refresh Failed",
        description: error.message || "Failed to refresh data",
        variant: "destructive",
        duration: 5000,
      });
    },
  });

  const refreshAllData = () => {
    console.log("🔄 Triggering comprehensive data refresh...");
    refreshMutation.mutate();
  };

  return {
    refreshAllData,
    isRefreshing: refreshMutation.isPending,
    refreshError: refreshMutation.error,
    lastRefresh: refreshMutation.data?.timestamp,
  };
}
