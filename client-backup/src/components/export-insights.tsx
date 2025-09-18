import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, FileText, Table, BarChart3 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { TickerWithPosition, PortfolioSummary } from "@shared/schema";

interface ExportInsightsProps {
  tickers: TickerWithPosition[];
  summary: PortfolioSummary;
}

export function ExportInsights({ tickers, summary }: ExportInsightsProps) {
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  // Generate comprehensive trading insights data
  const generateInsightsData = () => {
    const timestamp = new Date().toISOString();
    
    // Portfolio overview
    const portfolioOverview = {
      totalPositions: summary.activePositions,
      totalPremiumPaid: summary.totalPremiumPaid,
      averageImpliedVolatility: summary.avgImpliedVolatility,
      exportTimestamp: timestamp,
    };

    // Position details with risk metrics
    const positions = tickers.map(ticker => ({
      symbol: ticker.symbol,
      companyName: ticker.companyName,
      currentPrice: ticker.currentPrice,
      priceChange: ticker.priceChange,
      priceChangePercent: ticker.priceChangePercent,
      position: {
        longPutStrike: ticker.position.longPutStrike,
        longCallStrike: ticker.position.longCallStrike,
        longPutPremium: ticker.position.longPutPremium,
        longCallPremium: ticker.position.longCallPremium,
        totalPremiumPaid: ticker.position.longPutPremium + ticker.position.longCallPremium,
        lowerBreakeven: ticker.position.lowerBreakeven,
        upperBreakeven: ticker.position.upperBreakeven,
        maxLoss: ticker.position.maxLoss,
        atmValue: ticker.position.atmValue,
        impliedVolatility: ticker.position.impliedVolatility,
        ivPercentile: ticker.position.ivPercentile,
        daysToExpiry: ticker.position.daysToExpiry,
        expirationDate: ticker.position.expirationDate,
      },
      riskMetrics: {
        distanceFromBreakevens: {
          lowerBreakevenDistance: ((ticker.currentPrice - ticker.position.lowerBreakeven) / ticker.currentPrice * 100).toFixed(2),
          upperBreakevenDistance: ((ticker.position.upperBreakeven - ticker.currentPrice) / ticker.currentPrice * 100).toFixed(2),
        },
        volatilityRank: ticker.position.ivPercentile >= 70 ? "High" : ticker.position.ivPercentile >= 30 ? "Medium" : "Low",
        timeDecayRisk: ticker.position.daysToExpiry < 30 ? "High" : ticker.position.daysToExpiry < 60 ? "Medium" : "Low",
      }
    }));

    // Market insights
    const marketInsights = {
      highVolatilityPositions: positions.filter(p => p.position.ivPercentile >= 70).length,
      nearExpirationPositions: positions.filter(p => p.position.daysToExpiry < 30).length,
      profitableRange: positions.map(p => ({
        symbol: p.symbol,
        profitableIfAbove: p.position.upperBreakeven,
        profitableIfBelow: p.position.lowerBreakeven,
        currentlyProfitable: p.currentPrice < p.position.lowerBreakeven || p.currentPrice > p.position.upperBreakeven
      }))
    };

    return {
      portfolioOverview,
      positions,
      marketInsights,
      exportMetadata: {
        exportDate: new Date().toLocaleDateString(),
        exportTime: new Date().toLocaleTimeString(),
        dataPoints: positions.length,
        reportType: "Long Strangle Options Analysis"
      }
    };
  };

  // Export as CSV format
  const exportAsCSV = () => {
    // Track export activity for achievements
    const exportCount = parseInt(localStorage.getItem('export-count') || '0') + 1;
    localStorage.setItem('export-count', exportCount.toString());
    
    const data = generateInsightsData();
    
    // Create CSV content
    const csvHeader = [
      "Symbol", "Company", "Current Price", "Price Change %", 
      "Put Strike", "Call Strike", "Total Premium Paid", 
      "Lower Breakeven", "Upper Breakeven", "Max Loss",
      "Implied Volatility %", "IV Percentile", "Days to Expiry",
      "Volatility Rank", "Time Decay Risk", "Lower BE Distance %", "Upper BE Distance %"
    ].join(",");

    const csvRows = data.positions.map(pos => [
      pos.symbol,
      `"${pos.companyName}"`,
      pos.currentPrice.toFixed(2),
      pos.priceChangePercent.toFixed(2),
      pos.position.longPutStrike,
      pos.position.longCallStrike,
      pos.position.totalPremiumPaid.toFixed(2),
      pos.position.lowerBreakeven.toFixed(2),
      pos.position.upperBreakeven.toFixed(2),
      pos.position.maxLoss,
      pos.position.impliedVolatility.toFixed(1),
      pos.position.ivPercentile,
      pos.position.daysToExpiry,
      pos.riskMetrics.volatilityRank,
      pos.riskMetrics.timeDecayRisk,
      pos.riskMetrics.distanceFromBreakevens.lowerBreakevenDistance,
      pos.riskMetrics.distanceFromBreakevens.upperBreakevenDistance
    ].join(","));

    const csvContent = [csvHeader, ...csvRows].join("\n");

    // Download CSV
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `options-insights-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Export as JSON format
  const exportAsJSON = () => {
    // Track export activity for achievements
    const exportCount = parseInt(localStorage.getItem('export-count') || '0') + 1;
    localStorage.setItem('export-count', exportCount.toString());
    
    const data = generateInsightsData();
    
    const jsonContent = JSON.stringify(data, null, 2);
    
    // Download JSON
    const blob = new Blob([jsonContent], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `options-insights-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Export as formatted text report
  const exportAsReport = () => {
    // Track export activity for achievements
    const exportCount = parseInt(localStorage.getItem('export-count') || '0') + 1;
    localStorage.setItem('export-count', exportCount.toString());
    
    const data = generateInsightsData();
    
    const reportContent = `
LONG STRANGLE OPTIONS TRADING INSIGHTS REPORT
Generated: ${data.exportMetadata.exportDate} at ${data.exportMetadata.exportTime}

PORTFOLIO OVERVIEW
==================
Total Active Positions: ${data.portfolioOverview.totalPositions}
Total Premium Paid: $${data.portfolioOverview.totalPremiumPaid.toLocaleString()}
Average Implied Volatility: ${data.portfolioOverview.averageImpliedVolatility.toFixed(1)}%

MARKET INSIGHTS
===============
High Volatility Positions (IV > 70%): ${data.marketInsights.highVolatilityPositions}
Near Expiration Positions (< 30 days): ${data.marketInsights.nearExpirationPositions}

POSITION DETAILS
================
${data.positions.map(pos => `
${pos.symbol} - ${pos.companyName}
Current Price: $${pos.currentPrice.toFixed(2)} (${pos.priceChange >= 0 ? '+' : ''}${pos.priceChangePercent.toFixed(2)}%)
Strikes: Put $${pos.position.longPutStrike} | Call $${pos.position.longCallStrike}
Breakevens: $${pos.position.lowerBreakeven.toFixed(2)} - $${pos.position.upperBreakeven.toFixed(2)}
Premium Paid: $${pos.position.totalPremiumPaid.toFixed(2)} | Max Loss: ${pos.position.maxLoss === Number.MAX_SAFE_INTEGER ? 'Unlimited' : `$${pos.position.maxLoss}`}
IV: ${pos.position.impliedVolatility.toFixed(1)}% (${pos.position.ivPercentile}% percentile)
Days to Expiry: ${pos.position.daysToExpiry}
Risk Assessment: ${pos.riskMetrics.volatilityRank} volatility, ${pos.riskMetrics.timeDecayRisk} time decay risk
Distance to Breakevens: ${pos.riskMetrics.distanceFromBreakevens.lowerBreakevenDistance}% (lower) | ${pos.riskMetrics.distanceFromBreakevens.upperBreakevenDistance}% (upper)
`).join('\n---\n')}

END OF REPORT
`.trim();

    // Download text report
    const blob = new Blob([reportContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `options-insights-report-${new Date().toISOString().split('T')[0]}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = async (format: 'csv' | 'json' | 'report') => {
    setIsExporting(true);
    try {
      switch (format) {
        case 'csv':
          exportAsCSV();
          break;
        case 'json':
          exportAsJSON();
          break;
        case 'report':
          exportAsReport();
          break;
      }
      
      toast({
        title: "Export successful",
        description: `Trading insights exported as ${format.toUpperCase()}`,
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description: "Failed to export trading insights",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Card className="p-4" data-testid="export-insights-card">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground">Trading Insights Export</h3>
          <p className="text-xs text-muted-foreground">
            Export comprehensive analysis of your {tickers.length} active positions
          </p>
        </div>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="outline" 
              size="sm" 
              disabled={isExporting || tickers.length === 0}
              data-testid="button-export-insights"
            >
              <Download className="h-4 w-4 mr-2" />
              Export Insights
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem 
              onClick={() => handleExport('csv')}
              data-testid="menu-export-csv"
            >
              <Table className="h-4 w-4 mr-2" />
              CSV Spreadsheet
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => handleExport('json')}
              data-testid="menu-export-json"
            >
              <BarChart3 className="h-4 w-4 mr-2" />
              JSON Data
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => handleExport('report')}
              data-testid="menu-export-report"
            >
              <FileText className="h-4 w-4 mr-2" />
              Text Report
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Export preview badges */}
      <div className="flex flex-wrap gap-2 mt-3">
        <Badge variant="secondary" className="text-xs">
          {summary.activePositions} Positions
        </Badge>
        <Badge variant="secondary" className="text-xs">
          ${summary.totalPremiumPaid.toLocaleString()} Premium
        </Badge>
        <Badge variant="secondary" className="text-xs">
          {summary.avgImpliedVolatility.toFixed(1)}% Avg IV
        </Badge>
        {tickers.filter(t => t.position.ivPercentile >= 70).length > 0 && (
          <Badge variant="destructive" className="text-xs">
            {tickers.filter(t => t.position.ivPercentile >= 70).length} High IV
          </Badge>
        )}
        {tickers.filter(t => t.position.daysToExpiry < 30).length > 0 && (
          <Badge variant="outline" className="text-xs">
            {tickers.filter(t => t.position.daysToExpiry < 30).length} Near Expiry
          </Badge>
        )}
      </div>
    </Card>
  );
}