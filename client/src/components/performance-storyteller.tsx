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
  BookOpen, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle,
  Target,
  Clock,
  Zap,
  Share2,
  Download,
  RefreshCw,
  BarChart3,
  DollarSign,
  Activity,
  Trophy,
  Eye
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { TickerWithPosition, PortfolioSummary } from "@shared/schema";

interface PerformanceStorytellerProps {
  tickers: TickerWithPosition[];
  summary: PortfolioSummary;
  className?: string;
}

interface StoryChapter {
  id: string;
  title: string;
  content: string;
  sentiment: 'positive' | 'negative' | 'neutral' | 'warning';
  icon: React.ReactNode;
  metrics?: {
    key: string;
    value: string;
    trend?: 'up' | 'down' | 'neutral';
  }[];
  actionable?: string[];
}

interface PerformanceStory {
  title: string;
  subtitle: string;
  overallSentiment: 'bullish' | 'bearish' | 'mixed' | 'neutral';
  score: number; // 0-100
  chapters: StoryChapter[];
  keyInsights: string[];
  recommendations: string[];
  generatedAt: Date;
}

export function PerformanceStoryTeller({ tickers, summary, className }: PerformanceStorytellerProps) {
  const [story, setStory] = useState<PerformanceStory | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();

  // Auto-generate story when component mounts
  useEffect(() => {
    if (tickers.length > 0) {
      generateStory();
    }
  }, [tickers, summary]);

  const generateStory = async () => {
    setIsGenerating(true);
    
    try {
      // Simulate AI processing time for better UX
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const newStory = await analyzePerformanceAndGenerateStory();
      setStory(newStory);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to generate performance story. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const analyzePerformanceAndGenerateStory = async (): Promise<PerformanceStory> => {
    const now = new Date();
    
    // Calculate portfolio metrics
    const portfolioMetrics = calculatePortfolioMetrics();
    const riskAssessment = assessPortfolioRisk();
    const marketConditions = analyzeMarketConditions();
    const performanceScore = calculateOverallScore();
    
    // Generate story chapters
    const chapters = generateStoryChapters(portfolioMetrics, riskAssessment, marketConditions);
    
    // Determine overall sentiment
    const overallSentiment = determineOverallSentiment(performanceScore);
    
    return {
      title: generateStoryTitle(overallSentiment, performanceScore),
      subtitle: generateStorySubtitle(portfolioMetrics),
      overallSentiment,
      score: performanceScore,
      chapters,
      keyInsights: generateKeyInsights(portfolioMetrics, riskAssessment),
      recommendations: generateRecommendations(riskAssessment, marketConditions),
      generatedAt: now,
    };
  };

  const calculatePortfolioMetrics = () => {
    const totalInvested = summary.totalPremiumPaid;
    const avgIV = summary.avgImpliedVolatility;
    const positions = tickers.length;
    
    // Calculate P&L and breakeven analysis for each ticker
    const breakevenAnalysis = tickers.map(ticker => {
      const { currentPrice, position } = ticker;
      const lowerDistance = ((currentPrice - position.lowerBreakeven) / currentPrice) * 100;
      const upperDistance = ((position.upperBreakeven - currentPrice) / currentPrice) * 100;
      const inProfitZone = currentPrice < position.lowerBreakeven || currentPrice > position.upperBreakeven;
      
      // Calculate current P&L for this position
      const premiumPaid = position.longPutPremium + position.longCallPremium;
      let currentPnL = 0;
      
      if (position.strategyType === 'long_strangle') {
        // Long strangle P&L calculation
        const putValue = Math.max(0, position.longPutStrike - currentPrice);
        const callValue = Math.max(0, currentPrice - position.longCallStrike);
        const totalValue = putValue + callValue;
        currentPnL = (totalValue - premiumPaid) * 100; // Convert to dollars
      }
      
      const pnlPercent = premiumPaid > 0 ? (currentPnL / (premiumPaid * 100)) * 100 : 0;
      
      return {
        symbol: ticker.symbol,
        currentPrice,
        lowerDistance,
        upperDistance,
        inProfitZone,
        daysToExpiry: position.daysToExpiry,
        maxLoss: position.maxLoss,
        premiumPaid: premiumPaid * 100, // Convert to dollars
        currentPnL,
        pnlPercent,
        isProfit: currentPnL > 0,
      };
    });
    
    const profitablePositions = breakevenAnalysis.filter(p => p.inProfitZone).length;
    const nearExpiry = breakevenAnalysis.filter(p => p.daysToExpiry < 30).length;
    const highRisk = breakevenAnalysis.filter(p => p.daysToExpiry < 14).length;
    
    return {
      totalInvested,
      avgIV,
      positions,
      profitablePositions,
      nearExpiry,
      highRisk,
      breakevenAnalysis,
      profitabilityRate: (profitablePositions / positions) * 100,
    };
  };

  const assessPortfolioRisk = () => {
    const totalMaxLoss = tickers.reduce((sum, ticker) => sum + ticker.position.maxLoss, 0);
    const avgDaysToExpiry = tickers.reduce((sum, ticker) => sum + ticker.position.daysToExpiry, 0) / tickers.length;
    const highIVPositions = tickers.filter(ticker => ticker.position.ivPercentile > 70).length;
    
    let riskLevel: 'Low' | 'Medium' | 'High' | 'Extreme';
    if (avgDaysToExpiry < 14 || highIVPositions / tickers.length > 0.7) {
      riskLevel = 'High';
    } else if (avgDaysToExpiry < 30 || highIVPositions / tickers.length > 0.5) {
      riskLevel = 'Medium';
    } else {
      riskLevel = 'Low';
    }
    
    return {
      totalMaxLoss,
      avgDaysToExpiry,
      highIVPositions,
      riskLevel,
      riskScore: Math.min(100, (highIVPositions / tickers.length) * 100 + (30 - avgDaysToExpiry) * 2),
    };
  };

  const analyzeMarketConditions = () => {
    const avgIVPercentile = tickers.reduce((sum, ticker) => sum + ticker.position.ivPercentile, 0) / tickers.length;
    
    let volatilityEnvironment: 'Low' | 'Normal' | 'High';
    if (avgIVPercentile > 70) volatilityEnvironment = 'High';
    else if (avgIVPercentile > 30) volatilityEnvironment = 'Normal';
    else volatilityEnvironment = 'Low';
    
    return {
      avgIVPercentile,
      volatilityEnvironment,
      marketSentiment: volatilityEnvironment === 'High' ? 'Cautious' : 'Optimistic',
    };
  };

  const calculateOverallScore = (): number => {
    const metrics = calculatePortfolioMetrics();
    const risk = assessPortfolioRisk();
    
    // Score based on profitability (40%), risk management (30%), diversification (30%)
    const profitabilityScore = metrics.profitabilityRate;
    const riskScore = Math.max(0, 100 - risk.riskScore);
    const diversificationScore = Math.min(100, (metrics.positions / 3) * 50); // Bonus for having multiple positions
    
    return Math.round(profitabilityScore * 0.4 + riskScore * 0.3 + diversificationScore * 0.3);
  };

  const determineOverallSentiment = (score: number): 'bullish' | 'bearish' | 'mixed' | 'neutral' => {
    if (score >= 75) return 'bullish';
    if (score <= 25) return 'bearish';
    if (score >= 45 && score <= 55) return 'neutral';
    return 'mixed';
  };

  const generateStoryTitle = (sentiment: string, score: number): string => {
    const titles = {
      bullish: [
        "🚀 Your Strangle Strategy is Soaring",
        "💪 Portfolio Performance: Strong and Steady",
        "⭐ Winning Streak: Strategy Execution Excellence",
      ],
      bearish: [
        "📉 Strategy Under Pressure: Time for Adjustments",
        "⚠️ Portfolio Alert: Risk Management Focus Needed",
        "🎯 Recalibration Required: Strategy Review Time",
      ],
      mixed: [
        "⚖️ Mixed Signals: Portfolio in Transition",
        "🔄 Strategy Evolution: Adapting to Market Conditions",
        "📊 Performance Update: Balancing Risk and Reward",
      ],
      neutral: [
        "📈 Steady Course: Portfolio Status Update",
        "🎯 On Track: Strategy Performance Review",
        "📋 Portfolio Checkpoint: Current Status Analysis",
      ],
    };
    
    const titleOptions = titles[sentiment as keyof typeof titles];
    return titleOptions[Math.floor(Math.random() * titleOptions.length)];
  };

  const generateStorySubtitle = (metrics: any): string => {
    return `Analyzing ${metrics.positions} position${metrics.positions !== 1 ? 's' : ''} with $${metrics.totalInvested.toLocaleString()} at risk`;
  };

  const generateStoryChapters = (metrics: any, risk: any, market: any): StoryChapter[] => {
    const chapters: StoryChapter[] = [];
    
    // Chapter 1: Portfolio Overview
    chapters.push({
      id: 'overview',
      title: 'Portfolio Snapshot',
      content: `Your long strangle portfolio consists of ${metrics.positions} active position${metrics.positions !== 1 ? 's' : ''} with a total investment of $${metrics.totalInvested.toLocaleString()}. Currently, ${metrics.profitablePositions} position${metrics.profitablePositions !== 1 ? 's are' : ' is'} positioned for profitability, representing a ${metrics.profitabilityRate.toFixed(1)}% success rate.`,
      sentiment: metrics.profitabilityRate >= 50 ? 'positive' : 'negative',
      icon: <BarChart3 className="w-5 h-5" />,
      metrics: [
        { key: 'Total Positions', value: metrics.positions.toString() },
        { key: 'Investment', value: `$${metrics.totalInvested.toLocaleString()}` },
        { key: 'Success Rate', value: `${metrics.profitabilityRate.toFixed(1)}%` },
      ],
    });
    
    // Chapter 2: Risk Assessment
    chapters.push({
      id: 'risk',
      title: 'Risk Profile',
      content: `Your portfolio carries a ${risk.riskLevel.toLowerCase()} risk profile with an average of ${risk.avgDaysToExpiry.toFixed(0)} days to expiration. ${risk.highIVPositions} position${risk.highIVPositions !== 1 ? 's are' : ' is'} in high volatility environments, which ${risk.highIVPositions > metrics.positions * 0.5 ? 'suggests increased market uncertainty' : 'indicates stable market conditions'}.`,
      sentiment: risk.riskLevel === 'Low' ? 'positive' : risk.riskLevel === 'High' ? 'warning' : 'neutral',
      icon: <AlertTriangle className="w-5 h-5" />,
      metrics: [
        { key: 'Risk Level', value: risk.riskLevel },
        { key: 'Avg Days to Expiry', value: risk.avgDaysToExpiry.toFixed(0) },
        { key: 'Max Loss', value: `$${risk.totalMaxLoss.toLocaleString()}` },
      ],
    });
    
    // Chapter 3: Market Conditions
    chapters.push({
      id: 'market',
      title: 'Market Environment',
      content: `The current volatility environment is ${market.volatilityEnvironment.toLowerCase()} with an average IV percentile of ${market.avgIVPercentile.toFixed(1)}%. This ${market.volatilityEnvironment === 'High' ? 'elevated volatility creates both opportunities and risks' : 'stable environment favors systematic strategy execution'}.`,
      sentiment: market.volatilityEnvironment === 'High' ? 'warning' : 'positive',
      icon: <Activity className="w-5 h-5" />,
      metrics: [
        { key: 'Volatility Environment', value: market.volatilityEnvironment },
        { key: 'Avg IV Percentile', value: `${market.avgIVPercentile.toFixed(1)}%` },
        { key: 'Market Sentiment', value: market.marketSentiment },
      ],
    });
    
    // Chapter 4: Individual Position P&L Analysis
    const totalPnL = metrics.breakevenAnalysis.reduce((sum: number, pos: any) => sum + pos.currentPnL, 0);
    const profitableCount = metrics.breakevenAnalysis.filter((pos: any) => pos.isProfit).length;
    
    chapters.push({
      id: 'pnl',
      title: 'Position P&L Breakdown',
      content: `Current portfolio P&L stands at ${totalPnL >= 0 ? '+' : ''}$${totalPnL.toFixed(2)} across all positions. ${profitableCount} of ${metrics.positions} positions are currently profitable. ${metrics.breakevenAnalysis.map((pos: any) => `${pos.symbol}: ${pos.currentPnL >= 0 ? '+' : ''}$${pos.currentPnL.toFixed(2)} (${pos.pnlPercent >= 0 ? '+' : ''}${pos.pnlPercent.toFixed(1)}%)`).join(', ')}.`,
      sentiment: totalPnL >= 0 ? 'positive' : 'negative',
      icon: <DollarSign className="w-5 h-5" />,
      metrics: metrics.breakevenAnalysis.map((pos: any) => ({
        key: pos.symbol,
        value: `${pos.currentPnL >= 0 ? '+' : ''}$${pos.currentPnL.toFixed(2)}`,
        trend: pos.isProfit ? 'up' : 'down'
      })),
    });

    // Chapter 5: Time Decay Analysis
    if (metrics.nearExpiry > 0) {
      chapters.push({
        id: 'time',
        title: 'Time Decay Focus',
        content: `${metrics.nearExpiry} position${metrics.nearExpiry !== 1 ? 's are' : ' is'} approaching expiration within 30 days, requiring close monitoring. Time decay is accelerating, making precise exit timing critical for optimal outcomes.`,
        sentiment: metrics.nearExpiry > metrics.positions * 0.5 ? 'warning' : 'neutral',
        icon: <Clock className="w-5 h-5" />,
        actionable: [
          'Monitor positions daily as expiration approaches',
          'Consider early exit if profit targets are met',
          'Prepare adjustment strategies for challenged positions',
        ],
      });
    }
    
    return chapters;
  };

  const generateKeyInsights = (metrics: any, risk: any): string[] => {
    const insights: string[] = [];
    
    if (metrics.profitabilityRate >= 70) {
      insights.push("Strong position selection with majority of trades in profitable zones");
    } else if (metrics.profitabilityRate <= 30) {
      insights.push("Portfolio may benefit from improved entry timing or strike selection");
    }
    
    if (risk.avgDaysToExpiry < 21) {
      insights.push("Portfolio has concentrated near-term exposure requiring active management");
    }
    
    if (risk.highIVPositions / metrics.positions > 0.6) {
      insights.push("High concentration in elevated volatility environments increases portfolio sensitivity");
    }
    
    if (metrics.positions >= 5) {
      insights.push("Well-diversified portfolio provides natural risk distribution");
    }
    
    return insights;
  };

  const generateRecommendations = (risk: any, market: any): string[] => {
    const recommendations: string[] = [];
    
    if (risk.riskLevel === 'High') {
      recommendations.push("Consider reducing position sizes or extending expiration dates");
      recommendations.push("Implement systematic profit-taking rules");
    }
    
    if (market.volatilityEnvironment === 'High') {
      recommendations.push("Monitor positions more frequently during volatile periods");
      recommendations.push("Consider defensive adjustments if volatility persists");
    }
    
    if (risk.avgDaysToExpiry < 30) {
      recommendations.push("Plan for position renewals or extensions");
      recommendations.push("Establish clear exit criteria before expiration pressure mounts");
    }
    
    recommendations.push("Maintain consistent position sizing across trades");
    recommendations.push("Continue tracking IV percentiles for optimal entry timing");
    
    return recommendations;
  };

  const handleShareStory = () => {
    if (!story) return;
    
    const shareText = `My trading strategy performance: ${story.title} - Score: ${story.score}/100`;
    
    if (navigator.share) {
      navigator.share({
        title: 'Strategy Performance Story',
        text: shareText,
      });
    } else {
      navigator.clipboard.writeText(shareText);
      toast({
        title: "Copied to clipboard",
        description: "Story summary copied to clipboard!",
      });
    }
  };

  const handleExportStory = () => {
    if (!story) return;
    
    const exportData = {
      ...story,
      exportedAt: new Date().toISOString(),
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `performance-story-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Story Exported",
      description: "Performance story exported successfully!",
    });
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'bullish': return 'text-green-600';
      case 'bearish': return 'text-red-600';
      case 'mixed': return 'text-yellow-600';
      default: return 'text-blue-600';
    }
  };

  const getSentimentBadgeColor = (sentiment: string) => {
    switch (sentiment) {
      case 'positive': return 'bg-green-100 text-green-800';
      case 'negative': return 'bg-red-100 text-red-800';
      case 'warning': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-blue-100 text-blue-800';
    }
  };

  if (tickers.length === 0) {
    return (
      <Card className={`p-6 text-center ${className}`}>
        <BookOpen className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-lg font-semibold mb-2">No Story to Tell Yet</h3>
        <p className="text-muted-foreground">
          Add some positions to your portfolio to generate your performance story.
        </p>
      </Card>
    );
  }

  return (
    <div className={className}>
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <BookOpen className="w-6 h-6 text-primary" />
            <div>
              <h3 className="text-lg font-semibold">Performance Story</h3>
              <p className="text-sm text-muted-foreground">
                AI-powered strategy analysis
              </p>
            </div>
          </div>
          <div className="flex space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={generateStory}
              disabled={isGenerating}
              data-testid="button-regenerate-story"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isGenerating ? 'animate-spin' : ''}`} />
              {isGenerating ? 'Generating...' : 'Refresh'}
            </Button>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button 
                  size="sm" 
                  disabled={!story || isGenerating}
                  data-testid="button-view-full-story"
                >
                  <Eye className="w-4 h-4 mr-2" />
                  View Full Story
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center space-x-2">
                    <Trophy className="w-5 h-5" />
                    <span>Strategy Performance Story</span>
                  </DialogTitle>
                  <DialogDescription>
                    Comprehensive analysis of your trading strategy performance
                  </DialogDescription>
                </DialogHeader>
                
                {story && (
                  <div className="space-y-6">
                    {/* Story Header */}
                    <div className="text-center border-b pb-6">
                      <h2 className={`text-2xl font-bold mb-2 ${getSentimentColor(story.overallSentiment)}`}>
                        {story.title}
                      </h2>
                      <p className="text-muted-foreground mb-4">{story.subtitle}</p>
                      <div className="flex items-center justify-center space-x-4">
                        <Badge className={getSentimentBadgeColor(story.overallSentiment)}>
                          {story.overallSentiment.toUpperCase()}
                        </Badge>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium">Performance Score:</span>
                          <div className="flex items-center space-x-2">
                            <Progress value={story.score} className="w-20" />
                            <span className="text-lg font-bold">{story.score}/100</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Story Chapters */}
                    <div className="space-y-6">
                      {story.chapters.map((chapter) => (
                        <Card key={chapter.id} className="p-6">
                          <div className="flex items-start space-x-4">
                            <div className={`p-2 rounded-full ${getSentimentBadgeColor(chapter.sentiment)}`}>
                              {chapter.icon}
                            </div>
                            <div className="flex-1">
                              <h3 className="text-lg font-semibold mb-2">{chapter.title}</h3>
                              <p className="text-muted-foreground mb-4 leading-relaxed">
                                {chapter.content}
                              </p>
                              
                              {chapter.metrics && (
                                <div className="grid grid-cols-3 gap-4 mb-4">
                                  {chapter.metrics.map((metric, index) => (
                                    <div key={index} className="text-center p-3 bg-muted rounded-lg">
                                      <div className="text-sm text-muted-foreground">{metric.key}</div>
                                      <div className="text-lg font-semibold">{metric.value}</div>
                                    </div>
                                  ))}
                                </div>
                              )}
                              
                              {chapter.actionable && (
                                <div className="mt-4">
                                  <h4 className="text-sm font-medium mb-2">Action Items:</h4>
                                  <ul className="text-sm text-muted-foreground space-y-1">
                                    {chapter.actionable.map((action, index) => (
                                      <li key={index} className="flex items-start space-x-2">
                                        <Target className="w-3 h-3 mt-1 text-primary" />
                                        <span>{action}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                    
                    {/* Key Insights */}
                    <Card className="p-6">
                      <h3 className="text-lg font-semibold mb-4 flex items-center space-x-2">
                        <Zap className="w-5 h-5 text-yellow-500" />
                        <span>Key Insights</span>
                      </h3>
                      <ul className="space-y-2">
                        {story.keyInsights.map((insight, index) => (
                          <li key={index} className="flex items-start space-x-3">
                            <div className="w-2 h-2 bg-yellow-500 rounded-full mt-2" />
                            <span className="text-muted-foreground">{insight}</span>
                          </li>
                        ))}
                      </ul>
                    </Card>
                    
                    {/* Recommendations */}
                    <Card className="p-6">
                      <h3 className="text-lg font-semibold mb-4 flex items-center space-x-2">
                        <Target className="w-5 h-5 text-blue-500" />
                        <span>Recommendations</span>
                      </h3>
                      <ul className="space-y-2">
                        {story.recommendations.map((rec, index) => (
                          <li key={index} className="flex items-start space-x-3">
                            <div className="w-2 h-2 bg-blue-500 rounded-full mt-2" />
                            <span className="text-muted-foreground">{rec}</span>
                          </li>
                        ))}
                      </ul>
                    </Card>
                    
                    {/* Action Buttons */}
                    <div className="flex justify-center space-x-4 pt-6 border-t">
                      <Button variant="outline" onClick={handleShareStory} data-testid="button-share-story">
                        <Share2 className="w-4 h-4 mr-2" />
                        Share Story
                      </Button>
                      <Button variant="outline" onClick={handleExportStory} data-testid="button-export-story">
                        <Download className="w-4 h-4 mr-2" />
                        Export Story
                      </Button>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </div>
        </div>
        
        {/* Story Preview */}
        {isGenerating ? (
          <div className="text-center py-8">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Analyzing your strategy performance...</p>
          </div>
        ) : story ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className={`font-semibold ${getSentimentColor(story.overallSentiment)}`}>
                {story.title}
              </h4>
              <div className="flex items-center space-x-2">
                <Progress value={story.score} className="w-16" />
                <span className="text-sm font-medium">{story.score}/100</span>
              </div>
            </div>
            
            <p className="text-sm text-muted-foreground">
              {story.subtitle}
            </p>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-3 bg-muted rounded-lg">
                <div className="text-sm text-muted-foreground">Chapters</div>
                <div className="text-lg font-semibold">{story.chapters.length}</div>
              </div>
              <div className="text-center p-3 bg-muted rounded-lg">
                <div className="text-sm text-muted-foreground">Insights</div>
                <div className="text-lg font-semibold">{story.keyInsights.length}</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <BookOpen className="w-8 h-8 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Click "View Full Story" to see your analysis</p>
          </div>
        )}
      </Card>
    </div>
  );
}