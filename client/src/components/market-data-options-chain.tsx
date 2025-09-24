import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { BarChart2, TrendingUp, TrendingDown, DollarSign, Activity, Calculator } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useOptionsChain } from "@/hooks/useOptionsChain";

interface OptionsContract {
  strike: number;
  bid: number;
  ask: number;
  last: number;
  volume: number;
  openInterest: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  impliedVolatility: number;
  expirationDate: string;
  daysToExpiration: number;
}

interface SchwabOptionsChain {
  symbol: string;
  underlyingPrice: number;
  calls: OptionsContract[];
  puts: OptionsContract[];
  expirationDates: string[];
}

interface SchwabStrangleData {
  symbol: string;
  underlyingPrice: number;
  recommendedStrikes: {
    putStrike: number;
    callStrike: number;
    putContract: OptionsContract;
    callContract: OptionsContract;
    totalPremium: number;
    maxLoss: number;
    breakevens: {
      lower: number;
      upper: number;
    };
  };
  allStrikes: {
    strike: number;
    putContract?: OptionsContract;
    callContract?: OptionsContract;
    straddle: boolean;
    strangle: boolean;
  }[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  symbol: string;
  selectedExpiration?: string; // Add expiration prop from dashboard
  onAddPosition?: (data: any) => void;
}

export function MarketDataOptionsChain({ isOpen, onClose, symbol, selectedExpiration: dashboardExpiration, onAddPosition }: Props) {
  // Don't render anything if modal is closed or no symbol
  if (!isOpen || !symbol) {
    return null;
  }
  
  const [selectedExpiration, setSelectedExpiration] = useState<string>(dashboardExpiration || "");
  const [daysToExpiry, setDaysToExpiry] = useState(30);
  const [selectedPutStrike, setSelectedPutStrike] = useState<number>(0);
  const [selectedCallStrike, setSelectedCallStrike] = useState<number>(0);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Sync with dashboard expiration selection
  useEffect(() => {
    if (dashboardExpiration && dashboardExpiration !== selectedExpiration) {
      console.log(`📅 Options chain syncing with dashboard expiration: ${dashboardExpiration}`);
      setSelectedExpiration(dashboardExpiration);
      // Force refresh when dashboard expiration changes
      forceRefresh();
    }
  }, [dashboardExpiration]);

  // Check Market Data API status
  const { data: marketDataStatus } = useQuery<{ configured: boolean; status: string }>({
    queryKey: ["/api/market-data/status"],
    enabled: isOpen,
  });

  // Get Market Data options chain using unified hook (database-only, no caching)
  const { 
    optionsChain, 
    isLoading: chainLoading, 
    invalidateCache, 
    forceRefresh,
    getAvailableExpirations 
  } = useOptionsChain(symbol, isOpen && !!marketDataStatus?.configured, selectedExpiration);

  // Calculate position with real market premiums  
  const { data: strangleData, isLoading: strangleLoading } = useQuery<SchwabStrangleData>({
    queryKey: ["/api/position/calculate-with-real-premiums", symbol, selectedPutStrike, selectedCallStrike],
    enabled: isOpen && !!symbol && marketDataStatus?.configured && selectedPutStrike > 0 && selectedCallStrike > 0,
  });

  // Add position with real market premiums
  const addPositionMutation = useMutation({
    mutationFn: async (positionData: any) => {
      return await apiRequest("/api/tickers", {
        method: "POST",
        data: positionData,
      });
    },
    onSuccess: () => {
      toast({
        title: "Position Added",
        description: `Added ${symbol} long strangle with Market Data API premiums`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/tickers"] });
      onClose();
    },
    onError: (error) => {
      toast({
        title: "Failed to Add Position",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  // Handle expiration date change with cache invalidation
  const handleExpirationChange = (newExpiration: string) => {
    console.log(`📅 Expiration changed to: ${newExpiration}`);
    setSelectedExpiration(newExpiration);
    // Force refresh to get fresh data for new expiration
    forceRefresh();
  };

  const handleAddPosition = () => {
    if (!strangleData?.recommendedStrikes) {
      toast({
        title: "No Data Available",
        description: "Please wait for options data to load",
        variant: "destructive",
      });
      return;
    }

    const { recommendedStrikes } = strangleData;
    const positionData = {
      symbol: symbol.toUpperCase(),
      longPutStrike: recommendedStrikes.putStrike,
      longCallStrike: recommendedStrikes.callStrike,
      longPutPremium: (recommendedStrikes.putContract.bid + recommendedStrikes.putContract.ask) / 2,
      longCallPremium: (recommendedStrikes.callContract.bid + recommendedStrikes.callContract.ask) / 2,
      expirationDate: recommendedStrikes.putContract.expirationDate,
      daysToExpiry: recommendedStrikes.putContract.daysToExpiration,
      impliedVolatility: (recommendedStrikes.putContract.impliedVolatility + recommendedStrikes.callContract.impliedVolatility) / 2,
      strikesManuallySelected: true, // Mark as manually selected from real data
      dataSource: "market-data-app", // Track data source
    };

    addPositionMutation.mutate(positionData);
  };

  const formatCurrency = (value: number) => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);

  const formatPercent = (value: number) => `${(value * 100).toFixed(2)}%`;
  const formatGreek = (value: number) => value.toFixed(4);

  if (!isOpen) return null;

  // Check if Market Data API is configured
  if (!marketDataStatus?.configured) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Market Data API Required</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-muted-foreground">
              This component requires Market Data API configuration to display real options data.
            </p>
            <Button onClick={onClose}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-purple-500" />
            {symbol} - Real Options Data (Market Data)
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="strangle" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="strangle">Recommended Strangle</TabsTrigger>
            <TabsTrigger value="chain">Full Options Chain</TabsTrigger>
          </TabsList>

          <TabsContent value="strangle" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Days to Expiry</CardTitle>
                </CardHeader>
                <CardContent>
                  <Select
                    value={daysToExpiry.toString()}
                    onValueChange={(value) => setDaysToExpiry(parseInt(value))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">1 Week (7 days)</SelectItem>
                      <SelectItem value="14">2 Weeks (14 days)</SelectItem>
                      <SelectItem value="21">3 Weeks (21 days)</SelectItem>
                      <SelectItem value="30">1 Month (30 days)</SelectItem>
                      <SelectItem value="45">45 days</SelectItem>
                      <SelectItem value="60">60 days</SelectItem>
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              {strangleData && (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Current Price</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {formatCurrency(strangleData.underlyingPrice)}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Total Premium</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-red-500">
                        -{formatCurrency(strangleData.recommendedStrikes.totalPremium)}
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>

            {strangleLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : strangleData ? (
              <div className="space-y-4">
                {/* Recommended Strikes */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-green-500" />
                      Recommended Long Strangle
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      {/* Call Side */}
                      <div className="space-y-2">
                        <h4 className="font-semibold text-green-500">Long Call</h4>
                        <div className="bg-green-50 dark:bg-green-950 p-3 rounded-lg space-y-1">
                          <div className="flex justify-between">
                            <span>Strike:</span>
                            <span className="font-mono">${strangleData.recommendedStrikes.callStrike}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Bid/Ask:</span>
                            <span className="font-mono">
                              ${strangleData.recommendedStrikes.callContract.bid.toFixed(2)} / 
                              ${strangleData.recommendedStrikes.callContract.ask.toFixed(2)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Mid Price:</span>
                            <span className="font-mono font-bold">
                              ${((strangleData.recommendedStrikes.callContract.bid + strangleData.recommendedStrikes.callContract.ask) / 2).toFixed(2)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Delta:</span>
                            <span className="font-mono">{formatGreek(strangleData.recommendedStrikes.callContract.delta)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>IV:</span>
                            <span className="font-mono">{formatPercent(strangleData.recommendedStrikes.callContract.impliedVolatility)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Put Side */}
                      <div className="space-y-2">
                        <h4 className="font-semibold text-red-500">Long Put</h4>
                        <div className="bg-red-50 dark:bg-red-950 p-3 rounded-lg space-y-1">
                          <div className="flex justify-between">
                            <span>Strike:</span>
                            <span className="font-mono">${strangleData.recommendedStrikes.putStrike}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Bid/Ask:</span>
                            <span className="font-mono">
                              ${strangleData.recommendedStrikes.putContract.bid.toFixed(2)} / 
                              ${strangleData.recommendedStrikes.putContract.ask.toFixed(2)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Mid Price:</span>
                            <span className="font-mono font-bold">
                              ${((strangleData.recommendedStrikes.putContract.bid + strangleData.recommendedStrikes.putContract.ask) / 2).toFixed(2)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Delta:</span>
                            <span className="font-mono">{formatGreek(strangleData.recommendedStrikes.putContract.delta)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>IV:</span>
                            <span className="font-mono">{formatPercent(strangleData.recommendedStrikes.putContract.impliedVolatility)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Strategy Summary */}
                    <Separator className="my-4" />
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <div className="text-sm text-muted-foreground">Max Loss</div>
                        <div className="text-lg font-bold text-red-500">
                          {strangleData.recommendedStrikes.maxLoss === Number.MAX_SAFE_INTEGER ? 'Unlimited' : formatCurrency(strangleData.recommendedStrikes.maxLoss)}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Lower Breakeven</div>
                        <div className="text-lg font-bold">
                          ${strangleData.recommendedStrikes.breakevens.lower.toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Upper Breakeven</div>
                        <div className="text-lg font-bold">
                          ${strangleData.recommendedStrikes.breakevens.upper.toFixed(2)}
                        </div>
                      </div>
                    </div>

                    <Button
                      onClick={handleAddPosition}
                      disabled={addPositionMutation.isPending}
                      className="w-full mt-4"
                      size="lg"
                    >
                      <Calculator className="w-4 h-4 mr-2" />
                      {addPositionMutation.isPending ? "Adding Position..." : "Add Position with Real Premiums"}
                    </Button>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No strangle data available for the selected expiration
              </div>
            )}
          </TabsContent>

          <TabsContent value="chain" className="space-y-4">
            {/* Full Options Chain */}
            {chainLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : optionsChain ? (
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Options Chain - {optionsChain.symbol}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm text-muted-foreground mb-4">
                      Underlying Price: <span className="font-bold">{formatCurrency(optionsChain.underlyingPrice)}</span>
                    </div>
                    
                    <ScrollArea className="h-96">
                      <Table>
                        <TableHeader>
                          {/* First tier - Category headers */}
                          <TableRow>
                            <TableHead 
                              colSpan={4} 
                              className="text-center font-bold text-green-600 bg-green-50 dark:bg-green-950 border-r-2 border-muted"
                              data-testid="header-calls"
                            >
                              Calls
                            </TableHead>
                            <TableHead 
                              colSpan={1} 
                              className="text-center font-bold text-blue-600 bg-blue-50 dark:bg-blue-950 border-x-2 border-muted"
                              data-testid="header-strike"
                            >
                              Strike
                            </TableHead>
                            <TableHead 
                              colSpan={4} 
                              className="text-center font-bold text-red-600 bg-red-50 dark:bg-red-950 border-l-2 border-muted"
                              data-testid="header-puts"
                            >
                              Puts
                            </TableHead>
                          </TableRow>
                          {/* Second tier - Column headers */}
                          <TableRow>
                            <TableHead className="text-center text-green-600 font-semibold" data-testid="header-call-bid">Bid</TableHead>
                            <TableHead className="text-center text-green-600 font-semibold" data-testid="header-call-ask">Ask</TableHead>
                            <TableHead className="text-center text-green-600 font-semibold" data-testid="header-call-last">Last</TableHead>
                            <TableHead className="text-center text-green-600 font-semibold" data-testid="header-call-change">Change</TableHead>
                            <TableHead className="text-center text-blue-600 font-bold border-x-2 border-muted" data-testid="header-strike-price">Strike</TableHead>
                            <TableHead className="text-center text-red-600 font-semibold" data-testid="header-put-bid">Bid</TableHead>
                            <TableHead className="text-center text-red-600 font-semibold" data-testid="header-put-ask">Ask</TableHead>
                            <TableHead className="text-center text-red-600 font-semibold" data-testid="header-put-last">Last</TableHead>
                            <TableHead className="text-center text-red-600 font-semibold" data-testid="header-put-change">Change</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(() => {
                            // Filter options by selected expiration
                            const filteredOptions = selectedExpiration 
                              ? optionsChain.options.filter((opt: any) => opt.expiration_date === selectedExpiration)
                              : optionsChain.options;
                            
                            const calls = filteredOptions.filter((opt: any) => opt.contract_type === 'call');
                            const puts = filteredOptions.filter((opt: any) => opt.contract_type === 'put');
                            
                            return calls.map((call: any) => {
                              const put = puts.find((p: any) => p.strike === call.strike);
                              const isATM = Math.abs(call.strike - optionsChain.underlyingPrice) < 5; // Within $5 of current price
                            
                              return (
                              <TableRow 
                                key={call.strike} 
                                className={`hover:bg-muted/50 ${isATM ? 'bg-yellow-50 dark:bg-yellow-950/30' : ''}`}
                                data-testid={`options-row-${call.strike}`}
                              >
                                {/* Call Bid */}
                                <TableCell 
                                  className="text-center text-green-600 font-mono" 
                                  data-testid={`call-bid-${call.strike}`}
                                >
                                  {call.bid.toFixed(2)}
                                </TableCell>
                                {/* Call Ask */}
                                <TableCell 
                                  className="text-center text-green-600 font-mono" 
                                  data-testid={`call-ask-${call.strike}`}
                                >
                                  {call.ask.toFixed(2)}
                                </TableCell>
                                {/* Call Last */}
                                <TableCell 
                                  className="text-center text-muted-foreground font-mono" 
                                  data-testid={`call-last-${call.strike}`}
                                >
                                  –
                                </TableCell>
                                {/* Call Change */}
                                <TableCell 
                                  className="text-center text-muted-foreground font-mono" 
                                  data-testid={`call-change-${call.strike}`}
                                >
                                  –
                                </TableCell>
                                {/* Strike Price */}
                                <TableCell 
                                  className={`text-center font-bold border-x-2 border-muted ${isATM ? 'text-yellow-600' : 'text-blue-600'}`}
                                  data-testid={`strike-${call.strike}`}
                                >
                                  ${call.strike}
                                </TableCell>
                                {/* Put Bid */}
                                <TableCell 
                                  className="text-center text-red-600 font-mono" 
                                  data-testid={`put-bid-${call.strike}`}
                                >
                                  {put ? put.bid.toFixed(2) : '–'}
                                </TableCell>
                                {/* Put Ask */}
                                <TableCell 
                                  className="text-center text-red-600 font-mono" 
                                  data-testid={`put-ask-${call.strike}`}
                                >
                                  {put ? put.ask.toFixed(2) : '–'}
                                </TableCell>
                                {/* Put Last */}
                                <TableCell 
                                  className="text-center text-muted-foreground font-mono" 
                                  data-testid={`put-last-${call.strike}`}
                                >
                                  –
                                </TableCell>
                                {/* Put Change */}
                                <TableCell 
                                  className="text-center text-muted-foreground font-mono" 
                                  data-testid={`put-change-${call.strike}`}
                                >
                                  –
                                </TableCell>
                              </TableRow>
                              );
                            });
                          })()}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No options chain data available
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}