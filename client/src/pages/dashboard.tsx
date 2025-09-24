import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wifi, WifiOff, X, CalendarDays, LogOut, User, BookOpen, Grid3X3, List, HelpCircle, RefreshCw, BarChart2, Activity } from "lucide-react";
import { TickerCard } from "@/components/ticker-card";
import { TickerList } from "@/components/ticker-list";
import { TickerSearch } from "@/components/ticker-search";
import { DatePicker } from "@/components/date-picker";
import { WatchlistImporter } from "@/components/watchlist-importer";
import { ImportSettings } from "@/components/import-settings";
import { ExportInsights } from "@/components/export-insights";
import { TradingTips } from "@/components/trading-tips";
import { StrategyScreener } from "@/components/strategy-screener";
import { MarketSentiment } from "@/components/market-sentiment";
import { PerformanceStoryTeller } from "@/components/performance-storyteller";
import { RiskMeter } from "@/components/risk-meter";
import { OptionsChainComponent } from "@/components/options-chain";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { InfoIcon } from "lucide-react";
import { PriceAlerts } from "@/components/price-alerts";
import { ExitRecommendations } from "@/components/exit-recommendations";
import { VolatilitySurfaceComponent } from "@/components/volatility-surface";
import { PositionComparisonComponent } from "@/components/position-comparison";
import { StrategySelector } from "@/components/strategy-selector";
import { ExpirationSelector } from "@/components/expiration-selector";
import { RefreshTimer } from "@/components/refresh-timer";

import { TutorialOverlay } from "@/components/tutorial-overlay";
import { AchievementBadges } from "@/components/achievement-badges";
import { MobileNav } from "@/components/mobile-nav";

import { Link } from "wouter";

import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";
import { useCapacitor } from "@/hooks/useCapacitor";
import { useRealtimeDataV3 } from "@/hooks/useRealtimeDataV3";
import { getOptimalRefetchInterval, getMarketSession, getCurrentEasternTime } from "@/utils/marketHours";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { TickerWithPosition, PortfolioSummary, StrategyType, strategyTypes } from "@shared/schema";

export default function Dashboard() {
  const { user } = useAuth();
  const { isConnected: isRealtimeConnected } = useRealtimeDataV3();
  const { isNative, triggerHaptics } = useCapacitor();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isFirstLogin, setIsFirstLogin] = useState(false);
  const [selectedOptionsSymbol, setSelectedOptionsSymbol] = useState<string>("");
  const [isOptionsChainOpen, setIsOptionsChainOpen] = useState(false);
  const [isVolSurfaceOpen, setIsVolSurfaceOpen] = useState(false);
  const [volSurfaceSymbol, setVolSurfaceSymbol] = useState<string>("");
  const [isPositionComparisonOpen, setIsPositionComparisonOpen] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyType>('long_strangle');
  const [selectedExpiration, setSelectedExpiration] = useState<string>("");
  const [showAllTickers, setShowAllTickers] = useState(false);
  const [isAutoRefreshing, setIsAutoRefreshing] = useState(false);
  const { toast } = useToast();

  // Logout function with proper cleanup
  const handleLogout = async () => {
    try {
      // Clear all React Query cache
      queryClient.clear();
      
      // Clear any local storage
      localStorage.clear();
      
      // Navigate to logout endpoint
      window.location.href = '/api/logout';
    } catch (error) {
      console.error('Logout error:', error);
      // Fallback - force navigation to logout anyway
      window.location.href = '/api/logout';
    }
  };

  // Mutation to update all tickers with new strategy
  const updateAllTickersStrategyMutation = useMutation({
    mutationFn: async (data: { strategyType: StrategyType; expirationDate: string }) => {
      const results = [];
      const promises = tickers.map(async (ticker: TickerWithPosition) => {
        try {
          const response = await apiRequest(`/api/positions/${ticker.position.id}`, {
            method: "PATCH",
            data: {
              strategyType: data.strategyType,
              expirationDate: data.expirationDate,
              recalculateWithNewStrategy: true
            },
          });
          return { success: true, symbol: ticker.symbol, response };
        } catch (error) {
          return { success: false, symbol: ticker.symbol, error };
        }
      });
      
      const responses = await Promise.all(promises);
      const successful = responses.filter((r: any) => r.success);
      const failed = responses.filter((r: any) => !r.success);
      
      return { successful, failed, responses };
    },
    onSuccess: async (data) => {
      // Force immediate refresh of ticker data to show updated strikes
      await queryClient.invalidateQueries({ queryKey: ["/api/tickers"] });
      await queryClient.refetchQueries({ queryKey: ["/api/tickers"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/portfolio/summary"] });
      
      const { successful, failed } = data;
      const isToday = selectedExpiration === new Date().toISOString().split('T')[0];
      
      if (successful.length > 0 && failed.length === 0) {
        toast({
          title: "Strategy Updated",
          description: `All ${successful.length} positions updated to ${selectedStrategy.replace('_', ' ')} strategy`,
        });
      } else if (successful.length > 0 && failed.length > 0) {
        const failedSymbols = failed.map((f: any) => f.symbol).join(', ');
        toast({
          title: "Partial Update",
          description: isToday 
            ? `${successful.length} positions updated. ${failedSymbols} don't offer same-day expiration options.`
            : `${successful.length} positions updated. ${failedSymbols} failed to update.`,
          variant: "default",
        });
      } else {
        toast({
          title: "Update Failed",
          description: "No positions could be updated",
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update ticker strategies",
        variant: "destructive",
      });
    },
  });
  
  // Set default expiration to next Friday (matching backend logic)
  useEffect(() => {
    if (selectedExpiration) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const day = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 5 = Friday, 6 = Saturday

    let daysUntilFriday: number;
    if (day <= 5) { // Sunday (0) through Friday (5)
      daysUntilFriday = 5 - day;
    } else { // Saturday (6)
      daysUntilFriday = 6; // Next Friday is 6 days away
    }

    // Ensure we get at least 1 day (don't select today if it's Friday)
    if (daysUntilFriday === 0) {
      daysUntilFriday = 7; // Next Friday is 7 days away
    }

    const nextFriday = new Date(today);
    nextFriday.setDate(today.getDate() + daysUntilFriday);

    const formatted = nextFriday.toISOString().split("T")[0];
    console.log(
      `📅 Dashboard default expiration: Today is ${today.toDateString()} (day ${day}), next Friday: ${formatted} (${nextFriday.toDateString()})`
    );
    setSelectedExpiration(formatted);
  }, [selectedExpiration]);

  // Debug selectedExpiration changes
  useEffect(() => {
    console.log(`📅 Dashboard selectedExpiration changed to: ${selectedExpiration}`);
  }, [selectedExpiration]);

  // Update existing tickers when strategy or expiration changes
  const handleStrategyChange = (newStrategy: StrategyType) => {
    setSelectedStrategy(newStrategy);
    if (tickers.length > 0 && selectedExpiration) {
      updateAllTickersStrategyMutation.mutate({
        strategyType: newStrategy,
        expirationDate: selectedExpiration
      });
    }
  };

  const handleExpirationChange = (newExpiration: string) => {
    console.log(`📅 Dashboard handleExpirationChange called with: ${newExpiration}`);
    setSelectedExpiration(newExpiration);
    if (tickers.length > 0) {
      updateAllTickersStrategyMutation.mutate({
        strategyType: selectedStrategy,
        expirationDate: newExpiration
      });
    }
  };
  
  // Handle Schwab authentication callback
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const schwabAuth = urlParams.get('schwab_auth');
    const error = urlParams.get('error');
    const message = urlParams.get('message');
    
    if (schwabAuth === 'success') {
      toast({
        title: "Schwab Connected Successfully!",
        description: message || "Live market data is now active for your strangle positions.",
        variant: "default",
      });
      // Refresh Schwab status and tickers
      queryClient.invalidateQueries({ queryKey: ["/api/schwab/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickers"] });
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (schwabAuth === 'demo_success') {
      toast({
        title: "Schwab Integration Working",
        description: message || "OAuth flow completed successfully.",
        variant: "default",
      });
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (error === 'token_failed') {
      toast({
        title: "Authentication Issue",
        description: message || "Failed to exchange authorization code. Please try connecting again.",
        variant: "destructive",
      });
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (error) {
      toast({
        title: "Connection Issue",
        description: message || "Authentication encountered an issue. Please try again.",
        variant: "destructive", 
      });
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [toast]);

  // Check if this is a first-time user and track login metrics
  useEffect(() => {
    if (user) {
      const hasSeenTutorial = localStorage.getItem('tutorial-completed');
      const lastLoginTime = localStorage.getItem('last-login-time');
      const currentTime = Date.now();
      
      // Track login streak and total logins for achievements
      const totalLogins = parseInt(localStorage.getItem('total-logins') || '0') + 1;
      localStorage.setItem('total-logins', totalLogins.toString());
      
      // Track first login time for account age calculation
      if (!localStorage.getItem('first-login')) {
        localStorage.setItem('first-login', currentTime.toString());
      }
      
      // Calculate login streak
      const oneDayAgo = currentTime - (24 * 60 * 60 * 1000);
      const lastLogin = lastLoginTime ? parseInt(lastLoginTime) : 0;
      let currentStreak = parseInt(localStorage.getItem('login-streak') || '1');
      
      if (lastLogin > oneDayAgo) {
        // Same day or consecutive day login
        if (currentTime - lastLogin > 20 * 60 * 60 * 1000) { // More than 20 hours apart
          currentStreak += 1;
        }
      } else if (lastLogin < currentTime - (48 * 60 * 60 * 1000)) {
        // More than 2 days, reset streak
        currentStreak = 1;
      }
      
      localStorage.setItem('login-streak', currentStreak.toString());
      
      // Consider it first login if:
      // 1. Never seen tutorial before, OR
      // 2. Haven't logged in for more than 7 days
      const sevenDaysAgo = currentTime - (7 * 24 * 60 * 60 * 1000);
      const isNewUser = !hasSeenTutorial;
      const isReturningUser = lastLoginTime && parseInt(lastLoginTime) < sevenDaysAgo;
      
      if (isNewUser || isReturningUser) {
        setIsFirstLogin(true);
      }
      
      // Update last login time
      localStorage.setItem('last-login-time', currentTime.toString());
    }
  }, [user]);

  // Automatic data refresh on page load for efficient testing
  useEffect(() => {
    if (user && isRealtimeConnected) {
      console.log('🔄 Dashboard mounted - triggering automatic data refresh for testing');
      
      // Trigger enhanced refresh to get latest market data (prices + options)
      const refreshData = async () => {
        setIsAutoRefreshing(true);
        try {
          const response = await apiRequest('/api/tickers/refresh-earnings', {
            method: 'POST',
          });
          
          if (response.success) {
            console.log('✅ Automatic refresh completed:', response.message);
            toast({
              title: "Market Data Refreshed",
              description: response.pricesUpdated && response.optionsUpdated
                ? `Updated ${response.pricesUpdated} prices and ${response.optionsUpdated} options with latest market data`
                : response.tickersUpdated > 0 
                  ? `Updated ${response.tickersUpdated} tickers with latest market data`
                  : "No tickers with positions found to refresh",
              duration: 4000,
            });
          } else {
            console.warn('⚠️ Automatic refresh returned success: false');
          }
        } catch (error) {
          console.warn('⚠️ Automatic refresh failed:', error);
          // Don't show error toast for automatic refresh failures
        } finally {
          setIsAutoRefreshing(false);
        }
      };
      
      // Small delay to ensure WebSocket is fully connected
      const timeoutId = setTimeout(refreshData, 1000);
      
      return () => clearTimeout(timeoutId);
    }
  }, [user, isRealtimeConnected, toast]);

  
  // Get market-aware refresh intervals
  const optimalIntervals = getOptimalRefetchInterval(isRealtimeConnected);
  
  const { data: allTickers = [], isLoading: tickersLoading, refetch } = useQuery<TickerWithPosition[]>({
    queryKey: ["/api/tickers"], // Single source of truth from database
    // Enforce minimum 60 second intervals, prefer false when WebSocket connected
    refetchInterval: isRealtimeConnected 
      ? false 
      : Math.max(optimalIntervals.refetchInterval || 60000, 60000), // Never allow 0 or less than 60s
    staleTime: 30 * 1000, // Consider data fresh for 30 seconds to prevent spam
    gcTime: 5 * 60 * 1000, // Keep cached for 5 minutes
    refetchOnWindowFocus: false, // Disable aggressive refetching - WebSocket handles updates
    refetchOnMount: true, // Refetch once on mount
    refetchIntervalInBackground: false, // Let WebSocket handle background updates
  });

  // Log ticker data when it changes (React Query v5 compatible)
  useEffect(() => {
    if (allTickers && allTickers.length > 0) {
      console.log('📊 Dashboard: Ticker data updated', allTickers.length, 'tickers');
      console.log('📊 Dashboard: Raw ticker data:', JSON.stringify(allTickers, null, 2));
      allTickers.forEach((ticker: TickerWithPosition) => {
        console.log(`📈 ${ticker.symbol}: $${ticker.currentPrice} (${ticker.priceChange >= 0 ? '+' : ''}${ticker.priceChangePercent}%)`);
      });
      console.log('📊 Dashboard: First ticker data:', JSON.stringify(allTickers[0], null, 2));
    }
  }, [allTickers]);

  // Only force refetch if WebSocket is disconnected
  useEffect(() => {
    if (!isRealtimeConnected) {
      const interval = setInterval(() => {
        console.log('🔄 FORCE REFETCH - WebSocket disconnected, using polling fallback');
        refetch();
      }, 60000); // 1 minute fallback when WebSocket is down
      return () => clearInterval(interval);
    }
  }, [refetch, isRealtimeConnected]);

  // Debug refetch calls
  useEffect(() => {
    console.log('🔄 Dashboard: Refetch function changed');
  }, [refetch]);

  // Filter tickers based on selected expiration date
  const tickers = selectedDate 
    ? allTickers.filter((ticker: TickerWithPosition) => {
        const tickerExpirationDate = new Date(ticker.position.expirationDate);
        const selectedDateOnly = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
        const tickerDateOnly = new Date(tickerExpirationDate.getFullYear(), tickerExpirationDate.getMonth(), tickerExpirationDate.getDate());
        return tickerDateOnly.getTime() === selectedDateOnly.getTime();
      })
    : allTickers;

  const { data: portfolio, isLoading: portfolioLoading } = useQuery<PortfolioSummary>({
    queryKey: ["/api/portfolio/summary"],
  });

  // Calculate filtered portfolio summary when date is selected
  const filteredPortfolio = selectedDate && tickers.length > 0 ? {
    totalPremiumPaid: tickers.reduce((sum: number, ticker: TickerWithPosition) => sum + ticker.position.longPutPremium + ticker.position.longCallPremium, 0),
    activePositions: tickers.length,
    avgDaysToExpiry: tickers.reduce((sum: number, ticker: TickerWithPosition) => sum + ticker.position.daysToExpiry, 0) / tickers.length,
    totalMaxLoss: tickers.reduce((sum: number, ticker: TickerWithPosition) => sum + ticker.position.maxLoss, 0),
    avgImpliedVolatility: tickers.reduce((sum: number, ticker: TickerWithPosition) => sum + ticker.position.impliedVolatility, 0) / tickers.length,
  } : portfolio;

  // Check API status
  const { data: apiStatus = { configured: false, status: "unknown" } } = useQuery<{ configured: boolean; status: string }>({
    queryKey: ["/api/stock-api/status"],
    refetchInterval: 5 * 60 * 1000, // Check every 5 minutes
  });

  // Check Schwab API status
  const { data: schwabStatus = { configured: false, status: "unknown", authenticated: false } } = useQuery<{ configured: boolean; status: string; authenticated: boolean }>({
    queryKey: ["/api/schwab/status"],
    refetchInterval: 5 * 60 * 1000, // Check every 5 minutes
  });

  // Enhanced refresh mutation - now refreshes BOTH prices and options/strikes
  const refreshEarningsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("/api/tickers/refresh-earnings", { method: "POST" });
      return response;
    },
    onSuccess: (data) => {
      console.log('🔄 Refresh completed:', data);
      toast({
        title: "Market Data Refreshed",
        description: `Updated ${data.pricesUpdated} prices and ${data.optionsUpdated} options with latest market data`,
        duration: 5000,
      });
      // Force aggressive cache clearing and refetch
      console.log('🗑️ Clearing all cached data...');
      queryClient.removeQueries({ queryKey: ["/api/tickers"] });
      queryClient.removeQueries({ queryKey: ["/api/portfolio/summary"] });
      queryClient.removeQueries({ 
        predicate: (query) => {
          const queryKey = query.queryKey[0];
          return typeof queryKey === 'string' && queryKey.includes('/api/market-data/options-chain');
        }
      });
      // Force immediate refetch
      console.log('🔄 Forcing immediate refetch...');
      queryClient.refetchQueries({ queryKey: ["/api/tickers"] });
      queryClient.refetchQueries({ queryKey: ["/api/portfolio/summary"] });
    },
    onError: (error) => {
      toast({
        title: "Refresh Failed",
        description: "Failed to update market data. Please try again.",
        variant: "destructive",
      });
    },
  });



  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Navigation */}
      {isNative && (
        <MobileNav
          currentTotalPnL={filteredPortfolio?.totalPremiumPaid ? (filteredPortfolio.totalPremiumPaid * -1) : 0}
          activePositions={filteredPortfolio?.activePositions || 0}
        />
      )}

      {/* Header */}
      <header className={`bg-card shadow-sm border-b border-border ${isNative ? 'mt-16' : ''}`}>
        <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8">
          <div className="flex justify-between items-center h-14 sm:h-16">
            <div className="flex items-center">
              <div className="text-xl font-semibold text-foreground" data-testid="page-title">
                <BarChart2 className="h-6 w-6" />
              </div>
            </div>
            <div className="flex items-center space-x-4">
              {/* Market Session Indicator */}
              <div className="hidden sm:flex items-center space-x-2">
                {(() => {
                  const session = getMarketSession();
                  const etTime = getCurrentEasternTime();
                  
                  switch (session.sessionType) {
                    case 'market':
                      return (
                        <Badge variant="default" className="bg-green-500 hover:bg-green-600 text-xs">
                          <div className="w-2 h-2 bg-white rounded-full mr-1 animate-pulse"></div>
                          Market Open
                        </Badge>
                      );
                    case 'extended':
                      return (
                        <Badge variant="secondary" className="bg-yellow-500 hover:bg-yellow-600 text-xs">
                          <div className="w-2 h-2 bg-white rounded-full mr-1"></div>
                          Extended Hours
                        </Badge>
                      );
                    case 'closed':
                      return (
                        <Badge variant="outline" className="text-xs">
                          <div className="w-2 h-2 bg-gray-400 rounded-full mr-1"></div>
                          Market Closed
                        </Badge>
                      );
                  }
                })()}
                <span className="text-xs text-muted-foreground">{getCurrentEasternTime()} ET</span>
              </div>
              
              {/* Real-time Status Indicators */}
              <div className="flex items-center space-x-1 sm:space-x-2">
                {/* WebSocket Connection Status */}
                {isRealtimeConnected ? (
                  <Badge variant="default" className="bg-blue-500 hover:bg-blue-600 text-xs sm:text-sm">
                    <Wifi className="w-3 h-3 mr-1" />
                    <span className="hidden sm:inline">Real-time</span>
                    <span className="sm:hidden">Live</span>
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs sm:text-sm">
                    <WifiOff className="w-3 h-3 mr-1" />
                    <span className="hidden sm:inline">Connecting...</span>
                    <span className="sm:hidden">...</span>
                  </Badge>
                )}
                
                {/* Schwab API Status - Hidden per user request (using Alpha Vantage instead) */}
                {false && schwabStatus?.configured ? (
                  schwabStatus.authenticated ? (
                    <Badge variant="default" className="bg-purple-500 hover:bg-purple-600">
                      <BarChart2 className="w-3 h-3 mr-1" />
                      Schwab Live
                    </Badge>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          console.log('Initiating Schwab authentication...');
                          
                          const response = await apiRequest("/api/schwab/auth-url");
                          console.log('Generated Schwab auth URL:', response.authUrl);
                          
                          // Open in new window for better debugging
                          const authWindow = window.open(response.authUrl, 'schwab_auth', 'width=600,height=700,scrollbars=yes,resizable=yes');
                          
                          // Listen for messages from popup
                          const messageHandler = (event: MessageEvent) => {
                            if (event.data?.type === 'schwab_auth_success') {
                              console.log('Schwab authentication successful!');
                              toast({
                                title: "Success",
                                description: "Schwab connected successfully! Live market data is now active.",
                                variant: "default",
                              });
                              // Refresh status
                              window.location.reload();
                              window.removeEventListener('message', messageHandler);
                              authWindow?.close();
                            } else if (event.data?.type === 'schwab_auth_error') {
                              console.error('Schwab authentication failed:', event.data.message);
                              toast({
                                title: "Authentication Failed",
                                description: event.data.message || "Please try again.",
                                variant: "destructive",
                              });
                              window.removeEventListener('message', messageHandler);
                              authWindow?.close();
                            }
                          };
                          
                          window.addEventListener('message', messageHandler);
                          
                          // Poll for completion as fallback
                          const pollForCompletion = () => {
                            if (authWindow?.closed) {
                              console.log('Auth window closed, checking status...');
                              window.removeEventListener('message', messageHandler);
                              // Refresh to check if authentication succeeded
                              setTimeout(() => {
                                window.location.reload();
                              }, 1000);
                              return;
                            }
                            setTimeout(pollForCompletion, 1000);
                          };
                          
                          pollForCompletion();

                        } catch (error: any) {
                          console.error('Schwab auth error:', error);
                          
                          // Check if it's a service unavailable error (HTTP 503)
                          if (error.message?.includes('503') || error.message?.includes('temporarily unavailable')) {
                            toast({
                              title: "Schwab OAuth Issue",
                              description: "Only Schwab's OAuth endpoint has issues (Market Data API works fine). Your app is approved - the popup might still work.",
                              variant: "destructive",
                            });
                          } else {
                            toast({
                              title: "Connection Error", 
                              description: "Failed to connect to Schwab. Please try again.",
                              variant: "destructive",
                            });
                          }
                        }
                      }}
                    >
                      <BarChart2 className="w-3 h-3 mr-1" />
                      Connect Schwab
                    </Button>
                  )
                ) : (
                  /* Fallback to Stock API Status */
                  apiStatus?.configured ? (
                    apiStatus.status === "connected" ? (
                      <Badge variant="default" className="bg-green-500 hover:bg-green-600">
                        <Wifi className="w-3 h-3 mr-1" />
                        Live Data
                      </Badge>
                    ) : (
                      <Badge variant="destructive">
                        <WifiOff className="w-3 h-3 mr-1" />
                        API Error
                      </Badge>
                    )
                  ) : (
                    <Badge variant="secondary">
                      <WifiOff className="w-3 h-3 mr-1" />
                      Mock Data
                    </Badge>
                  )
                )}
              </div>
              
              <TickerSearch 
            strategyType={selectedStrategy} 
            expirationDate={selectedExpiration} 
          />
              
              {/* Import Settings */}
              <ImportSettings />
              
              {/* Refresh Button and Timer */}
              {apiStatus?.configured && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refreshEarningsMutation.mutate()}
                    disabled={refreshEarningsMutation.isPending || isAutoRefreshing}
                    data-testid="button-refresh-earnings"
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${(refreshEarningsMutation.isPending || isAutoRefreshing) ? 'animate-spin' : ''}`} />
                    {isAutoRefreshing ? "Auto-Updating..." : refreshEarningsMutation.isPending ? "Refreshing..." : "Refresh"}
                  </Button>
                  
                  {/* API Refresh Timer */}
                  <RefreshTimer intervalMinutes={15} className="hidden sm:flex" />
                </>
              )}

              {/* Position Comparison */}
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setIsPositionComparisonOpen(true)}
                disabled={tickers.length < 2}
                data-testid="button-position-comparison"
                className="mobile-button"
              >
                <BarChart2 className="h-4 w-4 mr-2" />
                Compare
              </Button>

              {/* Learning Path */}
              <Link href="/learning">
                <Button variant="outline" size="sm" data-testid="button-learning" className="mobile-button">
                  <BookOpen className="h-4 w-4 mr-2" />
                  Learn
                </Button>
              </Link>

              {/* User Profile */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" data-testid="button-user-menu">
                    <User className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <div className="px-2 py-1.5 text-sm font-medium">
                    {user?.email || 'User'}
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => {
                      localStorage.removeItem('tutorial-completed');
                      // Force a page refresh to properly restart tutorial
                      window.location.reload();
                    }}
                    data-testid="menu-restart-tutorial"
                  >
                    <BookOpen className="mr-2 h-4 w-4" />
                    Restart Tutorial
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={handleLogout}
                    data-testid="menu-logout"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

            </div>
          </div>
        </div>
      </header>

      {/* Main Dashboard */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Dashboard Controls */}
        <Card className="mb-6 p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              <span className="text-sm font-medium text-muted-foreground">Active Tickers:</span>
              <div className="flex flex-wrap gap-2" data-testid="active-tickers">
                {tickersLoading ? (
                  <div className="text-sm text-muted-foreground">Loading...</div>
                ) : tickers.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    {selectedDate ? "No tickers for selected date" : "No active tickers"}
                  </div>
                ) : (
                  (showAllTickers ? tickers : tickers.slice(0, 5)).map((ticker: TickerWithPosition, index: number) => (
                    <Badge 
                      key={ticker.id} 
                      className="bg-primary text-white"
                      data-testid={`badge-ticker-${ticker.symbol}`}
                    >
                      {ticker.symbol}
                    </Badge>
                  ))
                )}
                {tickers.length > 5 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAllTickers(!showAllTickers)}
                    data-testid="button-see-all-tickers"
                    className="text-xs h-6"
                  >
                    {showAllTickers ? `Show Less` : `See More (${tickers.length - 5})`}
                  </Button>
                )}
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-6">
              {/* Strategy and Expiration Selectors */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 w-full sm:w-auto">
                <div className="w-full sm:w-48">
                  <StrategySelector 
                    value={selectedStrategy}
                    onValueChange={handleStrategyChange}
                  />
                </div>
                <div className="w-full sm:w-56">
                  <ExpirationSelector 
                    value={selectedExpiration}
                    onValueChange={handleExpirationChange}
                    autoSelectFirst
                  />
                </div>
              </div>
              
              {/* View Toggle */}
              <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
                <label className="text-sm font-medium text-muted-foreground">View:</label>
                <div className="flex border rounded-lg p-1 bg-muted/30">
                  <Button
                    variant={viewMode === 'grid' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('grid')}
                    className="h-8 px-3"
                    data-testid="button-grid-view"
                  >
                    <Grid3X3 className="h-4 w-4 mr-1" />
                    Cards
                  </Button>
                  <Button
                    variant={viewMode === 'list' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('list')}
                    className="h-8 px-3"
                    data-testid="button-list-view"
                  >
                    <List className="h-4 w-4 mr-1" />
                    List
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Ticker Display */}
        <div className="mb-8">
          {tickersLoading ? (
            // Loading skeleton
            <div className={viewMode === 'grid' ? 'grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6' : 'space-y-4'}>
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="p-4 md:p-6 animate-pulse">
                  <div className="space-y-4">
                    <div className="h-6 bg-muted rounded w-1/3"></div>
                    <div className="h-4 bg-muted rounded w-1/2"></div>
                    <div className="h-32 bg-muted rounded"></div>
                  </div>
                </Card>
              ))}
            </div>
          ) : tickers.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground text-lg" data-testid="text-no-tickers">
                {selectedDate 
                  ? `No positions expire on ${selectedDate.toLocaleDateString()}. Try selecting a different date or clear the filter.`
                  : "No active tickers. Use the search above to add some tickers to get started."
                }
              </p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
              {tickers.map((ticker: TickerWithPosition) => (
                <TickerCard 
                  key={ticker.id} 
                  ticker={ticker} 
                  selectedExpiration={selectedExpiration}
                  onViewOptions={(symbol) => {
                    setSelectedOptionsSymbol(symbol);
                    setIsOptionsChainOpen(true);
                  }}
                  onViewVolatilitySurface={(symbol) => {
                    setVolSurfaceSymbol(symbol);
                    setIsVolSurfaceOpen(true);
                  }}
                />
              ))}
            </div>
          ) : (
            <TickerList tickers={tickers} />
          )}
        </div>

        {/* Options Chain Modal */}
        <OptionsChainComponent 
          symbol={selectedOptionsSymbol}
          isOpen={isOptionsChainOpen}
          selectedExpiration={selectedExpiration}
          onExpirationChange={handleExpirationChange}
          onClose={() => {
            setIsOptionsChainOpen(false);
            setSelectedOptionsSymbol("");
          }}
        />

        {/* Volatility Surface Modal */}
        <VolatilitySurfaceComponent 
          symbol={volSurfaceSymbol}
          isOpen={isVolSurfaceOpen}
          onClose={() => {
            setIsVolSurfaceOpen(false);
            setVolSurfaceSymbol("");
          }}
        />

        {/* Position Comparison Modal */}
        <PositionComparisonComponent 
          isOpen={isPositionComparisonOpen}
          onClose={() => setIsPositionComparisonOpen(false)}
        />



        {/* Market Sentiment with Risk Analysis */}
        <div className="mb-6">
          <MarketSentiment tickers={tickers} />
        </div>

        {/* Performance Story Teller */}
        {!portfolioLoading && filteredPortfolio && tickers.length > 0 && (
          <div className="mb-6">
            <PerformanceStoryTeller tickers={tickers} summary={filteredPortfolio} />
          </div>
        )}

        {/* Strategy Screener */}
        <div className="mb-6">
          <StrategyScreener onAddTicker={(symbol) => {
            // Add ticker functionality would be implemented here
            // For now, just show a toast
            toast({
              title: "Ticker added to screener results",
              description: `${symbol} is ready to be added to your portfolio`,
            });
          }} />
        </div>

        {/* Trading Tips */}
        <div className="mb-6">
          <TradingTips tickers={tickers} />
        </div>

        {/* Export Insights */}
        {!portfolioLoading && filteredPortfolio && tickers.length > 0 && (
          <div className="mb-6">
            <ExportInsights tickers={tickers} summary={filteredPortfolio} />
          </div>
        )}

        {/* Advanced Trading Features */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <PriceAlerts tickers={tickers} />
          <ExitRecommendations />
        </div>

        {/* Achievement Badges */}
        <div className="mb-6">
          <AchievementBadges tickers={tickers} />
        </div>

        {/* Portfolio Summary */}
        {!portfolioLoading && filteredPortfolio && tickers.length > 0 && (
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground" data-testid="text-portfolio-summary">
                Portfolio Summary
              </h3>
              {selectedDate && (
                <Badge variant="secondary" className="text-xs">
                  Filtered by {selectedDate.toLocaleDateString()}
                </Badge>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4">
              <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                <div className="text-sm text-muted-foreground">Total Premium Paid</div>
                <div className="text-xl font-bold text-red-600" data-testid="text-total-premium">
                  ${(filteredPortfolio.totalPremiumPaid * 100).toFixed(2)}
                </div>
              </div>
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <div className="text-sm text-muted-foreground">Active Positions</div>
                <div className="text-xl font-bold text-blue-600" data-testid="text-active-positions">
                  {filteredPortfolio.activePositions}
                </div>
              </div>
              <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                <div className="text-sm text-muted-foreground">Avg Days to Expiry</div>
                <div className="text-xl font-bold text-yellow-600" data-testid="text-avg-days">
                  {filteredPortfolio.avgDaysToExpiry.toFixed(2)}
                </div>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                <div className="text-sm text-muted-foreground">Total Max Loss</div>
                <div className="text-xl font-bold text-purple-600" data-testid="text-total-risk">
                  ${filteredPortfolio.totalMaxLoss.toFixed(2)}
                </div>
              </div>
              <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200">
                <div className="text-sm text-muted-foreground">Avg Implied Vol</div>
                <div className="text-xl font-bold text-indigo-600" data-testid="text-avg-iv">
                  {filteredPortfolio.avgImpliedVolatility.toFixed(2)}%
                </div>
              </div>
            </div>
          </Card>
        )}



        {/* Volatility Surface Dialog */}
        <VolatilitySurfaceComponent 
          isOpen={isVolSurfaceOpen}
          onClose={() => setIsVolSurfaceOpen(false)}
          symbol={volSurfaceSymbol}
        />

        {/* Position Comparison Dialog */}
        <PositionComparisonComponent
          isOpen={isPositionComparisonOpen}
          onClose={() => setIsPositionComparisonOpen(false)}
        />
      </main>

      {/* Tutorial Overlay */}
      <TutorialOverlay 
        isFirstLogin={isFirstLogin}
        onComplete={() => {
          toast({
            title: "Tutorial Completed!",
            description: "You're ready to start analyzing long strangle strategies.",
          });
        }}
        onSkip={() => {
          toast({
            title: "Tutorial Skipped",
            description: "You can restart the tutorial anytime from the help menu.",
          });
        }}
      />
    </div>
  );
}
