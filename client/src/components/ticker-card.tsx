import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PLChart } from "@/components/pl-chart";
import { ProbabilityChart } from "@/components/probability-chart";
import { StrikeSelector } from "@/components/strike-selector";
import { X, BarChart3, CalendarDays, TrendingUp, Target, Settings, Activity } from "lucide-react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useState, useEffect, useRef, useMemo, memo } from "react";
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
}

const TickerCard = memo(function TickerCard({ ticker, onViewOptions, onViewVolatilitySurface }: TickerCardProps) {
  const { position } = ticker;
  const isPositiveChange = ticker.priceChange >= 0;
  
  // Debug strategy type issues
  console.log(`🎯 TickerCard Debug for ${ticker.symbol}:`, {
    strategyType: position?.strategyType,
    longPutStrike: position?.longPutStrike,
    longCallStrike: position?.longCallStrike,
    shortPutStrike: position?.shortPutStrike,
    shortCallStrike: position?.shortCallStrike
  });
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
      // Force refetch of data by invalidating and refetching immediately
      queryClient.invalidateQueries({ queryKey: ["/api/tickers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/summary"] });
      queryClient.refetchQueries({ queryKey: ["/api/tickers"] });
      queryClient.refetchQueries({ queryKey: ["/api/portfolio/summary"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/tickers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/summary"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/tickers"] });
      queryClient.refetchQueries({ queryKey: ["/api/tickers"] });
    }
  }, [showStrikeSelector, ticker.symbol, queryClient]);

  // Check for premium discrepancies by fetching fresh options data
  // PERFORMANCE FIX: Disable per-card polling, use global WebSocket updates instead
  const { data: freshOptionsData } = useQuery({
    queryKey: ["/api/market-data/options-chain", ticker.symbol],
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
    <Card className="p-6" data-testid={`card-ticker-${ticker.symbol}`}>
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
            onClick={() => onViewOptions?.(ticker.symbol)}
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
            onClick={() => removeMutation.mutate()}
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
          {new Date(position.expirationDate).toLocaleDateString('en-US', { month: 'short', day: '2-digit' })} (Fri)
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
        <div className="bg-orange-50 border border-orange-200 p-3 rounded-lg text-center">
          <div className="text-xs text-orange-700 font-medium uppercase tracking-wide">MAX LOSS</div>
          <div className="text-lg font-bold text-orange-800" data-testid={`text-max-loss-${ticker.symbol}`}>
            {position.maxLoss === Number.MAX_SAFE_INTEGER ? 'Unlimited' : `$${position.maxLoss.toLocaleString()}`}
          </div>
        </div>
        <div className="bg-gray-50 border border-gray-200 p-3 rounded-lg text-center">
          <div className="text-xs text-gray-600 font-medium uppercase tracking-wide">ATM VALUE</div>
          <div className="text-lg font-bold text-gray-800" data-testid={`text-atm-value-${ticker.symbol}`}>
            ${position.atmValue.toFixed(2)}
          </div>
        </div>
        <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg text-center">
          <div className="text-xs text-blue-700 font-medium uppercase tracking-wide">IMPL VOL</div>
          <div className="text-lg font-bold text-blue-800" data-testid={`text-implied-vol-${ticker.symbol}`}>
            {position.impliedVolatility.toFixed(1)}%
          </div>
        </div>
        <div className="bg-purple-50 border border-purple-200 p-3 rounded-lg text-center">
          <div className="text-xs text-purple-700 font-medium uppercase tracking-wide">IV %ILE</div>
          <div className="text-lg font-bold text-purple-800" data-testid={`text-iv-percentile-${ticker.symbol}`}>
            {position.ivPercentile.toFixed(0)}%
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

      {/* Greeks Sections */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg">
          <h4 className="text-xs font-bold text-blue-800 uppercase tracking-wide mb-2">CALL LEG</h4>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Δ</span>
              <span className="font-medium">0.35 | Θ -0.050</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">IV</span>
              <span className="font-medium">{position.impliedVolatility.toFixed(1)}%</span>
            </div>
          </div>
        </div>
        <div className="bg-purple-50 border border-purple-200 p-3 rounded-lg">
          <h4 className="text-xs font-bold text-purple-800 uppercase tracking-wide mb-2">PUT LEG</h4>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Δ</span>
              <span className="font-medium">-0.28 | Θ -0.040</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">IV</span>
              <span className="font-medium">{position.impliedVolatility.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Info */}
      <div className="flex justify-between items-center text-xs text-muted-foreground bg-gray-50 border border-gray-200 rounded-lg p-2">
        <span>Profit Zone: No</span>
        <span>
          {ticker.earningsDate ? 
            `Next Earnings: ${new Date(ticker.earningsDate).toLocaleDateString('en-US', { month: 'short', day: '2-digit' })}` :
            `Days to Exp: ${position.daysToExpiry}`
          }
        </span>
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
            />
          </div>
        </div>
      )}
    </Card>
  );
});

export { TickerCard };
