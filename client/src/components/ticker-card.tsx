import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PLChart } from "@/components/pl-chart";
import { ProbabilityChart } from "@/components/probability-chart";
import { StrikeSelector } from "@/components/strike-selector";
import { X, BarChart3, CalendarDays, TrendingUp, Target, Settings, Activity } from "lucide-react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useCapacitor } from "@/hooks/useCapacitor";
import { apiRequest } from "@/lib/queryClient";
import { apiRequestWithAuth } from "@/lib/supabaseAuth";
import { useState, useEffect, useRef, useMemo, memo } from "react";
import { ImpactStyle } from "@capacitor/haptics";
import type { TickerWithPosition } from "@shared/schema";

const getStrategyDisplayName = (strategyType: string | undefined) => {
  switch (strategyType) {
    case 'long_strangle': return 'Long Strangle';
    case 'short_strangle': return 'Short Strangle';
    case 'iron_condor': return 'Iron Condor';
    case 'diagonal_calendar': return 'Diagonal Calendar';
    case 'butterfly_spread': return 'Butterfly Spread';
    default: return 'Long Strangle';
  }
};

const getStrategyIcon = (strategyType: string | undefined) => {
  switch (strategyType) {
    case 'long_strangle': return '📈';
    case 'short_strangle': return '📉';
    case 'iron_condor': return '🦅';
    case 'diagonal_calendar': return '📅';
    case 'butterfly_spread': return '🦋';
    default: return '📈';
  }
};

interface TickerCardProps {
  ticker: TickerWithPosition;
  onViewOptions?: (symbol: string) => void;
  onViewVolatilitySurface?: (symbol: string) => void;
  selectedExpiration?: string; // Dashboard's selected expiration
}

const TickerCard = memo(function TickerCard({ ticker, onViewOptions, onViewVolatilitySurface, selectedExpiration }: TickerCardProps) {
  const { position } = ticker;
  const isPositiveChange = ticker.priceChange >= 0;
  const { isNative, triggerHaptics } = useCapacitor();
  
  // Debug component re-renders (disabled to prevent excessive logging)
  // console.log(`🔄 TickerCard re-render for ${ticker.symbol} at ${new Date().toISOString()}`);

  
  // Fetch individual IV values for the specific strikes
  const [individualIV, setIndividualIV] = useState<{ callIV: number; putIV: number } | null>(null);
  
  // Real-time Greeks data
  const [liveGreeks, setLiveGreeks] = useState<{
    call: { delta: number; theta: number; gamma: number; vega: number; iv: number };
    put: { delta: number; theta: number; gamma: number; vega: number; iv: number };
  } | null>(null);
  
  // Current P&L calculations
  const currentPL = useMemo(() => {
    if (!position || !ticker.currentPrice) return null;
    
    // Calculate current position value based on live premiums
    const currentCallPremium = liveGreeks?.call ? 
      (position.longCallPremium + (ticker.currentPrice - position.atmValue) * (liveGreeks.call.delta || 0)) : 
      position.longCallPremium;
    const currentPutPremium = liveGreeks?.put ? 
      (position.longPutPremium - (ticker.currentPrice - position.atmValue) * (liveGreeks.put.delta || 0)) : 
      position.longPutPremium;
    
    // Entry cost (premium paid)
    const entryCost = (position.longCallPremium + position.longPutPremium) * 100;
    
    // Current value (what we could sell for)
    const currentValue = (currentCallPremium + currentPutPremium) * 100;
    
    // P&L
    const unrealizedPL = currentValue - entryCost;
    const percentReturn = (unrealizedPL / entryCost) * 100;
    
    return {
      unrealizedPL,
      percentReturn,
      entryCost,
      currentValue,
      isProfit: unrealizedPL > 0,
      isAtBreakeven: Math.abs(unrealizedPL) < 5 // Within $5 of breakeven
    };
  }, [position, ticker.currentPrice, liveGreeks]);
  
  // Fetch individual IV values and live Greeks when component mounts or ticker changes
  // CRITICAL FIX: Only fetch once per ticker/position, not on every render
  useEffect(() => {
    let isMounted = true;
    
    const fetchLiveData = async () => {
      try {
        console.log(`🔍 Fetching live Greeks for ${ticker.symbol} - expiration: ${position.expirationDate}`);
        const chainData = await apiRequestWithAuth(`/api/options-chain/${ticker.symbol}?expiration=${position.expirationDate}`);
        
        if (!isMounted) return; // Prevent state updates if component unmounted
        
        if (chainData) {
          const expiration = position.expirationDate;
          
          if (chainData.chains && chainData.chains[expiration]) {
            const { calls, puts } = chainData.chains[expiration];
            
            // Find the specific call and put strikes from our position
            const callStrike = position.strategyType === 'short_strangle' ? 
              (position.shortCallStrike || position.longCallStrike) : position.longCallStrike;
            const putStrike = position.strategyType === 'short_strangle' ? 
              (position.shortPutStrike || position.longPutStrike) : position.longPutStrike;
            
            const selectedCall = calls.find((c: any) => c.strike === callStrike);
            const selectedPut = puts.find((p: any) => p.strike === putStrike);
            
            if (selectedCall && selectedPut) {
              // Update IV data
              setIndividualIV({
                callIV: (selectedCall.impliedVolatility || 0) * 100, // Convert to percentage
                putIV: (selectedPut.impliedVolatility || 0) * 100    // Convert to percentage
              });
              
              // Update live Greeks data
              setLiveGreeks({
                call: {
                  delta: selectedCall.delta || 0,
                  theta: selectedCall.theta || 0,
                  gamma: selectedCall.gamma || 0,
                  vega: selectedCall.vega || 0,
                  iv: (selectedCall.impliedVolatility || 0) * 100
                },
                put: {
                  delta: selectedPut.delta || 0,
                  theta: selectedPut.theta || 0,
                  gamma: selectedPut.gamma || 0,
                  vega: selectedPut.vega || 0,
                  iv: (selectedPut.impliedVolatility || 0) * 100
                }
              });
            }
          }
        }
      } catch (error) {
        console.warn('Could not fetch live Greeks and IV values:', error);
      }
    };
    
    // Only fetch if we don't already have data
    if (!liveGreeks && !individualIV) {
      fetchLiveData();
    }
    
    return () => {
      isMounted = false;
    };
  }, [ticker.symbol, position.expirationDate]); // REMOVED position.longCallStrike, position.longPutStrike to prevent excessive calls
  
  // Debug strategy type issues (disabled to prevent excessive logging)
  // console.log(`🎯 TickerCard Debug for ${ticker.symbol}:`, {
  //   strategyType: position?.strategyType,
  //   longPutStrike: position?.longPutStrike,
  //   longCallStrike: position?.longCallStrike,
  //   shortPutStrike: position?.shortPutStrike,
  //   shortCallStrike: position?.shortCallStrike
  // });
  
  // Debug price data (disabled to prevent excessive logging)
  // console.log(`💰 Price Debug for ${ticker.symbol}:`, {
  //   currentPrice: ticker.currentPrice,
  //   priceChange: ticker.priceChange,
  //   priceChangePercent: ticker.priceChangePercent,
  //   lastUpdated: ticker.updatedAt,
  //   tickerId: ticker.id,
  //   timestamp: new Date().toISOString()
  // });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [showStrikeSelector, setShowStrikeSelector] = useState(false);
  const [activeTab, setActiveTab] = useState<'pl' | 'probability'>('pl');
  const [priceFlash, setPriceFlash] = useState(false);
  const prevPriceRef = useRef(ticker.currentPrice);
  
  
  // Flash animation when price changes
  useEffect(() => {
    if (prevPriceRef.current !== ticker.currentPrice) {
      setPriceFlash(true);
      const timer = setTimeout(() => setPriceFlash(false), 800);
      prevPriceRef.current = ticker.currentPrice;
      return () => clearTimeout(timer);
    }
  }, [ticker.currentPrice]);



  const removeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(`/api/tickers/${ticker.symbol}`, { method: "DELETE" });
      return response;
    },
    onSuccess: () => {
      // Only invalidate - let React Query handle timing to prevent request spam
      queryClient.invalidateQueries({ queryKey: ["/api/tickers"], refetchType: "inactive" });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/summary"], refetchType: "inactive" });
      toast({
        title: "Ticker removed",
        description: `${ticker.symbol} has been removed from your portfolio.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to remove ticker",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateStrikesMutation = useMutation({
    mutationFn: async (data: { 
      putStrike: number; 
      callStrike: number; 
      putPremium?: number; 
      callPremium?: number; 
    }) => {
      // Use the new custom strikes API endpoint
      const response = await apiRequest(`/api/positions/${position?.id}/custom-strikes`, {
        method: "POST",
        data: {
          customPutStrike: data.putStrike,
          customCallStrike: data.callStrike,
          expirationDate: position?.expirationDate, // Use current expiration for the cycle
        },
      });
      return response;
    },
    onMutate: async (newData) => {
      // Cancel outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({ queryKey: ["/api/tickers"] });

      // Snapshot the previous value
      const previousTickers = queryClient.getQueryData(["/api/tickers"]);

      // Optimistically update to the new value
      queryClient.setQueryData(["/api/tickers"], (old: any) => {
        if (!old) return old;
        return old.map((t: any) => 
          t.symbol === ticker.symbol 
            ? {
                ...t,
                position: {
                  ...t.position,
                  longPutStrike: newData.putStrike,
                  longCallStrike: newData.callStrike,
                  longPutPremium: newData.putPremium || t.position.longPutPremium,
                  longCallPremium: newData.callPremium || t.position.longCallPremium,
                }
              }
            : t
        );
      });

      // Return a context object with the snapshotted value
      return { previousTickers };
    },
    onError: (err, newData, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousTickers) {
        queryClient.setQueryData(["/api/tickers"], context.previousTickers);
      }
      toast({
        title: "Failed to update position",
        description: err.message,
        variant: "destructive",
      });
    },
    onSuccess: () => {
      setShowStrikeSelector(false);
      toast({
        title: "Position updated",
        description: `Strike prices and premiums updated for ${ticker.symbol}.`,
      });
    },
    onSettled: () => {
      // Always refetch after error or success to ensure server state
      console.log('🔄 Strike update completed - refreshing database data');
      // Only invalidate specific queries, don't remove all options chain data
      queryClient.invalidateQueries({ queryKey: ["/api/tickers"], refetchType: "inactive" });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/summary"], refetchType: "inactive" });
    },
  });

  const handleStrikeSelectionChange = (
    putStrike: number, 
    callStrike: number, 
    putPremium: number, 
    callPremium: number
  ) => {
    updateStrikesMutation.mutate({
      putStrike,
      callStrike,
      putPremium,
      callPremium,
    });
  };

  // Force refresh ticker data when strike selector opens to ensure current premiums
  useEffect(() => {
    if (showStrikeSelector) {
      console.log(`🔄 Strike selector opened for ${ticker.symbol} - forcing ticker data refresh`);
      // Remove queryClient from dependencies to prevent infinite loops
      queryClient.invalidateQueries({ queryKey: ["/api/tickers"], refetchType: "inactive" });
    }
  }, [showStrikeSelector, ticker.symbol]); // Removed queryClient from deps

  // Check for premium discrepancies by fetching fresh options data
  // PERFORMANCE FIX: Disable per-card polling, use global WebSocket updates instead
  const { data: freshOptionsData } = useQuery({
    queryKey: ["/api/options-chain", ticker.symbol],
    enabled: !!ticker.symbol && !!position && showStrikeSelector, // Only fetch when needed
    refetchInterval: false, // Disable automatic polling for performance
    staleTime: 5 * 60 * 1000, // Consider stale after 5 minutes
  });

  // Detect premium discrepancies and log them
  useEffect(() => {
    if (freshOptionsData && position && freshOptionsData.chains) {
      const expirationDate = position.expirationDate;
      const chainData = freshOptionsData.chains[expirationDate];
      
      if (chainData) {
        const currentCallOption = chainData.calls.find(opt => opt.strike === position.longCallStrike);
        const currentPutOption = chainData.puts.find(opt => opt.strike === position.longPutStrike);
        
        if (currentCallOption && currentPutOption) {
          const freshCallPremium = (currentCallOption.bid + currentCallOption.ask) / 2;
          const freshPutPremium = (currentPutOption.bid + currentPutOption.ask) / 2;
          
          const callDiscrepancy = Math.abs(freshCallPremium - position.longCallPremium);
          const putDiscrepancy = Math.abs(freshPutPremium - position.longPutPremium);
          
          if (callDiscrepancy > 0.01 || putDiscrepancy > 0.01) {
            console.warn(`⚠️ Premium discrepancy detected for ${ticker.symbol}:`, {
              call: {
                stored: position.longCallPremium,
                fresh: freshCallPremium,
                difference: callDiscrepancy
              },
              put: {
                stored: position.longPutPremium,
                fresh: freshPutPremium,
                difference: putDiscrepancy
              }
            });
          }
        }
      }
    }
  }, [freshOptionsData, position, ticker.symbol]);

  return (
    <Card className="p-4 sm:p-6 transition-all duration-200 hover:shadow-lg" data-testid={`card-ticker-${ticker.symbol}`}>
      {/* Header Section */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <h1 className="text-xl font-bold text-foreground" data-testid={`text-symbol-${ticker.symbol}`}>
            {ticker.symbol}
          </h1>
        </div>
        <div className="flex items-center space-x-4">
          <div className="text-right">
            <div 
              className={`text-xl font-bold text-foreground transition-all duration-300 ${
                priceFlash 
                  ? (isPositiveChange ? 'bg-green-200 text-green-800 px-2 py-1 rounded' : 'bg-red-200 text-red-800 px-2 py-1 rounded')
                  : ''
              }`}
              data-testid={`text-price-${ticker.symbol}`}
            >
              ${ticker.currentPrice.toFixed(2)}
            </div>
            <div 
              className={`text-sm font-medium flex items-center ${
                isPositiveChange ? "text-green-600" : "text-red-600"
              }`}
              data-testid={`text-change-${ticker.symbol}`}
            >
              <TrendingUp className="h-3 w-3 mr-1" />
              {isPositiveChange ? "+" : ""}${ticker.priceChange.toFixed(2)} ({isPositiveChange ? "+" : ""}{ticker.priceChangePercent.toFixed(2)}%)
            </div>
          </div>
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 text-xs rounded font-medium flex items-center space-x-1"
            onClick={async () => {
              if (isNative) await triggerHaptics(ImpactStyle.Light);
              onViewOptions?.(ticker.symbol);
            }}
            data-testid={`button-chain-${ticker.symbol}`}
          >
            <BarChart3 className="h-3 w-3" />
            <span>Chain</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="px-2 py-1 text-xs rounded font-medium flex items-center space-x-1"
            onClick={() => onViewVolatilitySurface?.(ticker.symbol)}
            data-testid={`button-vol-surface-${ticker.symbol}`}
          >
            <Activity className="h-3 w-3" />
            <span>Vol</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              if (isNative) await triggerHaptics(ImpactStyle.Medium);
              removeMutation.mutate();
            }}
            disabled={removeMutation.isPending}
            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            data-testid={`button-remove-${ticker.symbol}`}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Expiration info moved below header */}
      <div className="flex justify-between items-center mb-4">
        <div className="text-xs text-muted-foreground flex items-center">
          <CalendarDays className="h-3 w-3 mr-1" />
          {position.daysToExpiry}d to expiration
        </div>
        <div className="text-xs text-muted-foreground">
          {new Date(position.expirationDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: '2-digit', weekday: 'short' })}
        </div>
      </div>

      {/* Expected Weekly Range */}
      <div className="mb-4">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
          EXPECTED WEEKLY RANGE
        </h4>
        {position.expectedMove?.weeklyLow && position.expectedMove?.weeklyHigh ? (
          <>
            <div className="flex justify-between items-center mb-2 bg-purple-50 border border-purple-200 rounded-lg p-3">
              <div className="text-left">
                <div className="text-lg font-bold text-purple-600" data-testid={`text-weekly-low-${ticker.symbol}`}>
                  ${parseFloat(position.expectedMove.weeklyLow.toString()).toFixed(2)}
                </div>
                <div className="text-xs text-muted-foreground">Weekly Low</div>
              </div>
              <div className="flex-1 mx-3 h-1 bg-purple-400 rounded-full"></div>
              <div className="text-right">
                <div className="text-lg font-bold text-purple-600" data-testid={`text-weekly-high-${ticker.symbol}`}>
                  ${parseFloat(position.expectedMove.weeklyHigh.toString()).toFixed(2)}
                </div>
                <div className="text-xs text-muted-foreground">Weekly High</div>
              </div>
            </div>
            
            {/* Expected Move Metrics */}
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div className="bg-white border border-purple-100 rounded-lg p-2 text-center">
                <div className="text-sm font-bold text-purple-700" data-testid={`text-expected-move-percent-${ticker.symbol}`}>
                  {(() => {
                    const weeklyLow = parseFloat(position.expectedMove.weeklyLow.toString());
                    const weeklyHigh = parseFloat(position.expectedMove.weeklyHigh.toString());
                    const currentPrice = ticker.currentPrice;
                    const moveRange = Math.max(currentPrice - weeklyLow, weeklyHigh - currentPrice);
                    const movePercent = (moveRange / currentPrice) * 100;
                    return `±${movePercent.toFixed(1)}%`;
                  })()}
                </div>
                <div className="text-xs text-muted-foreground">Expected Move</div>
              </div>
              <div className="bg-white border border-purple-100 rounded-lg p-2 text-center">
                <div className="text-sm font-bold text-purple-700" data-testid={`text-expected-move-dollars-${ticker.symbol}`}>
                  {(() => {
                    const weeklyLow = parseFloat(position.expectedMove.weeklyLow.toString());
                    const weeklyHigh = parseFloat(position.expectedMove.weeklyHigh.toString());
                    const currentPrice = ticker.currentPrice;
                    const moveRange = Math.max(currentPrice - weeklyLow, weeklyHigh - currentPrice);
                    return `±$${moveRange.toFixed(2)}`;
                  })()}
                </div>
                <div className="text-xs text-muted-foreground">Dollar Move</div>
              </div>
            </div>
          </>
        ) : (
          // Loading skeleton
          <div className="animate-pulse">
            <div className="flex justify-between items-center mb-2 bg-gray-100 border border-gray-200 rounded-lg p-3">
              <div className="text-left">
                <div className="h-6 bg-gray-300 rounded w-16 mb-1"></div>
                <div className="h-3 bg-gray-200 rounded w-12"></div>
              </div>
              <div className="flex-1 mx-3 h-1 bg-gray-300 rounded-full"></div>
              <div className="text-right">
                <div className="h-6 bg-gray-300 rounded w-16 mb-1"></div>
                <div className="h-3 bg-gray-200 rounded w-12"></div>
              </div>
            </div>
            
            {/* Loading skeleton for metrics */}
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div className="bg-gray-50 border border-gray-100 rounded-lg p-2 text-center">
                <div className="h-5 bg-gray-300 rounded w-12 mx-auto mb-1"></div>
                <div className="h-3 bg-gray-200 rounded w-16 mx-auto"></div>
              </div>
              <div className="bg-gray-50 border border-gray-100 rounded-lg p-2 text-center">
                <div className="h-5 bg-gray-300 rounded w-12 mx-auto mb-1"></div>
                <div className="h-3 bg-gray-200 rounded w-16 mx-auto"></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Current P&L Section */}
      {currentPL && (
        <div className="mb-4">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
            CURRENT POSITION VALUE
          </h4>
          <div className={`border rounded-lg p-3 ${
            currentPL.isProfit 
              ? 'bg-green-50 border-green-200' 
              : currentPL.isAtBreakeven 
                ? 'bg-yellow-50 border-yellow-200'
                : 'bg-red-50 border-red-200'
          }`}>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className={`text-2xl font-bold ${
                  currentPL.isProfit ? 'text-green-600' : 
                  currentPL.isAtBreakeven ? 'text-yellow-600' : 'text-red-600'
                }`} data-testid={`text-current-pl-${ticker.symbol}`}>
                  {currentPL.unrealizedPL >= 0 ? '+' : ''}${currentPL.unrealizedPL.toFixed(2)}
                </div>
                <div className="text-xs text-muted-foreground">Unrealized P&L</div>
              </div>
              <div className="text-center">
                <div className={`text-lg font-bold ${
                  currentPL.isProfit ? 'text-green-600' : 
                  currentPL.isAtBreakeven ? 'text-yellow-600' : 'text-red-600'
                }`} data-testid={`text-current-return-${ticker.symbol}`}>
                  {currentPL.percentReturn >= 0 ? '+' : ''}{currentPL.percentReturn.toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground">Return</div>
              </div>
            </div>
            <div className="mt-2 pt-2 border-t border-gray-200">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Entry Cost: ${currentPL.entryCost.toFixed(2)}</span>
                <span>Current Value: ${currentPL.currentValue.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Conditional Chart Position - Move up for Short Strangle only */}
      {position.strategyType === 'short_strangle' && (
        <div className="mb-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              {activeTab === 'pl' ? 'PROFIT/LOSS AT EXPIRATION' : 'PROBABILITY DISTRIBUTION AT EXPIRATION'}
            </h3>
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  activeTab === 'pl' 
                    ? 'bg-white text-gray-900 shadow-sm' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                onClick={() => setActiveTab('pl')}
                data-testid={`button-pl-tab-${ticker.symbol}`}
              >
                P&L
              </button>
              <button
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  activeTab === 'probability' 
                    ? 'bg-white text-gray-900 shadow-sm' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                onClick={() => setActiveTab('probability')}
                data-testid={`button-probability-tab-${ticker.symbol}`}
              >
                Probability
              </button>
            </div>
          </div>
          <div className="h-48 overflow-hidden bg-gray-50 rounded-lg border border-gray-200 flex items-center justify-center">
            {activeTab === 'pl' ? (
              <PLChart ticker={ticker} />
            ) : (
              <ProbabilityChart ticker={ticker} />
            )}
          </div>
        </div>
      )}

      {/* 4-Box Metrics Grid */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="bg-orange-50 border border-orange-200 p-3 rounded-lg text-center relative group cursor-help">
          <div className="text-xs text-orange-700 font-medium uppercase tracking-wide">MAX LOSS</div>
          <div className="text-lg font-bold text-orange-800" data-testid={`text-max-loss-${ticker.symbol}`}>
            {position.maxLoss === Number.MAX_SAFE_INTEGER ? 'Unlimited' : `$${position.maxLoss.toLocaleString()}`}
          </div>
          
          {/* Max Loss Tooltip */}
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50 w-64">
            <div className="font-semibold mb-1">Maximum Loss: {position.maxLoss === Number.MAX_SAFE_INTEGER ? 'Unlimited' : `$${position.maxLoss.toLocaleString()}`}</div>
            <div className="mb-2">
              {position.maxLoss === Number.MAX_SAFE_INTEGER ? 
                'This strategy has unlimited loss potential if the stock moves significantly against your position.' :
                `The most you can lose if ${ticker.symbol} stays between your strikes at expiration.`
              }
            </div>
            <div className="text-xs text-gray-300">
              {position.maxLoss !== Number.MAX_SAFE_INTEGER && 
                `This equals the total premium paid: $${((position.longCallPremium + position.longPutPremium) * 100).toFixed(0)} per contract.`
              }
            </div>
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
          </div>
        </div>
        <div className="bg-gray-50 border border-gray-200 p-3 rounded-lg text-center relative group cursor-help">
          <div className="text-xs text-gray-600 font-medium uppercase tracking-wide">ATM VALUE</div>
          <div className="text-lg font-bold text-gray-800" data-testid={`text-atm-value-${ticker.symbol}`}>
            ${position.atmValue.toFixed(2)}
          </div>
          
          {/* ATM Value Tooltip */}
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50 w-64">
            <div className="font-semibold mb-1">At-The-Money Value: ${position.atmValue.toFixed(2)}</div>
            <div className="mb-2">
              The baseline stock price for this options cycle. Gets reset every Friday when positions expire to track movement from the new starting point.
            </div>
            <div className="text-xs text-gray-300">
              Current price: ${ticker.currentPrice.toFixed(2)} ({ticker.currentPrice > position.atmValue ? '+' : ''}${(ticker.currentPrice - position.atmValue).toFixed(2)} from ATM baseline)
            </div>
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
          </div>
        </div>
        <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg text-center relative group cursor-help">
          <div className="text-xs text-blue-700 font-medium uppercase tracking-wide">IMPL VOL</div>
          <div className="text-lg font-bold text-blue-800" data-testid={`text-implied-vol-${ticker.symbol}`}>
            {position.impliedVolatility.toFixed(1)}%
          </div>
          
          {/* Implied Volatility Tooltip */}
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50 w-64">
            <div className="font-semibold mb-1">Implied Volatility: {position.impliedVolatility.toFixed(1)}%</div>
            <div className="mb-2">
              The market's expectation of how much {ticker.symbol} will move. Higher IV = more expensive options.
            </div>
            <div className="text-xs text-gray-300">
              This is the average IV of your selected call (${position.strategyType === 'short_strangle' ? (position.shortCallStrike || position.longCallStrike) : position.longCallStrike}) and put (${position.strategyType === 'short_strangle' ? (position.shortPutStrike || position.longPutStrike) : position.longPutStrike}) strikes.
            </div>
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
          </div>
        </div>
        <div className="bg-purple-50 border border-purple-200 p-3 rounded-lg text-center relative group cursor-help">
          <div className="text-xs text-purple-700 font-medium uppercase tracking-wide">IV %</div>
          <div className="text-lg font-bold text-purple-800" data-testid={`text-iv-percentile-${ticker.symbol}`}>
            {position.ivPercentile.toFixed(0)}%
          </div>
          
          {/* IV Percentile Tooltip */}
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50 w-64">
            <div className="font-semibold mb-1">{ticker.symbol} IV Percentile: {position.ivPercentile.toFixed(0)}%</div>
            <div className="mb-2">
              {position.ivPercentile <= 20 ? (
                <span className="text-green-300">🟢 Very Low - Cheap volatility, good time to buy options</span>
              ) : position.ivPercentile <= 40 ? (
                <span className="text-yellow-300">🟡 Low - Below average volatility</span>
              ) : position.ivPercentile <= 60 ? (
                <span className="text-blue-300">🔵 Average - Normal volatility range</span>
              ) : position.ivPercentile <= 80 ? (
                <span className="text-orange-300">🟠 High - Above average volatility</span>
              ) : (
                <span className="text-red-300">🔴 Very High - Expensive volatility, consider selling</span>
              )}
            </div>
            <div className="text-xs text-gray-300">
              Current IV: {position.impliedVolatility.toFixed(1)}% is in the {position.ivPercentile.toFixed(0)}th percentile of {ticker.symbol}'s typical range
            </div>
            {/* Tooltip arrow */}
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
          </div>
        </div>
      </div>

      {/* Chart Section for All Strategies */}
      <div className="mb-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              {activeTab === 'pl' ? 'PROFIT/LOSS AT EXPIRATION' : 'PROBABILITY DISTRIBUTION AT EXPIRATION'}
            </h3>
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  activeTab === 'pl' 
                    ? 'bg-white text-gray-900 shadow-sm' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                onClick={() => setActiveTab('pl')}
                data-testid={`button-pl-tab-${ticker.symbol}`}
              >
                P&L
              </button>
              <button
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  activeTab === 'probability' 
                    ? 'bg-white text-gray-900 shadow-sm' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                onClick={() => setActiveTab('probability')}
                data-testid={`button-probability-tab-${ticker.symbol}`}
              >
                Probability
              </button>
            </div>
          </div>
          <div className="h-48 overflow-hidden bg-gray-50 rounded-lg border border-gray-200 flex items-center justify-center">
            {activeTab === 'pl' ? (
              <PLChart ticker={ticker} />
            ) : (
              <ProbabilityChart ticker={ticker} />
            )}
          </div>
        </div>

      {/* Break-even Range */}
      <div className="mb-4">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
          BREAK-EVEN RANGE
        </h4>
        <div className="flex justify-between items-center mb-2 bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="text-left">
            <div className="text-lg font-bold text-red-600" data-testid={`text-lower-breakeven-${ticker.symbol}`}>
              ${position.lowerBreakeven.toFixed(2)}
            </div>
            <div className="text-xs text-muted-foreground">Lower</div>
          </div>
          <div className="flex-1 mx-3 h-1 bg-yellow-400 rounded-full"></div>
          <div className="text-right">
            <div className="text-lg font-bold text-red-600" data-testid={`text-upper-breakeven-${ticker.symbol}`}>
              ${position.upperBreakeven.toFixed(2)}
            </div>
            <div className="text-xs text-muted-foreground">Upper</div>
          </div>
        </div>
      </div>

      {/* Call and Put Strikes - Now Clickable */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div 
          className="text-center bg-blue-50 border border-blue-200 rounded-lg p-3 cursor-pointer hover:bg-blue-100 hover:border-blue-300 transition-colors group"
          onClick={() => setShowStrikeSelector(true)}
          data-testid={`button-call-strike-${ticker.symbol}`}
        >
          <div className="flex items-center justify-center mb-1">
            <div className="text-xs text-blue-700 font-medium uppercase tracking-wide">CALL STRIKE</div>
            {position.strikesManuallySelected && (
              <div className="ml-2 w-2 h-2 bg-green-500 rounded-full" title="Manually selected strikes"></div>
            )}
            <Settings className="ml-1 w-3 h-3 text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="text-xl font-bold text-blue-800" data-testid={`text-call-strike-${ticker.symbol}`}>
            ${(position.strategyType === 'short_strangle' ? (position.shortCallStrike || position.longCallStrike) : position.longCallStrike).toFixed(2)}
          </div>
          <div className="text-xs text-muted-foreground" data-testid={`text-call-premium-${ticker.symbol}`}>
            ${(position.strategyType === 'short_strangle' ? (position.shortCallPremium || position.longCallPremium) : position.longCallPremium).toFixed(2)} per share
          </div>
          <div className="text-sm font-bold text-blue-700" data-testid={`text-call-contract-${ticker.symbol}`}>
            ${((position.strategyType === 'short_strangle' ? (position.shortCallPremium || position.longCallPremium) : position.longCallPremium) * 100).toFixed(0)} per contract
          </div>
        </div>
        <div 
          className="text-center bg-purple-50 border border-purple-200 rounded-lg p-3 cursor-pointer hover:bg-purple-100 hover:border-purple-300 transition-colors group"
          onClick={() => setShowStrikeSelector(true)}
          data-testid={`button-put-strike-${ticker.symbol}`}
        >
          <div className="flex items-center justify-center mb-1">
            <div className="text-xs text-purple-700 font-medium uppercase tracking-wide">PUT STRIKE</div>
            {position.strikesManuallySelected && (
              <div className="ml-2 w-2 h-2 bg-green-500 rounded-full" title="Manually selected strikes"></div>
            )}
            <Settings className="ml-1 w-3 h-3 text-purple-600 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="text-xl font-bold text-purple-800" data-testid={`text-put-strike-${ticker.symbol}`}>
            ${(position.strategyType === 'short_strangle' ? (position.shortPutStrike || position.longPutStrike) : position.longPutStrike).toFixed(2)}
          </div>
          <div className="text-xs text-muted-foreground" data-testid={`text-put-premium-${ticker.symbol}`}>
            ${(position.strategyType === 'short_strangle' ? (position.shortPutPremium || position.longPutPremium) : position.longPutPremium).toFixed(2)} per share
          </div>
          <div className="text-sm font-bold text-purple-700" data-testid={`text-put-contract-${ticker.symbol}`}>
            ${((position.strategyType === 'short_strangle' ? (position.shortPutPremium || position.longPutPremium) : position.longPutPremium) * 100).toFixed(0)} per contract
          </div>
        </div>
      </div>

      {/* Live Greeks Sections */}
      <div className="mb-4">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
          LIVE GREEKS & SENSITIVITY
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg">
            <h5 className="text-xs font-bold text-blue-800 uppercase tracking-wide mb-2">CALL LEG</h5>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Δ (Price)</span>
                <span className="font-medium text-blue-700">
                  {liveGreeks?.call.delta ? liveGreeks.call.delta.toFixed(3) : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Θ (Time)</span>
                <span className="font-medium text-blue-700">
                  {liveGreeks?.call.theta ? liveGreeks.call.theta.toFixed(3) : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Γ (Gamma)</span>
                <span className="font-medium text-blue-700">
                  {liveGreeks?.call.gamma ? liveGreeks.call.gamma.toFixed(3) : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">ν (Vol)</span>
                <span className="font-medium text-blue-700">
                  {liveGreeks?.call.vega ? liveGreeks.call.vega.toFixed(3) : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">IV</span>
                <span className="font-medium text-blue-700">
                  {(liveGreeks?.call.iv || individualIV?.callIV || position.callIV || position.impliedVolatility).toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
          <div className="bg-purple-50 border border-purple-200 p-3 rounded-lg">
            <h5 className="text-xs font-bold text-purple-800 uppercase tracking-wide mb-2">PUT LEG</h5>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Δ (Price)</span>
                <span className="font-medium text-purple-700">
                  {liveGreeks?.put.delta ? liveGreeks.put.delta.toFixed(3) : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Θ (Time)</span>
                <span className="font-medium text-purple-700">
                  {liveGreeks?.put.theta ? liveGreeks.put.theta.toFixed(3) : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Γ (Gamma)</span>
                <span className="font-medium text-purple-700">
                  {liveGreeks?.put.gamma ? liveGreeks.put.gamma.toFixed(3) : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">ν (Vol)</span>
                <span className="font-medium text-purple-700">
                  {liveGreeks?.put.vega ? liveGreeks.put.vega.toFixed(3) : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">IV</span>
                <span className="font-medium text-purple-700">
                  {(liveGreeks?.put.iv || individualIV?.putIV || position.putIV || position.impliedVolatility).toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Greeks Summary */}
        {liveGreeks && (
          <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-3">
            <div className="grid grid-cols-4 gap-3 text-center">
              <div>
                <div className="text-xs text-muted-foreground">Net Δ</div>
                <div className="text-sm font-bold">
                  {((liveGreeks.call.delta + liveGreeks.put.delta) * 100).toFixed(0)}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Net Θ</div>
                <div className="text-sm font-bold text-red-600">
                  {((liveGreeks.call.theta + liveGreeks.put.theta) * 100).toFixed(0)}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Net Γ</div>
                <div className="text-sm font-bold">
                  {((liveGreeks.call.gamma + liveGreeks.put.gamma) * 100).toFixed(0)}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Net ν</div>
                <div className="text-sm font-bold">
                  {((liveGreeks.call.vega + liveGreeks.put.vega) * 100).toFixed(0)}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Info */}
      <div className="flex justify-between items-center text-xs text-muted-foreground bg-gray-50 border border-gray-200 rounded-lg p-2">
        <span>
          {currentPL ? (
            currentPL.isProfit ? '✅ In Profit' : 
            currentPL.isAtBreakeven ? '⚖️ Near Breakeven' : '❌ In Loss'
          ) : 'Profit Zone: Calculating...'}
        </span>
        <span>
          {ticker.earningsDate ? 
            `Next Earnings: ${new Date(ticker.earningsDate).toLocaleDateString('en-US', { month: 'short', day: '2-digit' })}` :
            `Days to Exp: ${position.daysToExpiry}`
          }
        </span>
        {liveGreeks && (
          <span className="text-red-600">
            Daily Theta: ${((liveGreeks.call.theta + liveGreeks.put.theta) * 100).toFixed(0)}
          </span>
        )}
      </div>

      {/* Strike Selector Modal */}
      {showStrikeSelector && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <StrikeSelector
              symbol={ticker.symbol}
              currentPrice={ticker.currentPrice}
              currentPutStrike={position.longPutStrike}
              currentCallStrike={position.longCallStrike}
              onStrikeChange={handleStrikeSelectionChange}
              onCancel={() => setShowStrikeSelector(false)}
              selectedExpiration={selectedExpiration}
            />
          </div>
        </div>
      )}
    </Card>
  );
}, (prevProps, nextProps) => {
  // Custom comparison to ensure re-render when ticker data changes
  const prevTicker = prevProps.ticker;
  const nextTicker = nextProps.ticker;
  
  // Compare key ticker properties that should trigger re-render
  const tickerChanged = 
    prevTicker.currentPrice !== nextTicker.currentPrice ||
    prevTicker.priceChange !== nextTicker.priceChange ||
    prevTicker.priceChangePercent !== nextTicker.priceChangePercent ||
    prevTicker.updatedAt !== nextTicker.updatedAt ||
    prevTicker.id !== nextTicker.id;
  
  if (tickerChanged) {
    console.log(`🔄 TickerCard memo: ${nextTicker.symbol} data changed, re-rendering`);
    return false; // Re-render
  }
  
  // Compare position data
  const prevPosition = prevTicker.position;
  const nextPosition = nextTicker.position;
  const positionChanged = 
    prevPosition.longPutStrike !== nextPosition.longPutStrike ||
    prevPosition.longCallStrike !== nextPosition.longCallStrike ||
    prevPosition.longPutPremium !== nextPosition.longPutPremium ||
    prevPosition.longCallPremium !== nextPosition.longCallPremium;
  
  if (positionChanged) {
    console.log(`🔄 TickerCard memo: ${nextTicker.symbol} position changed, re-rendering`);
    return false; // Re-render
  }
  
  // No changes, skip re-render
  return true;
});

export { TickerCard };
