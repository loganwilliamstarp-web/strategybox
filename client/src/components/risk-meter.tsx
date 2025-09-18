import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { TrendingUp, TrendingDown, Activity, BarChart3, AlertTriangle, Lightbulb, Target, Info } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface RiskMeterProps {
  tickers: Array<{
    symbol: string;
    currentPrice: number;
    priceChange: number;
    priceChangePercent: number;
    position: {
      impliedVolatility: number;
      ivPercentile: number;
      daysToExpiry: number;
      longPutStrike: number;
      longCallStrike: number;
      lowerBreakeven: number;
      upperBreakeven: number;
      maxLoss: number;
      expirationDate: string;
    };
  }>;
}

interface RiskScore {
  score: number;
  level: 'Low' | 'Medium' | 'High' | 'Extreme';
  color: string;
  bgColor: string;
  icon: React.ReactNode;
}

interface MarketInsight {
  id: string;
  type: 'tip' | 'warning' | 'opportunity' | 'risk';
  title: string;
  description: string;
  confidence: number;
  reasoning: string;
  action?: string;
}

export function RiskMeter({ tickers }: RiskMeterProps) {
  const [currentScore, setCurrentScore] = useState(0);
  const [targetScore, setTargetScore] = useState(0);
  const [insights, setInsights] = useState<MarketInsight[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Market sentiment data
  const { data: marketData } = useQuery({
    queryKey: ["/api/market-sentiment"],
    enabled: false, // We'll use mock data for now
  });

  // Calculate risk score based on portfolio volatility metrics
  const calculateRiskScore = (): RiskScore => {
    if (tickers.length === 0) {
      return {
        score: 0,
        level: 'Low',
        color: 'text-green-600',
        bgColor: 'bg-green-500',
        icon: <Activity className="h-4 w-4" />
      };
    }

    // Calculate weighted average IV percentile
    const avgIVPercentile = tickers.reduce((sum, ticker) => 
      sum + ticker.position.ivPercentile, 0) / tickers.length;

    // Calculate average implied volatility
    const avgIV = tickers.reduce((sum, ticker) => 
      sum + ticker.position.impliedVolatility, 0) / tickers.length;

    // Calculate average days to expiry (shorter = higher risk)
    const avgDaysToExpiry = tickers.reduce((sum, ticker) => 
      sum + ticker.position.daysToExpiry, 0) / tickers.length;

    // Risk scoring algorithm
    let score = 0;

    // IV Percentile factor (0-40 points)
    score += (avgIVPercentile / 100) * 40;

    // High IV factor (0-30 points)
    if (avgIV > 30) score += 15;
    if (avgIV > 50) score += 15;

    // Time decay risk (0-20 points)
    if (avgDaysToExpiry < 7) score += 20;
    else if (avgDaysToExpiry < 14) score += 10;
    else if (avgDaysToExpiry < 30) score += 5;

    // Portfolio concentration risk (0-10 points)
    if (tickers.length === 1) score += 10;
    else if (tickers.length === 2) score += 5;

    // Cap at 100
    score = Math.min(100, Math.max(0, score));

    // Determine risk level and styling
    if (score < 25) {
      return {
        score: Math.round(score),
        level: 'Low',
        color: 'text-green-600',
        bgColor: 'bg-green-500',
        icon: <TrendingDown className="h-4 w-4" />
      };
    } else if (score < 50) {
      return {
        score: Math.round(score),
        level: 'Medium',
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-500',
        icon: <Activity className="h-4 w-4" />
      };
    } else if (score < 75) {
      return {
        score: Math.round(score),
        level: 'High',
        color: 'text-orange-600',
        bgColor: 'bg-orange-500',
        icon: <TrendingUp className="h-4 w-4" />
      };
    } else {
      return {
        score: Math.round(score),
        level: 'Extreme',
        color: 'text-red-600',
        bgColor: 'bg-red-500',
        icon: <TrendingUp className="h-4 w-4" />
      };
    }
  };

  const riskData = calculateRiskScore();

  // Generate market insights
  const generateInsights = (): MarketInsight[] => {
    if (tickers.length === 0) return [];

    const insights: MarketInsight[] = [];
    const avgIV = tickers.reduce((sum, t) => sum + t.position.impliedVolatility, 0) / tickers.length;
    const avgIVPercentile = tickers.reduce((sum, t) => sum + t.position.ivPercentile, 0) / tickers.length;
    const avgDTE = tickers.reduce((sum, t) => sum + t.position.daysToExpiry, 0) / tickers.length;

    // Market volatility environment analysis
    const vixLevel = 22.5; // Mock VIX level
    if (vixLevel > 30) {
      insights.push({
        id: 'high-vix',
        type: 'warning',
        title: 'High Volatility Environment',
        description: `VIX at ${vixLevel.toFixed(1)} indicates elevated market fear. Your long strangles may benefit from high IV.`,
        confidence: 85,
        reasoning: 'High VIX typically correlates with increased options premiums and potential profit opportunities for long volatility strategies.',
        action: 'Monitor positions closely for profit-taking opportunities'
      });
    } else if (vixLevel < 15) {
      insights.push({
        id: 'low-vix',
        type: 'risk',
        title: 'Low Volatility Environment',
        description: `VIX at ${vixLevel.toFixed(1)} suggests complacent markets. Long strangles may struggle in low volatility.`,
        confidence: 78,
        reasoning: 'Low VIX environments typically result in lower options premiums and reduced profit potential for long volatility strategies.',
        action: 'Consider reducing position sizes or waiting for volatility expansion'
      });
    }

    // IV percentile analysis
    if (avgIVPercentile > 75) {
      insights.push({
        id: 'high-iv-percentile',
        type: 'opportunity',
        title: 'High IV Percentile Portfolio',
        description: `Average IV percentile of ${avgIVPercentile.toFixed(0)}% suggests expensive options. Consider profit-taking.`,
        confidence: 82,
        reasoning: 'High IV percentile indicates options are relatively expensive compared to historical levels, creating profit-taking opportunities.',
        action: 'Look for positions approaching profit targets'
      });
    } else if (avgIVPercentile < 25) {
      insights.push({
        id: 'low-iv-percentile',
        type: 'tip',
        title: 'Low IV Percentile Environment',
        description: `Average IV percentile of ${avgIVPercentile.toFixed(0)}% suggests cheap options. Good entry opportunities.`,
        confidence: 76,
        reasoning: 'Low IV percentile indicates options are relatively cheap, providing good risk/reward for new long volatility positions.',
        action: 'Consider adding new positions or increasing size'
      });
    }

    // Time decay analysis
    if (avgDTE < 14) {
      insights.push({
        id: 'high-theta',
        type: 'warning',
        title: 'High Time Decay Risk',
        description: `Average ${avgDTE.toFixed(0)} days to expiry. Time decay is accelerating on your positions.`,
        confidence: 90,
        reasoning: 'Options lose value rapidly as expiration approaches, especially in the final 2-3 weeks.',
        action: 'Consider closing positions or rolling to later expirations'
      });
    }

    // Portfolio concentration
    if (tickers.length === 1) {
      insights.push({
        id: 'concentration-risk',
        type: 'risk',
        title: 'Single Position Concentration',
        description: 'Portfolio concentrated in one ticker increases risk. Consider diversification.',
        confidence: 85,
        reasoning: 'Single-stock concentration exposes portfolio to idiosyncratic risk that could be mitigated through diversification.',
        action: 'Add positions in different sectors or asset classes'
      });
    }

    return insights.slice(0, 3); // Return top 3 insights
  };

  // Mock market sentiment data
  const mockMarketData = {
    vix: 22.5,
    vixChange: -1.2,
    spyTrend: 'bullish',
    sectorRotation: 'Technology leading, Energy lagging',
    volatilityEnvironment: 'Elevated',
    marketOutlook: 'Cautiously optimistic with elevated volatility providing opportunities for long strangles'
  };

  // Animate score changes
  useEffect(() => {
    setTargetScore(riskData.score);
  }, [riskData.score]);

  useEffect(() => {
    if (currentScore !== targetScore) {
      const increment = targetScore > currentScore ? 1 : -1;
      const timer = setTimeout(() => {
        setCurrentScore(prev => {
          const next = prev + increment;
          return increment > 0 ? Math.min(next, targetScore) : Math.max(next, targetScore);
        });
      }, 20);
      return () => clearTimeout(timer);
    }
  }, [currentScore, targetScore]);

  // Generate insights when tickers change
  useEffect(() => {
    setInsights(generateInsights());
  }, [tickers]);

  const handleRefreshInsights = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setInsights(generateInsights());
      setIsRefreshing(false);
    }, 1000);
  };

  // Calculate fill percentage for the meter
  const fillPercentage = (currentScore / 100) * 100;

  return (
    <Card className="p-6" data-testid="card-risk-meter">
      <div className="space-y-6">
        {/* Portfolio Risk Section */}
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className={`p-2 rounded-full ${riskData.bgColor}/10`}>
                <div className={riskData.color}>
                  {riskData.icon}
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground" data-testid="text-risk-title">
                  Portfolio Risk
                </h3>
                <p className="text-sm text-muted-foreground">
                  Real-time volatility analysis
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className={`text-2xl font-bold ${riskData.color}`} data-testid="text-risk-score">
                {currentScore}
              </div>
              <div className={`text-sm font-medium ${riskData.color}`} data-testid="text-risk-level">
                {riskData.level} Risk
              </div>
            </div>
          </div>

          {/* Animated Risk Meter */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Low</span>
              <span>Medium</span>
              <span>High</span>
              <span>Extreme</span>
            </div>
            
            {/* Meter Background */}
            <div className="relative h-6 bg-muted rounded-full overflow-hidden" data-testid="meter-background">
              {/* Color segments */}
              <div className="absolute inset-0 flex">
                <div className="flex-1 bg-green-200"></div>
                <div className="flex-1 bg-yellow-200"></div>
                <div className="flex-1 bg-orange-200"></div>
                <div className="flex-1 bg-red-200"></div>
              </div>
              
              {/* Animated fill */}
              <div 
                className={`absolute top-0 left-0 h-full transition-all duration-300 ease-out ${riskData.bgColor} opacity-80`}
                style={{ width: `${fillPercentage}%` }}
                data-testid="meter-fill"
              ></div>
              
              {/* Animated glow effect */}
              <div 
                className={`absolute top-0 left-0 h-full transition-all duration-300 ease-out ${riskData.bgColor} opacity-40 blur-sm`}
                style={{ width: `${fillPercentage}%` }}
              ></div>
            </div>
            
            {/* Scale markers */}
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0</span>
              <span>25</span>
              <span>50</span>
              <span>75</span>
              <span>100</span>
            </div>
          </div>

          {/* Risk Factors */}
          {tickers.length > 0 && (
            <div className="pt-2 border-t space-y-2">
              <h4 className="text-sm font-medium text-foreground">Risk Factors:</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Avg IV Percentile:</span>
                    <span className="font-medium">
                      {(tickers.reduce((sum, t) => sum + t.position.ivPercentile, 0) / tickers.length).toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Avg IV:</span>
                    <span className="font-medium">
                      {(tickers.reduce((sum, t) => sum + t.position.impliedVolatility, 0) / tickers.length).toFixed(2)}%
                    </span>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Avg DTE:</span>
                    <span className="font-medium">
                      {Math.round(tickers.reduce((sum, t) => sum + t.position.daysToExpiry, 0) / tickers.length)} days
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Positions:</span>
                    <span className="font-medium">{tickers.length}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Market Sentiment Section */}
        <div className="pt-4 border-t">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <div className="p-2 rounded-full bg-blue-500/10">
                <BarChart3 className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Market Sentiment</h3>
                <p className="text-sm text-muted-foreground">AI-driven market analysis</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefreshInsights}
              disabled={isRefreshing}
              className="h-8"
              data-testid="button-refresh-insights"
            >
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </Button>
          </div>

          {/* Market Overview */}
          <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">VIX:</span>
                <span className={`font-medium ${mockMarketData.vixChange < 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {mockMarketData.vix.toFixed(2)} ({mockMarketData.vixChange > 0 ? '+' : ''}{mockMarketData.vixChange.toFixed(2)})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">SPY Trend:</span>
                <span className="font-medium text-green-600 capitalize">{mockMarketData.spyTrend}</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Vol Environment:</span>
                <span className="font-medium text-orange-600">{mockMarketData.volatilityEnvironment}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Outlook:</span>
                <span className="font-medium text-blue-600">Bullish</span>
              </div>
            </div>
          </div>

          {/* AI Insights */}
          {insights.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-foreground">AI Insights:</h4>
              <div className="space-y-2">
                {insights.map((insight) => (
                  <div key={insight.id} className="flex items-start space-x-2">
                    <div className={`p-1 rounded-full ${
                      insight.type === 'tip' ? 'bg-blue-500/10' :
                      insight.type === 'warning' ? 'bg-yellow-500/10' :
                      insight.type === 'opportunity' ? 'bg-green-500/10' :
                      'bg-red-500/10'
                    }`}>
                      {insight.type === 'tip' && <Lightbulb className="h-3 w-3 text-blue-600" />}
                      {insight.type === 'warning' && <AlertTriangle className="h-3 w-3 text-yellow-600" />}
                      {insight.type === 'opportunity' && <Target className="h-3 w-3 text-green-600" />}
                      {insight.type === 'risk' && <AlertTriangle className="h-3 w-3 text-red-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-foreground">{insight.title}</p>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                              <Info className="h-3 w-3" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-md">
                            <DialogHeader>
                              <DialogTitle className="flex items-center space-x-2">
                                <div className={`p-1 rounded-full ${
                                  insight.type === 'tip' ? 'bg-blue-500/10' :
                                  insight.type === 'warning' ? 'bg-yellow-500/10' :
                                  insight.type === 'opportunity' ? 'bg-green-500/10' :
                                  'bg-red-500/10'
                                }`}>
                                  {insight.type === 'tip' && <Lightbulb className="h-4 w-4 text-blue-600" />}
                                  {insight.type === 'warning' && <AlertTriangle className="h-4 w-4 text-yellow-600" />}
                                  {insight.type === 'opportunity' && <Target className="h-4 w-4 text-green-600" />}
                                  {insight.type === 'risk' && <AlertTriangle className="h-4 w-4 text-red-600" />}
                                </div>
                                <span>{insight.title}</span>
                              </DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                              <p className="text-sm text-muted-foreground">{insight.description}</p>
                              <div className="space-y-2">
                                <h4 className="text-sm font-medium">Analysis:</h4>
                                <p className="text-sm text-muted-foreground">{insight.reasoning}</p>
                              </div>
                              {insight.action && (
                                <div className="space-y-2">
                                  <h4 className="text-sm font-medium">Recommended Action:</h4>
                                  <p className="text-sm text-muted-foreground">{insight.action}</p>
                                </div>
                              )}
                              <div className="flex items-center space-x-2">
                                <Badge variant="secondary" className="text-xs">
                                  Confidence: {insight.confidence}%
                                </Badge>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                      <p className="text-xs text-muted-foreground">{insight.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}