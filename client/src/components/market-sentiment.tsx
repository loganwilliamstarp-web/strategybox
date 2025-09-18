import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { 
  TrendingUp, 
  TrendingDown, 
  Brain,
  BarChart3,
  Activity,
  AlertCircle,
  Target,
  Clock,
  DollarSign,
  Zap,
  RefreshCw,
  Eye,
  MessageSquare
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { TickerWithPosition } from "@shared/schema";

interface MarketSentiment {
  overall: 'bullish' | 'bearish' | 'neutral';
  score: number; // -100 to 100
  vixLevel: number;
  vixInterpretation: 'low' | 'normal' | 'elevated' | 'high';
  marketTrend: 'uptrend' | 'downtrend' | 'sideways';
  volatilityEnvironment: 'low' | 'normal' | 'high';
  optionsFlow: 'bullish' | 'bearish' | 'neutral';
  sectors: {
    name: string;
    sentiment: 'bullish' | 'bearish' | 'neutral';
    score: number;
  }[];
}

interface AIInsight {
  id: string;
  type: 'market_outlook' | 'portfolio_specific' | 'opportunity' | 'risk_warning';
  priority: 'high' | 'medium' | 'low';
  title: string;
  insight: string;
  reasoning: string[];
  actionable: string[];
  confidence: number; // 0-100
  relevantTickers?: string[];
  timestamp: Date;
}

interface PortfolioRisk {
  score: number; // 0-100
  level: 'Low' | 'Medium' | 'High' | 'Extreme';
  avgIV: number;
  avgIVPercentile: number;
  color: string;
}

interface MarketSentimentProps {
  tickers: TickerWithPosition[];
  className?: string;
}

// Calculate portfolio risk metrics
const calculatePortfolioRisk = (tickers: TickerWithPosition[]): PortfolioRisk => {
  if (tickers.length === 0) {
    return {
      score: 0,
      level: 'Low',
      avgIV: 0,
      avgIVPercentile: 0,
      color: 'text-green-600'
    };
  }

  // Calculate average IV and IV percentile
  const avgIV = tickers.reduce((sum, ticker) => sum + (ticker.position?.impliedVolatility || 20), 0) / tickers.length;
  const avgIVPercentile = tickers.reduce((sum, ticker) => sum + (ticker.position?.ivPercentile || 50), 0) / tickers.length;
  
  // Base risk score on IV percentile, concentration, and time decay
  let riskScore = 0;
  
  // IV percentile factor (0-40 points)
  riskScore += Math.min(40, avgIVPercentile * 0.4);
  
  // Concentration risk (0-30 points)
  const concentrationRisk = Math.min(30, (1 / tickers.length) * 100);
  riskScore += concentrationRisk;
  
  // Time decay risk (0-30 points)
  const avgDaysToExpiry = tickers.reduce((sum, ticker) => {
    const expiry = new Date(ticker.position?.expirationDate || Date.now());
    const days = Math.max(0, (expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return sum + days;
  }, 0) / tickers.length;
  
  const timeDecayRisk = Math.max(0, 30 - (avgDaysToExpiry * 0.5));
  riskScore += timeDecayRisk;
  
  // Cap at 100
  riskScore = Math.min(100, riskScore);
  
  let level: PortfolioRisk['level'];
  let color: string;
  
  if (riskScore < 25) {
    level = 'Low';
    color = 'text-green-600';
  } else if (riskScore < 50) {
    level = 'Medium';
    color = 'text-yellow-600';
  } else if (riskScore < 75) {
    level = 'High';
    color = 'text-orange-600';
  } else {
    level = 'Extreme';
    color = 'text-red-600';
  }
  
  return {
    score: Math.round(riskScore),
    level,
    avgIV: avgIV,
    avgIVPercentile: avgIVPercentile,
    color
  };
};

// Generate realistic market sentiment data
const generateMarketSentiment = (): MarketSentiment => {
  const vixLevel = 15 + Math.random() * 30; // 15-45 range
  const sentimentScore = -40 + Math.random() * 80; // -40 to 40 range
  
  let vixInterpretation: 'low' | 'normal' | 'elevated' | 'high';
  if (vixLevel < 20) vixInterpretation = 'low';
  else if (vixLevel < 25) vixInterpretation = 'normal';
  else if (vixLevel < 35) vixInterpretation = 'elevated';
  else vixInterpretation = 'high';

  const overall = sentimentScore > 20 ? 'bullish' : sentimentScore < -20 ? 'bearish' : 'neutral';
  
  const sectors = [
    { name: 'Technology', sentiment: Math.random() > 0.4 ? 'bullish' : 'neutral', score: -20 + Math.random() * 60 },
    { name: 'Healthcare', sentiment: Math.random() > 0.6 ? 'bullish' : 'neutral', score: -10 + Math.random() * 40 },
    { name: 'Finance', sentiment: Math.random() > 0.5 ? 'bearish' : 'neutral', score: -30 + Math.random() * 50 },
    { name: 'Energy', sentiment: Math.random() > 0.3 ? 'bullish' : 'bearish', score: -40 + Math.random() * 70 },
    { name: 'Consumer', sentiment: Math.random() > 0.5 ? 'neutral' : 'bearish', score: -25 + Math.random() * 45 }
  ].map(sector => ({
    ...sector,
    sentiment: sector.score > 15 ? 'bullish' : sector.score < -15 ? 'bearish' : 'neutral'
  })) as MarketSentiment['sectors'];

  return {
    overall,
    score: Math.round(sentimentScore),
    vixLevel: Math.round(vixLevel * 10) / 10,
    vixInterpretation,
    marketTrend: sentimentScore > 10 ? 'uptrend' : sentimentScore < -10 ? 'downtrend' : 'sideways',
    volatilityEnvironment: vixLevel > 25 ? 'high' : vixLevel < 18 ? 'low' : 'normal',
    optionsFlow: Math.random() > 0.5 ? 'bullish' : Math.random() > 0.3 ? 'neutral' : 'bearish',
    sectors
  };
};

// Generate AI-driven insights based on portfolio and market data
const generateAIInsights = (tickers: TickerWithPosition[], sentiment: MarketSentiment): AIInsight[] => {
  const insights: AIInsight[] = [];
  
  // Market outlook insight
  insights.push({
    id: 'market-outlook',
    type: 'market_outlook',
    priority: 'high',
    title: `${sentiment.overall.charAt(0).toUpperCase() + sentiment.overall.slice(1)} Market Environment`,
    insight: `Current market sentiment is ${sentiment.overall} with a VIX level of ${sentiment.vixLevel}, indicating ${sentiment.vixInterpretation} volatility. The ${sentiment.volatilityEnvironment} volatility environment ${sentiment.volatilityEnvironment === 'high' ? 'favors long options strategies' : sentiment.volatilityEnvironment === 'low' ? 'may compress option premiums' : 'provides balanced opportunities'}.`,
    reasoning: [
      `VIX at ${sentiment.vixLevel} suggests ${sentiment.vixInterpretation} fear levels`,
      `Market trend appears ${sentiment.marketTrend}`,
      `Options flow is ${sentiment.optionsFlow}`,
      `${sentiment.volatilityEnvironment.charAt(0).toUpperCase() + sentiment.volatilityEnvironment.slice(1)} volatility environment detected`
    ],
    actionable: sentiment.volatilityEnvironment === 'high' 
      ? ['Consider opening new long strangle positions', 'Take profits on existing positions if profitable', 'Monitor for volatility contraction']
      : sentiment.volatilityEnvironment === 'low'
      ? ['Avoid opening expensive long positions', 'Wait for volatility expansion', 'Consider closing unprofitable positions']
      : ['Balanced approach to new positions', 'Monitor volatility changes', 'Maintain current strategy'],
    confidence: 85,
    timestamp: new Date()
  });

  if (tickers.length > 0) {
    // Portfolio-specific insights
    const avgIV = tickers.reduce((sum, t) => sum + t.position.impliedVolatility, 0) / tickers.length;
    const highIVPositions = tickers.filter(t => t.position.ivPercentile > 70);
    const nearExpiryPositions = tickers.filter(t => t.position.daysToExpiry <= 14);
    const profitablePositions = tickers.filter(t => {
      const isOutsideRange = t.currentPrice < t.position.lowerBreakeven || t.currentPrice > t.position.upperBreakeven;
      return isOutsideRange;
    });

    insights.push({
      id: 'portfolio-analysis',
      type: 'portfolio_specific',
      priority: 'high',
      title: 'Portfolio Volatility Analysis',
      insight: `Your portfolio's average IV of ${avgIV.toFixed(1)}% is ${avgIV > sentiment.vixLevel ? 'above' : avgIV < sentiment.vixLevel * 0.8 ? 'below' : 'aligned with'} current market volatility. ${highIVPositions.length > 0 ? `${highIVPositions.length} position(s) have elevated IV percentiles.` : 'No positions show extremely elevated IV levels.'}`,
      reasoning: [
        `Portfolio avg IV: ${avgIV.toFixed(1)}% vs Market VIX: ${sentiment.vixLevel}%`,
        `${highIVPositions.length} positions above 70th IV percentile`,
        `${nearExpiryPositions.length} positions expiring within 2 weeks`,
        `${profitablePositions.length} positions currently profitable`
      ],
      actionable: [
        highIVPositions.length > 2 ? 'Consider taking profits on high IV positions' : 'Monitor IV percentiles for profit opportunities',
        nearExpiryPositions.length > 0 ? 'Review near-expiry positions for management' : 'No immediate expiry concerns',
        profitablePositions.length > 0 ? 'Evaluate profit-taking on winning positions' : 'Monitor for breakthrough moves'
      ],
      confidence: 92,
      relevantTickers: [...highIVPositions.map(t => t.symbol), ...nearExpiryPositions.map(t => t.symbol)],
      timestamp: new Date()
    });

    // Sector-specific insights
    const userSectorSet = new Set(tickers.map(t => {
      // Map symbols to sectors (simplified)
      if (['AAPL', 'MSFT', 'GOOGL', 'META', 'NVDA', 'AMD', 'NFLX', 'QQQ'].includes(t.symbol)) return 'Technology';
      if (['JPM', 'SPY'].includes(t.symbol)) return 'Finance';
      if (['JNJ'].includes(t.symbol)) return 'Healthcare';
      if (['TSLA', 'DIS', 'AMZN'].includes(t.symbol)) return 'Consumer';
      return 'Other';
    }));
    const userSectors = Array.from(userSectorSet);

    userSectors.forEach(sector => {
      const sectorSentiment = sentiment.sectors.find(s => s.name === sector);
      if (sectorSentiment) {
        const userSectorTickers = tickers.filter(t => {
          if (sector === 'Technology') return ['AAPL', 'MSFT', 'GOOGL', 'META', 'NVDA', 'AMD', 'NFLX', 'QQQ'].includes(t.symbol);
          if (sector === 'Finance') return ['JPM', 'SPY'].includes(t.symbol);
          if (sector === 'Healthcare') return ['JNJ'].includes(t.symbol);
          if (sector === 'Consumer') return ['TSLA', 'DIS', 'AMZN'].includes(t.symbol);
          return false;
        });

        if (userSectorTickers.length > 0) {
          insights.push({
            id: `sector-${sector.toLowerCase()}`,
            type: 'opportunity',
            priority: Math.abs(sectorSentiment.score) > 20 ? 'high' : 'medium',
            title: `${sector} Sector Outlook`,
            insight: `${sector} sector sentiment is ${sectorSentiment.sentiment} (score: ${sectorSentiment.score}). You have ${userSectorTickers.length} position(s) in this sector: ${userSectorTickers.map(t => t.symbol).join(', ')}.`,
            reasoning: [
              `${sector} sentiment score: ${sectorSentiment.score}`,
              `Sector trend: ${sectorSentiment.sentiment}`,
              `Your exposure: ${userSectorTickers.length} positions`,
              `Market correlation impact expected`
            ],
            actionable: sectorSentiment.sentiment === 'bullish' 
              ? ['Consider adding exposure if sentiment continues', 'Monitor for breakout moves', 'Take partial profits if very profitable']
              : sectorSentiment.sentiment === 'bearish'
              ? ['Consider reducing exposure or hedging', 'Look for oversold opportunities', 'Tighten stop levels']
              : ['Monitor sector rotation signals', 'Maintain current positions', 'Watch for directional bias'],
            confidence: 78,
            relevantTickers: userSectorTickers.map(t => t.symbol),
            timestamp: new Date()
          });
        }
      }
    });

    // Risk warning if needed
    if (sentiment.volatilityEnvironment === 'high' && sentiment.overall === 'bearish') {
      insights.push({
        id: 'high-risk-environment',
        type: 'risk_warning',
        priority: 'high',
        title: 'Elevated Risk Environment',
        insight: `High volatility bearish environment detected. VIX at ${sentiment.vixLevel} with negative sentiment suggests increased market stress. Your long strangle positions may experience whipsaw moves.`,
        reasoning: [
          'High VIX indicates market stress',
          'Bearish sentiment may persist',
          'Increased probability of gap moves',
          'Time decay risk elevated in high vol'
        ],
        actionable: [
          'Consider taking profits on any profitable positions',
          'Reduce position sizes for new trades',
          'Monitor positions more frequently',
          'Have exit plans ready for adverse moves'
        ],
        confidence: 88,
        timestamp: new Date()
      });
    }
  }

  return insights.slice(0, 4); // Limit to most important insights
};

export function MarketSentiment({ tickers, className }: MarketSentimentProps) {
  const [sentiment, setSentiment] = useState<MarketSentiment | null>(null);
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [selectedInsight, setSelectedInsight] = useState<AIInsight | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const portfolioRisk = calculatePortfolioRisk(tickers);

  const refreshData = async () => {
    setIsRefreshing(true);
    try {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const newSentiment = generateMarketSentiment();
      const newInsights = generateAIInsights(tickers, newSentiment);
      
      setSentiment(newSentiment);
      setInsights(newInsights);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Initial load and refresh when tickers change
  useEffect(() => {
    refreshData();
  }, [tickers.length]);

  const getSentimentColor = (sent: 'bullish' | 'bearish' | 'neutral') => {
    switch (sent) {
      case 'bullish': return 'text-green-600 bg-green-50 border-green-200';
      case 'bearish': return 'text-red-600 bg-red-50 border-red-200';
      case 'neutral': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    }
  };

  const getInsightIcon = (type: AIInsight['type']) => {
    switch (type) {
      case 'market_outlook': return BarChart3;
      case 'portfolio_specific': return Target;
      case 'opportunity': return TrendingUp;
      case 'risk_warning': return AlertCircle;
    }
  };

  const getInsightColor = (type: AIInsight['type'], priority: AIInsight['priority']) => {
    if (priority === 'high') {
      return type === 'risk_warning' ? 'border-red-300 bg-red-50' : 'border-blue-300 bg-blue-50';
    }
    return 'border-gray-300 bg-gray-50';
  };

  if (!sentiment) {
    return (
      <Card className={`p-6 ${className}`} data-testid="market-sentiment-loading">
        <div className="flex items-center justify-center">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground mr-2" />
          <span className="text-muted-foreground">Loading market sentiment...</span>
        </div>
      </Card>
    );
  }

  return (
    <div className={className}>
      <Card className="p-6" data-testid="market-sentiment-card">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Brain className="h-5 w-5" />
              Market Sentiment & AI Insights
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Real-time market analysis with personalized portfolio insights
            </p>
          </div>
          
          <Button
            variant="outline"
            size="sm"
            onClick={refreshData}
            disabled={isRefreshing}
            data-testid="button-refresh-sentiment"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Market Overview & Portfolio Risk */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          <Card className="p-3 h-20">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Overall Sentiment</span>
              <Badge className={`text-xs ${getSentimentColor(sentiment.overall)}`}>
                {sentiment.overall.toUpperCase()}
              </Badge>
            </div>
            <div className="flex items-center gap-2 mt-2">
              {sentiment.overall === 'bullish' ? (
                <TrendingUp className="h-4 w-4 text-green-600" />
              ) : sentiment.overall === 'bearish' ? (
                <TrendingDown className="h-4 w-4 text-red-600" />
              ) : (
                <Activity className="h-4 w-4 text-yellow-600" />
              )}
              <span className="font-semibold">{sentiment.score > 0 ? '+' : ''}{sentiment.score.toFixed(2)}</span>
            </div>
          </Card>

          <Card className="p-3 h-20">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">VIX Level</span>
              <Badge variant="outline" className="text-xs">
                {sentiment.vixInterpretation.toUpperCase()}
              </Badge>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Zap className="h-4 w-4 text-orange-500" />
              <span className="font-semibold">{sentiment.vixLevel.toFixed(2)}%</span>
            </div>
          </Card>

          <Card className="p-3 h-20">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Volatility Env</span>
              <Badge variant="outline" className="text-xs">
                {sentiment.volatilityEnvironment.toUpperCase()}
              </Badge>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <BarChart3 className="h-4 w-4 text-blue-500" />
              <span className="font-semibold capitalize">{sentiment.volatilityEnvironment}</span>
            </div>
          </Card>

          <Card className="p-3 h-20">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Portfolio Risk</span>
              <Badge variant="outline" className="text-xs">
                {portfolioRisk.level.toUpperCase()}
              </Badge>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <AlertCircle className={`h-4 w-4 ${portfolioRisk.color.replace('text-', 'text-')}`} />
              <span className={`font-semibold ${portfolioRisk.color}`}>{portfolioRisk.score}/100</span>
            </div>
          </Card>

          <Card className="p-3 h-20">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Avg IV Percentile</span>
              <Badge variant="outline" className="text-xs">
                {portfolioRisk.avgIVPercentile > 70 ? 'HIGH' : portfolioRisk.avgIVPercentile < 30 ? 'LOW' : 'NORMAL'}
              </Badge>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Target className="h-4 w-4 text-purple-500" />
              <span className="font-semibold">{portfolioRisk.avgIVPercentile.toFixed(2)}%</span>
            </div>
          </Card>

          <Card className="p-3 h-20">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Avg Implied Vol</span>
              <Badge variant="outline" className="text-xs">
                IV
              </Badge>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Activity className="h-4 w-4 text-indigo-500" />
              <span className="font-semibold">{portfolioRisk.avgIV}%</span>
            </div>
          </Card>
        </div>

        {/* Sector Sentiment */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-foreground mb-3">Sector Sentiment</h3>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {sentiment.sectors.map((sector) => (
              <div key={sector.name} className="text-center">
                <div className="text-xs text-muted-foreground mb-1">{sector.name}</div>
                <Badge className={`text-xs w-full ${getSentimentColor(sector.sentiment)}`}>
                  {sector.sentiment}
                </Badge>
                <div className="text-xs text-muted-foreground mt-1">
                  {sector.score > 0 ? '+' : ''}{sector.score}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* AI Insights */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-foreground">AI-Driven Insights</h3>
            <Badge variant="secondary" className="text-xs">
              {insights.length} insights
            </Badge>
          </div>

          <div className="space-y-3">
            {insights.map((insight) => {
              const IconComponent = getInsightIcon(insight.type);
              
              return (
                <Card 
                  key={insight.id} 
                  className={`p-4 cursor-pointer hover:shadow-md transition-shadow ${getInsightColor(insight.type, insight.priority)}`}
                  onClick={() => setSelectedInsight(insight)}
                  data-testid={`insight-${insight.id}`}
                >
                  <div className="flex items-start gap-3">
                    <IconComponent className="h-4 w-4 mt-1 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">{insight.title}</span>
                        <Badge variant="outline" className="text-xs">
                          {insight.confidence}% confidence
                        </Badge>
                        {insight.priority === 'high' && (
                          <Badge variant="destructive" className="text-xs">
                            HIGH
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">
                        {insight.insight}
                      </p>
                      {insight.relevantTickers && insight.relevantTickers.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {insight.relevantTickers.map((ticker, index) => (
                            <Badge key={`${insight.id}-${ticker}-${index}`} variant="outline" className="text-xs">
                              {ticker}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <Eye className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Insight Detail Modal */}
        <Dialog open={!!selectedInsight} onOpenChange={() => setSelectedInsight(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {selectedInsight && (() => {
                  const IconComponent = getInsightIcon(selectedInsight.type);
                  return <IconComponent className="h-5 w-5" />;
                })()}
                {selectedInsight?.title}
              </DialogTitle>
              <DialogDescription>
                AI Analysis • {selectedInsight?.confidence}% Confidence • {selectedInsight?.priority.toUpperCase()} Priority
              </DialogDescription>
            </DialogHeader>
            
            {selectedInsight && (
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium mb-2">Market Insight</h4>
                  <p className="text-sm text-muted-foreground">{selectedInsight.insight}</p>
                </div>

                <div>
                  <h4 className="text-sm font-medium mb-2">Analysis Reasoning</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {selectedInsight.reasoning.map((reason, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h4 className="text-sm font-medium mb-2">Recommended Actions</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {selectedInsight.actionable.map((action, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-green-600">→</span>
                        <span>{action}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {selectedInsight.relevantTickers && selectedInsight.relevantTickers.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">Relevant Positions</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedInsight.relevantTickers.map((ticker, index) => (
                        <Badge key={`${selectedInsight.id}-${ticker}-${index}`} variant="outline">
                          {ticker}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </Card>
    </div>
  );
}