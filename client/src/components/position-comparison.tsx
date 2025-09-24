import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { PLChart } from "@/components/pl-chart";
import { BarChart2, TrendingUp, TrendingDown, AlertTriangle, DollarSign, Calendar, Target } from "lucide-react";
import type { TickerWithPosition } from "@shared/schema";

interface PositionComparisonProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ComparisonMetrics {
  maxLoss: number;
  maxLossPercent: number;
  profitPotential: number;
  breakevens: number[];
  daysToExpiry: number;
  ivRank: number;
  riskReward: number;
  probabilityOfProfit: number;
}

export function PositionComparisonComponent({ isOpen, onClose }: PositionComparisonProps) {
  const [selectedPositions, setSelectedPositions] = useState<string[]>([]);
  const [comparisonView, setComparisonView] = useState<"metrics" | "charts" | "greeks">("metrics");

  const { data: tickers, isLoading } = useQuery<TickerWithPosition[]>({
    queryKey: ["/api/tickers"],
    enabled: isOpen,
    refetchInterval: false, // Never auto-refetch - use WebSocket updates
    staleTime: 60 * 1000, // Consider data fresh for 60 seconds to prevent spam
    gcTime: 5 * 60 * 1000, // Keep cached for 5 minutes
    refetchOnWindowFocus: false, // Disable aggressive refetching
  });

  if (!isOpen) return null;

  const handlePositionToggle = (symbol: string) => {
    setSelectedPositions(prev => 
      prev.includes(symbol) 
        ? prev.filter(s => s !== symbol)
        : [...prev, symbol]
    );
  };

  const getComparisonMetrics = (ticker: TickerWithPosition): ComparisonMetrics => {
    const { position } = ticker;
    const profitZoneWidth = position.upperBreakeven - position.lowerBreakeven;
    const currentPrice = ticker.currentPrice;
    const profitPotential = Math.max(
      Math.abs(currentPrice - position.lowerBreakeven),
      Math.abs(position.upperBreakeven - currentPrice)
    ) * 0.5; // Simplified profit potential
    
    return {
      maxLoss: position.maxLoss,
      maxLossPercent: position.maxLoss === Number.MAX_SAFE_INTEGER ? Infinity : (position.maxLoss / currentPrice) * 100,
      profitPotential,
      breakevens: [position.lowerBreakeven, position.upperBreakeven],
      daysToExpiry: position.daysToExpiry,
      ivRank: position.ivPercentile,
      riskReward: position.maxLoss === Number.MAX_SAFE_INTEGER ? 0 : profitPotential / position.maxLoss,
      probabilityOfProfit: Math.max(0, Math.min(100, 
        (profitZoneWidth / currentPrice) * 100 * 0.6 + 
        (position.ivPercentile * 0.4)
      ))
    };
  };

  const selectedTickers = tickers?.filter(t => selectedPositions.includes(t.symbol)) || [];

  const renderMetricsComparison = () => (
    <div className="space-y-6">
      {/* Selection Header */}
      <div className="text-center p-4 bg-gray-50 rounded-lg">
        <h3 className="font-medium mb-2">
          {selectedTickers.length === 0 ? "Select positions to compare" : 
           selectedTickers.length === 1 ? "Select another position to compare" :
           `Comparing ${selectedTickers.length} positions`}
        </h3>
        {selectedTickers.length >= 2 && (
          <p className="text-sm text-muted-foreground">
            Analyzing risk/reward profiles across your selected long strangle positions
          </p>
        )}
      </div>

      {selectedTickers.length >= 2 && (
        <div className="grid gap-4">
          {/* Metrics Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2 font-medium">Metric</th>
                  {selectedTickers.map(ticker => (
                    <th key={ticker.symbol} className="text-center p-2 font-medium">
                      {ticker.symbol}
                    </th>
                  ))}
                  <th className="text-center p-2 font-medium text-blue-600">Winner</th>
                </tr>
              </thead>
              <tbody>
                {[
                  {
                    label: "Max Loss",
                    getValue: (t: TickerWithPosition) => getComparisonMetrics(t).maxLoss === Number.MAX_SAFE_INTEGER ? 'Unlimited' : `$${getComparisonMetrics(t).maxLoss.toFixed(2)}`,
                    getBest: (metrics: ComparisonMetrics[]) => {
                      const finiteMetrics = metrics.filter(m => m.maxLoss !== Number.MAX_SAFE_INTEGER);
                      if (finiteMetrics.length === 0) return -1; // All unlimited
                      const lowestFinite = finiteMetrics.reduce((min, m) => m.maxLoss < min.maxLoss ? m : min);
                      return metrics.indexOf(lowestFinite);
                    },
                    icon: <AlertTriangle className="h-4 w-4 text-red-500" />
                  },
                  {
                    label: "Risk %",
                    getValue: (t: TickerWithPosition) => {
                      const percent = getComparisonMetrics(t).maxLossPercent;
                      return percent === Infinity ? 'Unlimited' : `${percent.toFixed(2)}%`;
                    },
                    getBest: (metrics: ComparisonMetrics[]) => {
                      const finiteMetrics = metrics.filter(m => m.maxLossPercent !== Infinity);
                      if (finiteMetrics.length === 0) return -1; // All unlimited
                      const lowestFinite = finiteMetrics.reduce((min, m) => m.maxLossPercent < min.maxLossPercent ? m : min);
                      return metrics.indexOf(lowestFinite);
                    },
                    icon: <TrendingDown className="h-4 w-4 text-red-500" />
                  },
                  {
                    label: "Risk/Reward",
                    getValue: (t: TickerWithPosition) => getComparisonMetrics(t).riskReward.toFixed(2),
                    getBest: (metrics: ComparisonMetrics[]) => metrics.indexOf(metrics.reduce((max, m) => m.riskReward > max.riskReward ? m : max)),
                    icon: <Target className="h-4 w-4 text-green-500" />
                  },
                  {
                    label: "Days to Expiry",
                    getValue: (t: TickerWithPosition) => getComparisonMetrics(t).daysToExpiry.toString(),
                    getBest: (metrics: ComparisonMetrics[]) => metrics.indexOf(metrics.reduce((max, m) => m.daysToExpiry > max.daysToExpiry ? m : max)),
                    icon: <Calendar className="h-4 w-4 text-blue-500" />
                  },
                  {
                    label: "IV Rank",
                    getValue: (t: TickerWithPosition) => `${getComparisonMetrics(t).ivRank.toFixed(2)}%`,
                    getBest: (metrics: ComparisonMetrics[]) => metrics.indexOf(metrics.reduce((max, m) => m.ivRank > max.ivRank ? m : max)),
                    icon: <TrendingUp className="h-4 w-4 text-purple-500" />
                  },
                  {
                    label: "Profit Probability",
                    getValue: (t: TickerWithPosition) => `${getComparisonMetrics(t).probabilityOfProfit.toFixed(1)}%`,
                    getBest: (metrics: ComparisonMetrics[]) => metrics.indexOf(metrics.reduce((max, m) => m.probabilityOfProfit > max.probabilityOfProfit ? m : max)),
                    icon: <DollarSign className="h-4 w-4 text-green-500" />
                  }
                ].map(metric => {
                  const allMetrics = selectedTickers.map(getComparisonMetrics);
                  const bestIndex = metric.getBest(allMetrics);
                  
                  return (
                    <tr key={metric.label} className="border-b hover:bg-gray-50">
                      <td className="p-2 font-medium flex items-center">
                        {metric.icon}
                        <span className="ml-2">{metric.label}</span>
                      </td>
                      {selectedTickers.map((ticker, index) => (
                        <td key={ticker.symbol} className={`p-2 text-center ${
                          index === bestIndex ? 'bg-green-100 font-semibold text-green-800' : ''
                        }`}>
                          {metric.getValue(ticker)}
                        </td>
                      ))}
                      <td className="p-2 text-center">
                        <Badge variant="default" className="bg-green-600">
                          {selectedTickers[bestIndex].symbol}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Summary Analysis */}
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <h4 className="font-medium mb-2 text-blue-800">Analysis Summary</h4>
            <div className="text-sm text-blue-700 space-y-1">
              {(() => {
                const allMetrics = selectedTickers.map(getComparisonMetrics);
                const bestRiskReward = allMetrics.reduce((max, m, i) => 
                  m.riskReward > allMetrics[max].riskReward ? i : max, 0);
                const lowestRisk = allMetrics.reduce((min, m, i) => 
                  m.maxLossPercent < allMetrics[min].maxLossPercent ? i : min, 0);
                
                return (
                  <>
                    <p>• <strong>{selectedTickers[bestRiskReward].symbol}</strong> offers the best risk/reward ratio ({allMetrics[bestRiskReward].riskReward.toFixed(2)})</p>
                    <p>• <strong>{selectedTickers[lowestRisk].symbol}</strong> has the lowest risk exposure ({allMetrics[lowestRisk].maxLossPercent.toFixed(2)}% of stock price)</p>
                    <p>• Portfolio diversification: {selectedTickers.length} positions across different volatility environments</p>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderChartsComparison = () => (
    <div className="space-y-4">
      {selectedTickers.length >= 2 ? (
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(selectedTickers.length, 2)}, 1fr)` }}>
          {selectedTickers.slice(0, 4).map(ticker => (
            <Card key={ticker.symbol}>
              <CardHeader>
                <CardTitle className="text-lg">{ticker.symbol}</CardTitle>
                <div className="text-sm text-muted-foreground">
                  Max Loss: ${getComparisonMetrics(ticker).maxLoss.toFixed(2)}
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-48">
                  <PLChart ticker={ticker} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-8">
          <p className="text-muted-foreground">Select at least 2 positions to compare P&L charts</p>
        </div>
      )}
    </div>
  );

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
        <Card className="w-full max-w-6xl">
          <CardHeader>
            <CardTitle className="flex items-center">
              <BarChart2 className="h-5 w-5 mr-2 text-blue-600" />
              Position Comparison
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center h-48">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <Card className="w-full max-w-7xl max-h-[90vh] flex flex-col">
        <CardHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center">
              <BarChart2 className="h-5 w-5 mr-2 text-blue-600" />
              Position Comparison
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={onClose} data-testid="button-close-comparison">
              ×
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="flex-1 overflow-y-auto min-h-0 p-6">
          {/* Position Selection */}
          <div className="mb-6">
            <h3 className="font-medium mb-3">Select Positions to Compare</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {tickers?.map(ticker => (
                <div key={ticker.symbol} className="flex items-center space-x-2">
                  <Checkbox
                    id={ticker.symbol}
                    checked={selectedPositions.includes(ticker.symbol)}
                    onCheckedChange={() => handlePositionToggle(ticker.symbol)}
                    data-testid={`checkbox-position-${ticker.symbol}`}
                  />
                  <label
                    htmlFor={ticker.symbol}
                    className="text-sm font-medium cursor-pointer flex items-center"
                  >
                    {ticker.symbol}
                    <span className={`ml-1 text-xs px-1 rounded ${
                      ticker.priceChange >= 0 ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                    }`}>
                      {ticker.priceChange >= 0 ? '+' : ''}{ticker.priceChangePercent.toFixed(2)}%
                    </span>
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* View Toggle */}
          <div className="flex gap-2 mb-6">
            <Button
              variant={comparisonView === "metrics" ? "default" : "outline"}
              size="sm"
              onClick={() => setComparisonView("metrics")}
              data-testid="button-view-metrics"
            >
              Metrics
            </Button>
            <Button
              variant={comparisonView === "charts" ? "default" : "outline"}
              size="sm"
              onClick={() => setComparisonView("charts")}
              data-testid="button-view-charts"
            >
              P&L Charts
            </Button>
          </div>

          {/* Content */}
          {comparisonView === "metrics" && renderMetricsComparison()}
          {comparisonView === "charts" && renderChartsComparison()}
        </CardContent>
      </Card>
    </div>
  );
}