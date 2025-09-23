import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

interface OptionsChainData {
  symbol: string;
  underlyingPrice: number;
  expirationDates: string[];
  options: any[];
  chains: { [expiration: string]: { calls: any[]; puts: any[] } };
}

export function useOptionsChain(symbol: string, isEnabled: boolean = true) {
  const queryClient = useQueryClient();
  
  const { data: optionsChain, isLoading, error, refetch } = useQuery<OptionsChainData>({
    queryKey: [`/api/market-data/options-chain/${symbol}`],
    enabled: isEnabled && !!symbol,
    refetchInterval: 15 * 60 * 1000, // Refresh every 15 minutes to match premium updates
    staleTime: 5 * 60 * 1000, // Consider stale after 5 minutes
    onSuccess: (data) => {
      console.log(`✅ Options chain loaded for ${symbol}:`, data?.options?.length, 'options');
    },
    onError: (error) => {
      console.error(`❌ Options chain error for ${symbol}:`, error);
    },
  });

  // Function to invalidate cache when expiration filter changes
  const invalidateCache = () => {
    console.log(`🔄 Invalidating options chain cache for ${symbol}`);
    queryClient.invalidateQueries({ 
      queryKey: [`/api/market-data/options-chain/${symbol}`] 
    });
  };

  // Function to force refresh with new data
  const forceRefresh = async () => {
    console.log(`🔄 Force refreshing options chain for ${symbol}`);
    await refetch();
  };

  // Helper to get options for specific expiration
  const getOptionsForExpiration = (expirationDate: string) => {
    if (!optionsChain?.options) return [];
    return optionsChain.options.filter((opt: any) => opt.expiration_date === expirationDate);
  };

  // Helper to get available expiration dates
  const getAvailableExpirations = () => {
    if (!optionsChain?.options) return [];
    return Array.from(new Set(optionsChain.options.map((opt: any) => opt.expiration_date))).sort();
  };

  return {
    optionsChain,
    isLoading,
    error,
    refetch,
    invalidateCache,
    forceRefresh,
    getOptionsForExpiration,
    getAvailableExpirations,
  };
}
