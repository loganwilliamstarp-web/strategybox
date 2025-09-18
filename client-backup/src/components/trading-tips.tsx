import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  AlertTriangle, 
  Info, 
  TrendingUp, 
  TrendingDown,
  Clock,
  Target,
  Shield,
  Lightbulb,
  X,
  Zap
} from "lucide-react";
import type { TickerWithPosition } from "@shared/schema";

interface TradingTip {
  id: string;
  type: 'tip' | 'warning' | 'opportunity' | 'risk';
  priority: 'low' | 'medium' | 'high';
  title: string;
  message: string;
  action?: string;
  ticker?: string;
  dismissible: boolean;
  autoHide?: number; // seconds
}

interface TradingTipsProps {
  tickers: TickerWithPosition[];
  className?: string;
}

export function TradingTips({ tickers, className }: TradingTipsProps) {
  const [activeTips, setActiveTips] = useState<TradingTip[]>([]);
  const [dismissedTips, setDismissedTips] = useState<Set<string>>(new Set());
  const [showDetailModal, setShowDetailModal] = useState<TradingTip | null>(null);

  // Generate contextual tips based on current portfolio state
  const generateTips = (): TradingTip[] => {
    const tips: TradingTip[] = [];
    
    if (tickers.length === 0) {
      return [{
        id: 'no-positions',
        type: 'tip',
        priority: 'low',
        title: 'Start Building Your Portfolio',
        message: 'Add your first ticker to begin tracking long strangle positions and analyzing profit potential.',
        action: 'Add a ticker using the search above',
        dismissible: true
      }];
    }

    // High IV warnings
    const highIVTickers = tickers.filter(t => t.position.ivPercentile >= 70);
    if (highIVTickers.length > 0) {
      tips.push({
        id: 'high-iv-warning',
        type: 'warning',
        priority: 'high',
        title: 'High Implied Volatility Alert',
        message: `${highIVTickers.length} position(s) have IV above 70th percentile. Consider taking profits or adjusting positions.`,
        action: `Review: ${highIVTickers.map(t => t.symbol).join(', ')}`,
        dismissible: true
      });
    }

    // Near expiration warnings
    const nearExpiryTickers = tickers.filter(t => t.position.daysToExpiry <= 7);
    if (nearExpiryTickers.length > 0) {
      tips.push({
        id: 'near-expiry-warning',
        type: 'warning',
        priority: 'high',
        title: 'Positions Expiring Soon',
        message: `${nearExpiryTickers.length} position(s) expire within 7 days. Time decay accelerates rapidly.`,
        action: `Review: ${nearExpiryTickers.map(t => t.symbol).join(', ')}`,
        dismissible: true
      });
    }

    // Profit opportunities
    const profitableTickers = tickers.filter(t => {
      const isOutsideRange = t.currentPrice < t.position.lowerBreakeven || t.currentPrice > t.position.upperBreakeven;
      return isOutsideRange;
    });
    if (profitableTickers.length > 0) {
      tips.push({
        id: 'profit-opportunity',
        type: 'opportunity',
        priority: 'medium',
        title: 'Profitable Positions Detected',
        message: `${profitableTickers.length} position(s) are currently profitable. Consider profit-taking strategies.`,
        action: `Review: ${profitableTickers.map(t => t.symbol).join(', ')}`,
        dismissible: true
      });
    }

    // Risk concentration warnings
    const totalPremium = tickers.reduce((sum, t) => sum + t.position.longPutPremium + t.position.longCallPremium, 0);
    const largePositions = tickers.filter(t => {
      const positionPremium = t.position.longPutPremium + t.position.longCallPremium;
      return (positionPremium / totalPremium) > 0.3;
    });
    if (largePositions.length > 0) {
      tips.push({
        id: 'concentration-risk',
        type: 'risk',
        priority: 'medium',
        title: 'Position Concentration Risk',
        message: `${largePositions.length} position(s) represent >30% of total premium. Consider diversification.`,
        action: `Large positions: ${largePositions.map(t => t.symbol).join(', ')}`,
        dismissible: true
      });
    }

    // Volatility environment tips
    const avgIV = tickers.reduce((sum, t) => sum + t.position.impliedVolatility, 0) / tickers.length;
    if (avgIV < 20) {
      tips.push({
        id: 'low-vol-environment',
        type: 'tip',
        priority: 'low',
        title: 'Low Volatility Environment',
        message: 'Average IV is below 20%. Consider waiting for higher volatility before opening new long strangles.',
        dismissible: true,
        autoHide: 10
      });
    }

    // Time decay warnings for positions with < 30 days
    const midExpiryTickers = tickers.filter(t => t.position.daysToExpiry > 7 && t.position.daysToExpiry <= 30);
    if (midExpiryTickers.length > 0) {
      tips.push({
        id: 'time-decay-warning',
        type: 'warning',
        priority: 'medium',
        title: 'Accelerating Time Decay',
        message: `${midExpiryTickers.length} position(s) have 7-30 days until expiry. Monitor closely for adjustments.`,
        action: `Monitor: ${midExpiryTickers.map(t => t.symbol).join(', ')}`,
        dismissible: true
      });
    }

    // Portfolio size recommendations
    if (tickers.length === 1) {
      tips.push({
        id: 'diversification-tip',
        type: 'tip',
        priority: 'low',
        title: 'Portfolio Diversification',
        message: 'Consider adding 2-4 more positions across different sectors to reduce single-stock risk.',
        dismissible: true,
        autoHide: 15
      });
    }

    // Breakeven distance warnings
    const narrowRangeTickers = tickers.filter(t => {
      const range = t.position.upperBreakeven - t.position.lowerBreakeven;
      const pricePercent = (range / t.currentPrice) * 100;
      return pricePercent < 15;
    });
    if (narrowRangeTickers.length > 0) {
      tips.push({
        id: 'narrow-range-warning',
        type: 'warning',
        priority: 'medium',
        title: 'Narrow Profit Range',
        message: `${narrowRangeTickers.length} position(s) have tight breakeven ranges (<15%). Requires significant movement.`,
        action: `Tight ranges: ${narrowRangeTickers.map(t => t.symbol).join(', ')}`,
        dismissible: true
      });
    }

    return tips;
  };

  // Update tips when portfolio changes
  useEffect(() => {
    const newTips = generateTips()
      .filter(tip => !dismissedTips.has(tip.id))
      .slice(0, 3); // Limit to 3 active tips

    setActiveTips(newTips);

    // Auto-hide tips
    newTips.forEach(tip => {
      if (tip.autoHide) {
        setTimeout(() => {
          dismissTip(tip.id);
        }, tip.autoHide * 1000);
      }
    });
  }, [tickers, dismissedTips]);

  const dismissTip = (tipId: string) => {
    setDismissedTips(prev => new Set(prev).add(tipId));
    setActiveTips(prev => prev.filter(tip => tip.id !== tipId));
  };

  const getTipIcon = (type: TradingTip['type']) => {
    switch (type) {
      case 'warning': return AlertTriangle;
      case 'risk': return Shield;
      case 'opportunity': return TrendingUp;
      case 'tip': return Lightbulb;
      default: return Info;
    }
  };

  const getTipColor = (type: TradingTip['type'], priority: TradingTip['priority']) => {
    if (priority === 'high') {
      return type === 'opportunity' ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50';
    }
    if (priority === 'medium') {
      return 'border-yellow-300 bg-yellow-50';
    }
    return 'border-blue-300 bg-blue-50';
  };

  const getPriorityBadge = (priority: TradingTip['priority']) => {
    const colors = {
      high: 'bg-red-100 text-red-800',
      medium: 'bg-yellow-100 text-yellow-800',
      low: 'bg-blue-100 text-blue-800'
    };
    return colors[priority];
  };

  if (activeTips.length === 0) {
    return null;
  }

  return (
    <div className={className}>
      <Card className="p-4" data-testid="trading-tips-card">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-medium text-foreground">Trading Insights</h3>
          </div>
          <Badge variant="secondary" className="text-xs">
            {activeTips.length} active
          </Badge>
        </div>

        <div className="space-y-3">
          {activeTips.map((tip) => {
            const IconComponent = getTipIcon(tip.type);
            
            return (
              <Alert 
                key={tip.id} 
                className={`${getTipColor(tip.type, tip.priority)} relative pr-8`}
                data-testid={`tip-${tip.id}`}
              >
                <div className="flex items-start gap-3">
                  <IconComponent className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertTitle className="text-sm font-medium">{tip.title}</AlertTitle>
                      <Badge className={`text-xs ${getPriorityBadge(tip.priority)}`}>
                        {tip.priority}
                      </Badge>
                    </div>
                    <AlertDescription className="text-xs text-muted-foreground">
                      {tip.message}
                    </AlertDescription>
                    {tip.action && (
                      <div className="mt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => setShowDetailModal(tip)}
                          data-testid={`button-tip-details-${tip.id}`}
                        >
                          {tip.action}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
                
                {tip.dismissible && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute top-1 right-1 h-6 w-6 p-0"
                    onClick={() => dismissTip(tip.id)}
                    data-testid={`button-dismiss-${tip.id}`}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </Alert>
            );
          })}
        </div>
      </Card>

      {/* Detail Modal */}
      <Dialog open={!!showDetailModal} onOpenChange={() => setShowDetailModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {showDetailModal && (() => {
                const IconComponent = getTipIcon(showDetailModal.type);
                return <IconComponent className="h-4 w-4" />;
              })()}
              {showDetailModal?.title}
            </DialogTitle>
            <DialogDescription>
              {showDetailModal?.message}
            </DialogDescription>
          </DialogHeader>
          
          {showDetailModal?.ticker && (
            <div className="mt-4">
              <h4 className="text-sm font-medium mb-2">Affected Position:</h4>
              <Badge variant="outline">{showDetailModal.ticker}</Badge>
            </div>
          )}
          
          <div className="mt-4 space-y-2">
            <h4 className="text-sm font-medium">Recommended Actions:</h4>
            <ul className="text-xs text-muted-foreground space-y-1">
              {showDetailModal?.type === 'warning' && showDetailModal.id === 'high-iv-warning' && (
                <>
                  <li>• Consider closing profitable positions</li>
                  <li>• Roll to later expiration dates</li>
                  <li>• Reduce position size if needed</li>
                </>
              )}
              {showDetailModal?.type === 'warning' && showDetailModal.id === 'near-expiry-warning' && (
                <>
                  <li>• Close positions if profitable</li>
                  <li>• Roll to next expiration cycle</li>
                  <li>• Monitor time decay acceleration</li>
                </>
              )}
              {showDetailModal?.type === 'opportunity' && (
                <>
                  <li>• Consider taking partial profits</li>
                  <li>• Evaluate rolling up/out strategies</li>
                  <li>• Monitor for continued momentum</li>
                </>
              )}
              {showDetailModal?.type === 'risk' && (
                <>
                  <li>• Diversify across more positions</li>
                  <li>• Reduce individual position sizes</li>
                  <li>• Consider different sectors/timeframes</li>
                </>
              )}
            </ul>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}