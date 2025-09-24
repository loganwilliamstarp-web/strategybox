import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, TrendingDown, Activity, Calendar, DollarSign } from "lucide-react";
import { useOptionsChain } from "@/hooks/useOptionsChain";
import type { OptionsChainData, OptionsChain } from "@shared/schema";

interface OptionsChainProps {
  symbol: string;
  isOpen: boolean;
  onClose: () => void;
  selectedExpiration?: string; // Add expiration prop from dashboard
  currentPrice?: number;
  onExpirationChange?: (expiration: string) => void; // Add callback to sync back to dashboard
}

export function OptionsChainComponent({ symbol, isOpen, onClose, selectedExpiration: dashboardExpiration, currentPrice, onExpirationChange }: OptionsChainProps) {
  console.log(`🔄 OptionsChainComponent rendered - dashboardExpiration: ${dashboardExpiration}, symbol: ${symbol}, isOpen: ${isOpen}`);
  
  // Don't render anything if modal is closed or no symbol
  if (!isOpen || !symbol) {
    return null;
  }
  
  const [selectedExpiration, setSelectedExpiration] = useState<string>(dashboardExpiration || "");
  const [selectedTab, setSelectedTab] = useState<"calls" | "puts">("calls");

  // Initialize selectedExpiration with dashboard expiration when modal opens
  useEffect(() => {
    console.log(`📅 OptionsChain initialization check - dashboardExpiration: ${dashboardExpiration}, selectedExpiration: ${selectedExpiration}`);
    if (dashboardExpiration && dashboardExpiration !== selectedExpiration) {
      console.log(`📅 OptionsChain initializing with dashboard expiration: ${dashboardExpiration}`);
      setSelectedExpiration(dashboardExpiration);
    }
  }, [dashboardExpiration, selectedExpiration]);

  const { 
    optionsChain: optionsData, 
    isLoading, 
    error, 
    getAvailableExpirations,
    forceRefresh 
  } = useOptionsChain(symbol, isOpen && !!symbol, selectedExpiration);

  const queryClient = useQueryClient();

  // Force refresh options chain data when modal opens to ensure fresh data
  useEffect(() => {
    if (isOpen && symbol) {
      console.log(`🔄 Options chain modal opened for ${symbol} - AGGRESSIVELY clearing all caches`);
      
      // AGGRESSIVE CACHE CLEARING - Remove ALL related queries
      queryClient.removeQueries({ 
        predicate: (query) => {
          const queryKey = query.queryKey[0];
          return typeof queryKey === 'string' && (
            queryKey.includes('/api/tickers') ||
            queryKey.includes('/api/market-data/options-chain') ||
            queryKey.includes('/api/portfolio/summary')
          );
        }
      });
      
      // Force immediate fresh data fetch with safe invalidation
      queryClient.invalidateQueries({ queryKey: ["/api/tickers"], refetchType: "inactive" });
      queryClient.refetchQueries({ 
        predicate: (query) => {
          const queryKey = query.queryKey[0];
          return typeof queryKey === 'string' && queryKey.includes('/api/market-data/options-chain');
        }
      });
      
      // Force refresh options chain
      forceRefresh();
    }
  }, [isOpen, symbol, forceRefresh, queryClient]);

  // Sync with dashboard expiration selection
  useEffect(() => {
    console.log(`📅 OptionsChain sync check - dashboardExpiration: ${dashboardExpiration}, selectedExpiration: ${selectedExpiration}`);
    if (dashboardExpiration && dashboardExpiration !== selectedExpiration) {
      console.log(`📅 OptionsChain syncing with dashboard expiration: ${dashboardExpiration}`);
      setSelectedExpiration(dashboardExpiration);
      // Force refresh when dashboard expiration changes
      forceRefresh();
    }
  }, [dashboardExpiration, selectedExpiration]);

  // Handle expiration change in options chain and sync back to dashboard
  const handleExpirationChange = (newExpiration: string) => {
    console.log(`📅 OptionsChain expiration changed to: ${newExpiration}, syncing to dashboard`);
    setSelectedExpiration(newExpiration);
    // Sync back to dashboard
    if (onExpirationChange) {
      onExpirationChange(newExpiration);
    }
    // Force refresh dashboard data to ensure consistency
    queryClient.removeQueries({ queryKey: ["/api/tickers"] });
    queryClient.invalidateQueries({ queryKey: ["/api/tickers"], refetchType: "inactive" });
  };

  // Handle modal close with data refresh
  const handleClose = () => {
    console.log(`🔄 Options chain modal closing - forcing dashboard data refresh`);
    // Force refresh dashboard data when modal closes to ensure consistency
    queryClient.removeQueries({ queryKey: ["/api/tickers"] });
    queryClient.invalidateQueries({ queryKey: ["/api/tickers"], refetchType: "inactive" });
    onClose();
  };




  if (isLoading) {
    return (
      <div data-testid="options-chain-loading" className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <Card className="w-full max-w-4xl mx-4">
          <CardContent className="p-8 text-center">
            <Activity className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p>Loading options chain for {symbol}...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !optionsData) {
    return (
      <div data-testid="options-chain-error" className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <Card className="w-full max-w-4xl mx-4">
          <CardContent className="p-8 text-center">
            <p className="text-red-600 mb-4">Failed to load options chain</p>
            <Button onClick={handleClose} data-testid="button-close-error">Close</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Get available expirations and set default
  const availableExpirations = optionsData?.options ? 
    Array.from(new Set(optionsData.options.map((opt: any) => opt.expiration_date as string))) : [];
  
  console.log(`📅 Available expirations from API:`, availableExpirations);
  console.log(`📅 Modal selectedExpiration:`, selectedExpiration);
  console.log(`📅 Dashboard expiration:`, dashboardExpiration);
  
  // Don't auto-select - always use dashboard expiration
  // The dashboard expiration should be the source of truth

  // Show all available options - no complex filtering
  const currentOptions = optionsData?.options || [];
    
  // Separate calls and puts
  const calls = currentOptions.filter((opt: any) => opt.contract_type === 'call');
  const puts = currentOptions.filter((opt: any) => opt.contract_type === 'put');

  const formatGreek = (value: number, decimals = 3) => {
    return value.toFixed(decimals);
  };

  const formatCurrency = (value: number) => {
    return `$${value.toFixed(2)}`;
  };



  const OptionRow = ({ option, type }: { option: any; type: 'call' | 'put' }) => {
    // Calculate mid-price (premium) as average of bid and ask, handle undefined values
    const premium = ((option.bid || 0) + (option.ask || 0)) / 2;
    
    // Safe number formatting with fallbacks
    const safeFormatCurrency = (value: number | undefined) => value ? formatCurrency(value) : "$0.00";
    const safeFormatGreek = (value: number | undefined) => value ? formatGreek(value) : "0.000";
    const safeToLocaleString = (value: number | undefined) => (value || 0).toLocaleString();
    
    return (
      <TableRow 
        key={`${option.strike}-${type}`}
        className="hover:bg-gray-50 transition-colors"
        data-testid={`row-option-${option.strike}-${type}`}
      >
        <TableCell className="font-medium" data-testid={`text-strike-${option.strike}`}>
          <div className="flex items-center gap-2">
            <Badge 
              variant={type === 'call' ? 'default' : 'secondary'} 
              className={`text-xs ${type === 'call' 
                ? 'bg-green-100 text-green-800 hover:bg-green-200' 
                : 'bg-red-100 text-red-800 hover:bg-red-200'
              }`}
            >
              {type === 'call' ? 'CALL' : 'PUT'}
            </Badge>
            ${option.strike || 0}
          </div>
        </TableCell>
        <TableCell className="font-semibold text-blue-600" data-testid={`text-premium-${option.strike}`}>
          {safeFormatCurrency(premium)}
        </TableCell>
        <TableCell data-testid={`text-bid-${option.strike}`}>
          <span className="text-green-600">${option.bid?.toFixed(2) || "0.00"}</span>
        </TableCell>
        <TableCell data-testid={`text-ask-${option.strike}`}>
          <span className="text-red-600">${option.ask?.toFixed(2) || "0.00"}</span>
        </TableCell>
        <TableCell data-testid={`text-last-${option.strike}`}>
          {safeFormatCurrency(option.last || option.mark)}
        </TableCell>
        <TableCell data-testid={`text-volume-${option.strike}`}>
          <Badge variant="secondary">{safeToLocaleString(option.volume)}</Badge>
        </TableCell>
        <TableCell data-testid={`text-oi-${option.strike}`}>
          {safeToLocaleString(option.openInterest)}
        </TableCell>
        <TableCell data-testid={`text-iv-${option.strike}`}>
          <Badge variant={(option.impliedVolatility || 0) > 50 ? "destructive" : "default"}>
            {((option.impliedVolatility || 0) * 100).toFixed(1)}%
          </Badge>
        </TableCell>
        <TableCell data-testid={`text-delta-${option.strike}`}>
          <span className={(option.delta || 0) > 0 ? "text-green-600" : "text-red-600"}>
            {safeFormatGreek(option.delta)}
          </span>
        </TableCell>
        <TableCell data-testid={`text-gamma-${option.strike}`}>
          {safeFormatGreek(option.gamma)}
        </TableCell>
        <TableCell data-testid={`text-theta-${option.strike}`}>
          <span className="text-red-600">{safeFormatGreek(option.theta)}</span>
        </TableCell>
        <TableCell data-testid={`text-vega-${option.strike}`}>
          {safeFormatGreek(option.vega)}
        </TableCell>
      </TableRow>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" data-testid="options-chain-modal">
      <Card className="w-full max-w-7xl max-h-[90vh] overflow-hidden">
        <CardHeader className="border-b bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <CardTitle className="text-2xl" data-testid="text-symbol-title">
                {symbol} Options Chain
              </CardTitle>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-gray-500" />
                <Select value={dashboardExpiration || selectedExpiration} onValueChange={handleExpirationChange}>
                  <SelectTrigger className="w-48" data-testid="select-expiration">
                    <SelectValue placeholder="Select expiration" />
                  </SelectTrigger>
                  <SelectContent>
                    {optionsData?.options && (Array.from(new Set(optionsData.options.map((opt: any) => opt.expiration_date as string))) as string[]).map((date: string) => {
                      console.log('📅 Options Chain - Processing expiration date:', date);
                      const formattedDate = new Date(date).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      });
                      console.log('📅 Options Chain - Formatted date:', formattedDate);
                      return (
                        <SelectItem key={date} value={date} data-testid={`option-expiration-${date}`}>
                          {formattedDate}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button 
              onClick={handleClose}
              variant="outline"
              data-testid="button-close-options"
            >
              Close
            </Button>
          </div>


        </CardHeader>

        <CardContent className="p-0">
          {calls.length > 0 || puts.length > 0 ? (
            <Tabs value={selectedTab} onValueChange={(value) => setSelectedTab(value as "calls" | "puts")}>
              <TabsList className="grid w-full grid-cols-2 rounded-none border-b">
                <TabsTrigger 
                  value="calls" 
                  className="flex items-center gap-2"
                  data-testid="tab-calls"
                >
                  <TrendingUp className="h-4 w-4" />
                  Calls ({calls.length})
                </TabsTrigger>
                <TabsTrigger 
                  value="puts" 
                  className="flex items-center gap-2"
                  data-testid="tab-puts"
                >
                  <TrendingDown className="h-4 w-4" />
                  Puts ({puts.length})
                </TabsTrigger>
              </TabsList>

              <div className="max-h-[60vh] overflow-y-auto">
                <TabsContent value="calls" className="mt-0">
                  <Table>
                    <TableHeader className="sticky top-0 bg-white border-b">
                      <TableRow>
                        <TableHead>Type & Strike</TableHead>
                        <TableHead className="text-blue-600 font-semibold">Premium</TableHead>
                        <TableHead>Bid</TableHead>
                        <TableHead>Ask</TableHead>
                        <TableHead>Last</TableHead>
                        <TableHead>Volume</TableHead>
                        <TableHead>Open Interest</TableHead>
                        <TableHead>IV%</TableHead>
                        <TableHead>Delta</TableHead>
                        <TableHead>Gamma</TableHead>
                        <TableHead>Theta</TableHead>
                        <TableHead>Vega</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody data-testid="table-calls">
                      {calls.map((call: any) => (
                        <OptionRow key={call.strike} option={call} type="call" />
                      ))}
                    </TableBody>
                  </Table>
                </TabsContent>

                <TabsContent value="puts" className="mt-0">
                  <Table>
                    <TableHeader className="sticky top-0 bg-white border-b">
                      <TableRow>
                        <TableHead>Type & Strike</TableHead>
                        <TableHead className="text-blue-600 font-semibold">Premium</TableHead>
                        <TableHead>Bid</TableHead>
                        <TableHead>Ask</TableHead>
                        <TableHead>Last</TableHead>
                        <TableHead>Volume</TableHead>
                        <TableHead>Open Interest</TableHead>
                        <TableHead>IV%</TableHead>
                        <TableHead>Delta</TableHead>
                        <TableHead>Gamma</TableHead>
                        <TableHead>Theta</TableHead>
                        <TableHead>Vega</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody data-testid="table-puts">
                      {puts.map((put: any) => (
                        <OptionRow key={put.strike} option={put} type="put" />
                      ))}
                    </TableBody>
                  </Table>
                </TabsContent>
              </div>
            </Tabs>
          ) : (
            <div className="p-8 text-center" data-testid="no-options-data">
              <DollarSign className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No options data available for selected expiration</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}