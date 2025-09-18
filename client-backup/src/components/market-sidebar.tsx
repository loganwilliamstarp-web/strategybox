import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  DollarSign, 
  BarChart3, 
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Target
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

interface MarketInsight {
  id: string;
  title: string;
  value: string;
  change: number;
  changePercent: number;
  trend: 'up' | 'down' | 'neutral';
  category: 'index' | 'volatility' | 'sentiment' | 'portfolio';
}

interface PortfolioMetric {
  label: string;
  value: string;
  trend?: 'up' | 'down' | 'neutral';
  icon: React.ComponentType<any>;
}

interface PortfolioSummary {
  totalPremiumPaid?: number;
  activePositions?: number;
  avgDaysToExpiry?: number;
  totalPnL?: number;
  avgImpliedVolatility?: number;
}

export function MarketSidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const isMobile = useIsMobile();

  // Collapse sidebar on mobile by default
  useEffect(() => {
    if (isMobile) {
      setIsCollapsed(true);
    }
  }, [isMobile]);

  const { data: portfolioSummary } = useQuery<PortfolioSummary>({
    queryKey: ['/api/portfolio/summary'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const { data: marketData } = useQuery<MarketInsight[]>({
    queryKey: ['/api/market-insights'],
    refetchInterval: 60000, // Refresh every minute
  });

  // Use live market data from API
  const marketInsights: MarketInsight[] = marketData || [];

  const portfolioMetrics: PortfolioMetric[] = [
    {
      label: 'Total Premium',
      value: portfolioSummary ? `$${(portfolioSummary.totalPremiumPaid / 100).toLocaleString()}` : '$0',
      icon: DollarSign,
      trend: 'neutral'
    },
    {
      label: 'Active Positions',
      value: portfolioSummary?.activePositions?.toString() || '0',
      icon: Target,
      trend: 'neutral'
    },
    {
      label: 'Avg Days to Expiry',
      value: portfolioSummary?.avgDaysToExpiry?.toString() || '0',
      icon: Clock,
      trend: 'neutral'
    }
  ];

  const getTrendIcon = (trend: 'up' | 'down' | 'neutral') => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="h-3 w-3 text-green-500" />;
      case 'down':
        return <TrendingDown className="h-3 w-3 text-red-500" />;
      default:
        return <Activity className="h-3 w-3 text-gray-500" />;
    }
  };

  const getTrendColor = (trend: 'up' | 'down' | 'neutral') => {
    switch (trend) {
      case 'up':
        return 'text-green-600';
      case 'down':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  const sidebarWidth = isCollapsed ? 'w-16' : 'w-80';
  const sidebarWidthMobile = isCollapsed ? 'w-12' : 'w-72';

  return (
    <div 
      className={`
        fixed top-0 right-0 h-full bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 
        transition-all duration-300 z-40 shadow-lg
        ${isMobile ? sidebarWidthMobile : sidebarWidth}
      `}
      data-testid="market-sidebar"
    >
      {/* Toggle Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -left-8 top-4 h-8 w-8 rounded-l-md rounded-r-none bg-white dark:bg-gray-900 border border-r-0 border-gray-200 dark:border-gray-700"
        data-testid="button-toggle-sidebar"
      >
        {isCollapsed ? (
          <ChevronLeft className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </Button>

      {isCollapsed ? (
        // Collapsed view - just icons
        <div className="p-2 space-y-4 mt-16">
          <div className="flex flex-col items-center space-y-3">
            <BarChart3 className="h-5 w-5 text-blue-600" />
            <Activity className="h-5 w-5 text-green-600" />
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
            <DollarSign className="h-5 w-5 text-purple-600" />
          </div>
        </div>
      ) : (
        // Expanded view
        <ScrollArea className="h-full">
          <div className="p-4 space-y-4 mt-12">
            {/* Header */}
            <div className="text-center">
              <h3 className="font-semibold text-lg" data-testid="text-sidebar-title">
                Market Insights
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Real-time market data
              </p>
            </div>

            <Separator />

            {/* Market Insights */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Market Overview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {marketInsights.map((insight) => (
                  <div 
                    key={insight.id} 
                    className="flex items-center justify-between"
                    data-testid={`market-insight-${insight.id}`}
                  >
                    <div className="flex items-center gap-2">
                      {getTrendIcon(insight.trend)}
                      <span className="font-medium text-sm">{insight.title}</span>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-sm">{insight.value}</div>
                      {insight.changePercent !== 0 && (
                        <div className={`text-xs ${getTrendColor(insight.trend)}`}>
                          {insight.changePercent > 0 ? '+' : ''}{insight.changePercent.toFixed(2)}%
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Portfolio Metrics */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Portfolio Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {portfolioMetrics.map((metric, index) => (
                  <div 
                    key={index}
                    className="flex items-center justify-between"
                    data-testid={`portfolio-metric-${metric.label.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <div className="flex items-center gap-2">
                      <metric.icon className="h-3 w-3 text-gray-500" />
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {metric.label}
                      </span>
                    </div>
                    <span className="font-semibold text-sm">{metric.value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  Quick Actions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full justify-start"
                  data-testid="button-market-screener"
                >
                  <BarChart3 className="h-3 w-3 mr-2" />
                  Market Screener
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full justify-start"
                  data-testid="button-risk-analysis"
                >
                  <AlertTriangle className="h-3 w-3 mr-2" />
                  Risk Analysis
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full justify-start"
                  data-testid="button-export-data"
                >
                  <DollarSign className="h-3 w-3 mr-2" />
                  Export Data
                </Button>
              </CardContent>
            </Card>

            {/* Market Status */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Market Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Market</span>
                    <Badge variant="default" className="bg-green-100 text-green-800">
                      Open
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Options</span>
                    <Badge variant="default" className="bg-green-100 text-green-800">
                      Active
                    </Badge>
                  </div>
                  <div className="text-xs text-gray-500 mt-2">
                    Next close: 4:00 PM ET
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
      )}
    </div>
  );
}