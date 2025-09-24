import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

interface OptionsChainData {
  symbol: string;
  underlyingPrice: number;
  expirationDates: string[];
  options: any[];
  chains: { [expiration: string]: { calls: any[]; puts: any[] } };
}

export function useOptionsChain(symbol: string, isEnabled: boolean = true, expirationDate?: string) {
  const queryClient = useQueryClient();
  
  // Use database-based API endpoint (single source of truth) with proper caching
  const baseUrl = `/api/options-chain/${symbol}`;
  const queryKey = expirationDate 
    ? [`${baseUrl}?expiration=${expirationDate}`]
    : [baseUrl];
  
  console.log(`🔗 useOptionsChain query key (DB):`, queryKey, `for symbol: ${symbol}, expiration: ${expirationDate}`);
  
  const { data: optionsChain, isLoading, error, refetch } = useQuery<OptionsChainData>({
    queryKey,
    enabled: isEnabled && !!symbol,
    refetchInterval: 0, // NO automatic refetching - force manual control
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    retry: 1, // Only retry once on failure
    retryDelay: 1000, // Wait 1 second before retry
    onSuccess: (data) => {
      console.log(`✅ Options chain loaded for ${symbol}${expirationDate ? ` (expiration: ${expirationDate})` : ''}:`, data?.options?.length, 'options');
    },
    onError: (error) => {
      console.error(`❌ Options chain error for ${symbol}${expirationDate ? ` (expiration: ${expirationDate})` : ''}:`, error);
    },
  });

  // Function to invalidate cache when expiration filter changes
  const invalidateCache = () => {
    console.log(`🔄 Invalidating options chain cache for ${symbol}${expirationDate ? ` with expiration ${expirationDate}` : ''}`);
    queryClient.invalidateQueries({ 
      queryKey: queryKey
    });
  };

  // Function to force refresh with new data
  const forceRefresh = async () => {
    console.log(`🔄 Force refreshing options chain for ${symbol}${expirationDate ? ` (expiration: ${expirationDate})` : ''}`);
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
