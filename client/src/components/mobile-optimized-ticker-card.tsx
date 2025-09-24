import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, BarChart3, TrendingUp, Settings, ChevronDown, ChevronUp } from "lucide-react";
import { useState, memo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useMobile } from "@/hooks/use-mobile";
import type { TickerWithPosition } from "@shared/schema";

interface MobileTickerCardProps {
  ticker: TickerWithPosition;
  selectedExpiration?: string;
  onViewOptions?: (symbol: string) => void;
  onViewVolatilitySurface?: (symbol: string) => void;
}

const MobileTickerCard = memo(function MobileTickerCard({ 
  ticker, 
  selectedExpiration,
  onViewOptions, 
  onViewVolatilitySurface 
}: MobileTickerCardProps) {
  const { position } = ticker;
  const isPositiveChange = ticker.priceChange >= 0;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isMobile = useMobile();
  const [isExpanded, setIsExpanded] = useState(false);

  // Calculate days to expiration based on dashboard selection or position data
  const calculateDaysToExpiration = () => {
    if (selectedExpiration) {
      const today = new Date();
      const expirationDate = new Date(selectedExpiration + 'T16:00:00'); // Market close time
      const diffTime = expirationDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return Math.max(0, diffDays); // Don't show negative days
    }
    return position.daysToExpiry;
  };

  const displayExpirationDate = selectedExpiration || position.expirationDate;
  const daysToExpiration = calculateDaysToExpiration();
  
  const removeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(`/api/tickers/${ticker.symbol}`, { method: "DELETE" });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickers"], refetchType: "inactive" });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/summary"], refetchType: "inactive" });
      toast({
        title: "Ticker removed",
        description: `${ticker.symbol} removed from portfolio.`,
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

  return (
    <Card className="p-4 mb-4 bg-white shadow-sm border border-gray-200">
      {/* Mobile Header - Compact */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-3">
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-lg font-bold text-foreground">{ticker.symbol}</h2>
              <Badge variant="secondary" className="text-xs px-2 py-0.5">
                {getStrategyIcon(position.strategyType)} {getStrategyDisplayName(position.strategyType).split(' ')[0]}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground truncate max-w-[200px]">
              {ticker.companyName}
            </div>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <div className="text-right">
            <div className="text-lg font-bold text-foreground">
              ${ticker.currentPrice.toFixed(2)}
            </div>
            <div className={`text-xs font-medium ${isPositiveChange ? "text-green-600" : "text-red-600"}`}>
              {isPositiveChange ? "+" : ""}${ticker.priceChange.toFixed(2)} ({isPositiveChange ? "+" : ""}{ticker.priceChangePercent.toFixed(2)}%)
            </div>
          </div>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => removeMutation.mutate()}
            disabled={removeMutation.isPending}
            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Mobile Key Metrics - Always Visible */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-red-50 border border-red-200 p-2 rounded-lg text-center">
          <div className="text-xs text-red-700 font-medium">MAX LOSS</div>
          <div className="text-sm font-bold text-red-800">
            {position.maxLoss === Number.MAX_SAFE_INTEGER ? '∞' : `$${position.maxLoss.toLocaleString()}`}
          </div>
        </div>
        <div className="bg-blue-50 border border-blue-200 p-2 rounded-lg text-center">
          <div className="text-xs text-blue-700 font-medium">IMPL VOL</div>
          <div className="text-sm font-bold text-blue-800">
            {position.impliedVolatility.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Mobile Breakeven Range - Compact */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-3">
        <div className="text-xs font-medium text-yellow-800 uppercase tracking-wide mb-2">Break-even Range</div>
        <div className="flex justify-between items-center">
          <div className="text-sm font-bold text-green-600">
            ${position.lowerBreakeven.toFixed(2)}
          </div>
          <div className="flex-1 mx-2 h-1 bg-yellow-400 rounded-full"></div>
          <div className="text-sm font-bold text-green-600">
            ${position.upperBreakeven.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Expandable Details */}
      <div className="border-t border-gray-100 pt-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full justify-between text-sm text-muted-foreground hover:text-foreground"
        >
          <span>More Details</span>
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>

        {isExpanded && (
          <div className="mt-3 space-y-3 animate-in slide-in-from-top-2 duration-200">
            {/* Strike Information */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg text-center">
                <div className="text-xs text-blue-700 font-medium mb-1">CALL STRIKE</div>
                <div className="text-lg font-bold text-blue-800">
                  ${(position.strategyType === 'short_strangle' ? (position.shortCallStrike || position.longCallStrike) : position.longCallStrike).toFixed(2)}
                </div>
                <div className="text-xs text-muted-foreground">
                  ${(position.strategyType === 'short_strangle' ? (position.shortCallPremium || position.longCallPremium) : position.longCallPremium).toFixed(2)} per share
                </div>
              </div>
              <div className="bg-purple-50 border border-purple-200 p-3 rounded-lg text-center">
                <div className="text-xs text-purple-700 font-medium mb-1">PUT STRIKE</div>
                <div className="text-lg font-bold text-purple-800">
                  ${(position.strategyType === 'short_strangle' ? (position.shortPutStrike || position.longPutStrike) : position.longPutStrike).toFixed(2)}
                </div>
                <div className="text-xs text-muted-foreground">
                  ${(position.strategyType === 'short_strangle' ? (position.shortPutPremium || position.longPutPremium) : position.longPutPremium).toFixed(2)} per share
                </div>
              </div>
            </div>

            {/* Additional Metrics */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 border border-gray-200 p-2 rounded-lg text-center">
                <div className="text-xs text-gray-600 font-medium">ATM VALUE</div>
                <div className="text-sm font-bold text-gray-800">${position.atmValue.toFixed(2)}</div>
              </div>
              <div className="bg-purple-50 border border-purple-200 p-2 rounded-lg text-center">
                <div className="text-xs text-purple-700 font-medium">IV %ILE</div>
                <div className="text-sm font-bold text-purple-800">{position.ivPercentile.toFixed(0)}%</div>
              </div>
            </div>

            {/* Expected Move */}
            {position.expectedMove && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                <div className="text-xs font-medium text-indigo-800 uppercase tracking-wide mb-2">Expected Weekly Range</div>
                <div className="flex justify-between items-center">
                  <div className="text-sm font-bold text-indigo-600">
                    ${parseFloat(position.expectedMove.weeklyLow.toString()).toFixed(2)}
                  </div>
                  <div className="flex-1 mx-2 h-1 bg-indigo-400 rounded-full"></div>
                  <div className="text-sm font-bold text-indigo-600">
                    ${parseFloat(position.expectedMove.weeklyHigh.toString()).toFixed(2)}
                  </div>
                </div>
                <div className="text-center mt-2">
                  <span className="text-xs text-indigo-700">
                    ±{(() => {
                      const weeklyLow = parseFloat(position.expectedMove.weeklyLow.toString());
                      const weeklyHigh = parseFloat(position.expectedMove.weeklyHigh.toString());
                      const currentPrice = ticker.currentPrice;
                      const moveRange = Math.max(currentPrice - weeklyLow, weeklyHigh - currentPrice);
                      const movePercent = (moveRange / currentPrice) * 100;
                      return `${movePercent.toFixed(1)}%`;
                    })()}
                  </span>
                </div>
              </div>
            )}

            {/* Mobile Action Buttons */}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onViewOptions?.(ticker.symbol)}
                className="text-xs"
              >
                <BarChart3 className="h-3 w-3 mr-1" />
                Options Chain
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onViewVolatilitySurface?.(ticker.symbol)}
                className="text-xs"
              >
                <Settings className="h-3 w-3 mr-1" />
                Volatility
              </Button>
            </div>

            {/* Expiration Info */}
            <div className="text-center text-xs text-muted-foreground bg-gray-50 border border-gray-200 rounded-lg p-2">
              {daysToExpiration}d to expiration • {new Date(displayExpirationDate).toLocaleDateString('en-US', { month: 'short', day: '2-digit' })}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
});

export { MobileTickerCard };
