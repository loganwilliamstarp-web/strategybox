import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X, TrendingUp, TrendingDown } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { TickerWithPosition } from "@shared/schema";

interface TickerListProps {
  tickers: TickerWithPosition[];
}

export function TickerList({ tickers }: TickerListProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();


  const removeMutation = useMutation({
    mutationFn: async (symbol: string) => {
      const response = await apiRequest(`/api/tickers/${symbol}`, { method: "DELETE" });
      return response;
    },
    onSuccess: (_, symbol) => {
      // Only invalidate - let React Query handle timing to prevent request spam
      queryClient.invalidateQueries({ queryKey: ["/api/tickers"], refetchType: "inactive" });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/summary"], refetchType: "inactive" });
      toast({
        title: "Ticker removed",
        description: `${symbol} has been removed from your portfolio.`,
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

  const getIVPercentileColor = (percentile: number) => {
    if (percentile <= 30) return "text-green-600";
    if (percentile <= 70) return "text-yellow-600";
    return "text-red-600";
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  if (tickers.length === 0) {
    return (
      <Card className="p-12 text-center" data-testid="empty-ticker-list">
        <div className="text-muted-foreground">
          <TrendingUp className="mx-auto h-12 w-12 mb-4 opacity-50" />
          <h3 className="text-lg font-medium mb-2">No positions yet</h3>
          <p>Add your first ticker to start tracking long strangle positions.</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden" data-testid="ticker-list-view">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b bg-muted/30">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Symbol</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Price</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Change</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Strikes</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Breakevens</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Premium</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">IV</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Days</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {tickers.map((ticker) => {
              const { position } = ticker;
              const isPositiveChange = ticker.priceChange >= 0;
              const totalPremium = position.longPutPremium + position.longCallPremium;
              
              return (
                <tr 
                  key={ticker.symbol} 
                  className="hover:bg-muted/30 transition-colors"
                  data-testid={`row-ticker-${ticker.symbol}`}
                >
                  {/* Symbol & Company */}
                  <td className="px-4 py-4">
                    <div className="flex flex-col">
                      <span className="font-semibold text-foreground" data-testid={`text-symbol-${ticker.symbol}`}>
                        {ticker.symbol}
                      </span>
                      <span className="text-xs text-muted-foreground truncate max-w-[120px]" data-testid={`text-company-${ticker.symbol}`}>
                        {ticker.companyName}
                      </span>
                    </div>
                  </td>

                  {/* Current Price */}
                  <td className="px-4 py-4">
                    <span className="font-medium text-foreground" data-testid={`text-price-${ticker.symbol}`}>
                      ${ticker.currentPrice.toFixed(2)}
                    </span>
                  </td>

                  {/* Price Change */}
                  <td className="px-4 py-4">
                    <div className="flex items-center space-x-1">
                      {isPositiveChange ? (
                        <TrendingUp className="h-3 w-3 text-green-600" />
                      ) : (
                        <TrendingDown className="h-3 w-3 text-red-600" />
                      )}
                      <span 
                        className={`text-sm font-medium ${isPositiveChange ? 'text-green-600' : 'text-red-600'}`}
                        data-testid={`text-change-${ticker.symbol}`}
                      >
                        {isPositiveChange ? '+' : ''}{ticker.priceChange.toFixed(2)} ({ticker.priceChangePercent.toFixed(2)}%)
                      </span>
                    </div>
                  </td>

                  {/* Strike Prices */}
                  <td className="px-4 py-4">
                    <div className="text-xs space-y-1">
                      <div className="text-green-600" data-testid={`text-put-strike-${ticker.symbol}`}>
                        Put: ${position.longPutStrike}
                      </div>
                      <div className="text-red-600" data-testid={`text-call-strike-${ticker.symbol}`}>
                        Call: ${position.longCallStrike}
                      </div>
                    </div>
                  </td>

                  {/* Breakeven Points */}
                  <td className="px-4 py-4">
                    <div className="text-xs space-y-1">
                      <div className="text-muted-foreground" data-testid={`text-lower-breakeven-${ticker.symbol}`}>
                        ${position.lowerBreakeven.toFixed(2)}
                      </div>
                      <div className="text-muted-foreground" data-testid={`text-upper-breakeven-${ticker.symbol}`}>
                        ${position.upperBreakeven.toFixed(2)}
                      </div>
                    </div>
                  </td>

                  {/* Total Premium */}
                  <td className="px-4 py-4">
                    <span className="font-medium text-red-600" data-testid={`text-premium-${ticker.symbol}`}>
                      -{formatCurrency(totalPremium)}
                    </span>
                  </td>

                  {/* Implied Volatility */}
                  <td className="px-4 py-4">
                    <div className="flex flex-col items-start space-y-1">
                      <span className="text-sm font-medium text-foreground" data-testid={`text-iv-${ticker.symbol}`}>
                        {position.impliedVolatility.toFixed(2)}%
                      </span>
                      <span 
                        className={`text-xs font-medium ${getIVPercentileColor(position.ivPercentile)}`}
                        data-testid={`text-iv-percentile-${ticker.symbol}`}
                      >
                        {position.ivPercentile.toFixed(2)}th %ile
                      </span>
                    </div>
                  </td>

                  {/* Days to Expiry */}
                  <td className="px-4 py-4">
                    <div className="flex flex-col items-start space-y-1">
                      <span className="text-sm font-medium text-foreground" data-testid={`text-days-${ticker.symbol}`}>
                        {position.daysToExpiry}
                      </span>
                      <span className="text-xs text-muted-foreground" data-testid={`text-expiry-date-${ticker.symbol}`}>
                        {new Date(position.expirationDate).toLocaleDateString('en-US', { 
                          month: 'short', 
                          day: 'numeric' 
                        })}
                      </span>
                    </div>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-4 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeMutation.mutate(ticker.symbol)}
                      disabled={removeMutation.isPending}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-red-600"
                      data-testid={`button-remove-${ticker.symbol}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}