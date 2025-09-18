import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Search, 
  Filter, 
  TrendingUp, 
  Target, 
  Clock,
  DollarSign,
  BarChart3,
  Plus,
  RefreshCw,
  Star
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";

interface ScreenerCriteria {
  minIV: number;
  maxIV: number;
  minIVPercentile: number;
  maxIVPercentile: number;
  minDaysToExpiry: number;
  maxDaysToExpiry: number;
  maxPremiumCost: number;
  minProfitRange: number;
  sector: string;
  minPrice: number;
  maxPrice: number;
  sortBy: 'iv_percentile' | 'profit_range' | 'premium_cost' | 'days_to_expiry';
}

interface ScreenerResult {
  symbol: string;
  companyName: string;
  currentPrice: number;
  priceChange: number;
  priceChangePercent: number;
  impliedVolatility: number;
  ivPercentile: number;
  estimatedPremiumCost: number;
  profitRange: number;
  profitRangePercent: number;
  daysToExpiry: number;
  sector: string;
  score: number;
  reasons: string[];
}

const DEFAULT_CRITERIA: ScreenerCriteria = {
  minIV: 15,
  maxIV: 80,
  minIVPercentile: 30,
  maxIVPercentile: 90,
  minDaysToExpiry: 20,
  maxDaysToExpiry: 60,
  maxPremiumCost: 1000,
  minProfitRange: 10,
  sector: 'all',
  minPrice: 10,
  maxPrice: 500,
  sortBy: 'iv_percentile'
};

const SECTOR_OPTIONS = [
  { value: 'all', label: 'All Sectors' },
  { value: 'technology', label: 'Technology' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'financial', label: 'Financial' },
  { value: 'consumer', label: 'Consumer' },
  { value: 'energy', label: 'Energy' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'materials', label: 'Materials' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'real_estate', label: 'Real Estate' }
];

// Mock screener data generator (in real app, this would call an API)
const generateScreenerResults = (criteria: ScreenerCriteria): ScreenerResult[] => {
  const mockStocks = [
    { symbol: 'AAPL', name: 'Apple Inc.', price: 202.92, sector: 'technology' },
    { symbol: 'MSFT', name: 'Microsoft Corp.', price: 445.67, sector: 'technology' },
    { symbol: 'GOOGL', name: 'Alphabet Inc.', price: 178.35, sector: 'technology' },
    { symbol: 'TSLA', name: 'Tesla Inc.', price: 308.72, sector: 'consumer' },
    { symbol: 'NVDA', name: 'NVIDIA Corp.', price: 151.32, sector: 'technology' },
    { symbol: 'SPY', name: 'SPDR S&P 500 ETF', price: 627.97, sector: 'financial' },
    { symbol: 'QQQ', name: 'Invesco QQQ Trust', price: 560.27, sector: 'technology' },
    { symbol: 'AMD', name: 'Advanced Micro Devices', price: 134.56, sector: 'technology' },
    { symbol: 'META', name: 'Meta Platforms Inc.', price: 589.23, sector: 'technology' },
    { symbol: 'NFLX', name: 'Netflix Inc.', price: 912.45, sector: 'technology' },
    { symbol: 'AMZN', name: 'Amazon.com Inc.', price: 224.78, sector: 'consumer' },
    { symbol: 'DIS', name: 'Walt Disney Co.', price: 112.34, sector: 'consumer' },
    { symbol: 'BA', name: 'Boeing Co.', price: 178.90, sector: 'industrial' },
    { symbol: 'JPM', name: 'JPMorgan Chase & Co.', price: 245.67, sector: 'financial' },
    { symbol: 'JNJ', name: 'Johnson & Johnson', price: 159.45, sector: 'healthcare' }
  ];

  const results: ScreenerResult[] = [];

  mockStocks.forEach(stock => {
    // Skip if sector filter doesn't match
    if (criteria.sector !== 'all' && stock.sector !== criteria.sector) return;
    
    // Skip if price is outside range
    if (stock.price < criteria.minPrice || stock.price > criteria.maxPrice) return;

    // Generate realistic options data
    const baseIV = 20 + Math.random() * 60; // 20-80% IV
    const ivPercentile = Math.random() * 100;
    const daysToExpiry = 21 + Math.random() * 45; // 21-66 days
    
    // Calculate estimated premium (simplified Black-Scholes approximation)
    const atmStrike = Math.round(stock.price);
    const putStrike = atmStrike * 0.9; // 10% OTM put
    const callStrike = atmStrike * 1.1; // 10% OTM call
    const estimatedPremium = (stock.price * baseIV / 100 * Math.sqrt(daysToExpiry / 365)) * 2;
    
    const profitRange = callStrike - putStrike;
    const profitRangePercent = (profitRange / stock.price) * 100;

    // Apply filters
    if (baseIV < criteria.minIV || baseIV > criteria.maxIV) return;
    if (ivPercentile < criteria.minIVPercentile || ivPercentile > criteria.maxIVPercentile) return;
    if (daysToExpiry < criteria.minDaysToExpiry || daysToExpiry > criteria.maxDaysToExpiry) return;
    if (estimatedPremium > criteria.maxPremiumCost) return;
    if (profitRangePercent < criteria.minProfitRange) return;

    // Calculate score based on multiple factors
    const ivScore = ivPercentile > 70 ? 30 : ivPercentile > 50 ? 20 : 10;
    const premiumScore = estimatedPremium < 300 ? 25 : estimatedPremium < 500 ? 15 : 5;
    const rangeScore = profitRangePercent > 20 ? 25 : profitRangePercent > 15 ? 15 : 5;
    const timeScore = daysToExpiry > 30 ? 20 : daysToExpiry > 21 ? 15 : 10;
    
    const score = ivScore + premiumScore + rangeScore + timeScore;

    // Generate reasons for this pick
    const reasons = [];
    if (ivPercentile > 70) reasons.push('High IV percentile (premium expansion)');
    if (estimatedPremium < 400) reasons.push('Reasonable premium cost');
    if (profitRangePercent > 18) reasons.push('Wide profit range');
    if (daysToExpiry > 35) reasons.push('Plenty of time to expiry');
    if (baseIV > 35) reasons.push('High implied volatility');

    results.push({
      symbol: stock.symbol,
      companyName: stock.name,
      currentPrice: stock.price,
      priceChange: (Math.random() - 0.5) * 10,
      priceChangePercent: (Math.random() - 0.5) * 5,
      impliedVolatility: baseIV,
      ivPercentile: Math.round(ivPercentile),
      estimatedPremiumCost: Math.round(estimatedPremium),
      profitRange: Math.round(profitRange),
      profitRangePercent: Math.round(profitRangePercent * 10) / 10,
      daysToExpiry: Math.round(daysToExpiry),
      sector: stock.sector,
      score: Math.round(score),
      reasons
    });
  });

  // Sort results
  results.sort((a, b) => {
    switch (criteria.sortBy) {
      case 'iv_percentile': return b.ivPercentile - a.ivPercentile;
      case 'profit_range': return b.profitRangePercent - a.profitRangePercent;
      case 'premium_cost': return a.estimatedPremiumCost - b.estimatedPremiumCost;
      case 'days_to_expiry': return b.daysToExpiry - a.daysToExpiry;
      default: return b.score - a.score;
    }
  });

  return results.slice(0, 10); // Return top 10 results
};

interface StrategyScreenerProps {
  onAddTicker?: (symbol: string) => void;
  className?: string;
}

export function StrategyScreener({ onAddTicker, className }: StrategyScreenerProps) {
  const [criteria, setCriteria] = useState<ScreenerCriteria>(DEFAULT_CRITERIA);
  const [results, setResults] = useState<ScreenerResult[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { toast } = useToast();

  const runScreener = async () => {
    setIsScanning(true);
    try {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const screenedResults = generateScreenerResults(criteria);
      setResults(screenedResults);
      
      toast({
        title: "Screener complete",
        description: `Found ${screenedResults.length} opportunities matching your criteria`,
      });
    } catch (error) {
      toast({
        title: "Screener failed",
        description: "Failed to run options screener",
        variant: "destructive",
      });
    } finally {
      setIsScanning(false);
    }
  };

  const handleAddTicker = (symbol: string) => {
    if (onAddTicker) {
      onAddTicker(symbol);
      toast({
        title: "Ticker added",
        description: `${symbol} has been added to your watchlist`,
      });
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'bg-green-100 text-green-800';
    if (score >= 60) return 'bg-yellow-100 text-yellow-800';
    return 'bg-gray-100 text-gray-800';
  };

  const getSectorColor = (sector: string) => {
    const colors = {
      technology: 'bg-blue-100 text-blue-800',
      healthcare: 'bg-red-100 text-red-800',
      financial: 'bg-green-100 text-green-800',
      consumer: 'bg-purple-100 text-purple-800',
      energy: 'bg-orange-100 text-orange-800',
      industrial: 'bg-gray-100 text-gray-800',
      materials: 'bg-yellow-100 text-yellow-800',
      utilities: 'bg-teal-100 text-teal-800',
      real_estate: 'bg-pink-100 text-pink-800'
    };
    return colors[sector as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className={className}>
      <Card className="p-6" data-testid="strategy-screener-card">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Search className="h-5 w-5" />
              Long Strangle Screener
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Find the best long strangle opportunities based on your criteria
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-screener-settings">
                  <Filter className="h-4 w-4 mr-2" />
                  Criteria
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Screener Criteria</DialogTitle>
                  <DialogDescription>
                    Set your criteria for finding long strangle opportunities
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-6 mt-4">
                  {/* Quick Presets */}
                  <div>
                    <Label className="text-sm font-medium">Quick Presets</Label>
                    <div className="flex gap-2 mt-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setCriteria({
                          ...DEFAULT_CRITERIA,
                          minIVPercentile: 60,
                          maxPremiumCost: 500,
                          minDaysToExpiry: 30
                        })}
                      >
                        Conservative
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setCriteria({
                          ...DEFAULT_CRITERIA,
                          minIVPercentile: 40,
                          maxPremiumCost: 800,
                          minDaysToExpiry: 20
                        })}
                      >
                        Balanced
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setCriteria({
                          ...DEFAULT_CRITERIA,
                          minIVPercentile: 20,
                          maxPremiumCost: 1200,
                          minDaysToExpiry: 14
                        })}
                      >
                        Aggressive
                      </Button>
                    </div>
                  </div>

                  {/* Implied Volatility */}
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Implied Volatility Range</Label>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs text-muted-foreground">Min IV %</Label>
                        <Input
                          type="number"
                          value={criteria.minIV}
                          onChange={(e) => setCriteria({...criteria, minIV: Number(e.target.value)})}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Max IV %</Label>
                        <Input
                          type="number"
                          value={criteria.maxIV}
                          onChange={(e) => setCriteria({...criteria, maxIV: Number(e.target.value)})}
                          className="mt-1"
                        />
                      </div>
                    </div>
                  </div>

                  {/* IV Percentile */}
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">IV Percentile Range</Label>
                    <div className="px-2">
                      <div className="flex justify-between text-xs text-muted-foreground mb-2">
                        <span>{criteria.minIVPercentile}%</span>
                        <span>{criteria.maxIVPercentile}%</span>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <Label className="text-xs">Min Percentile</Label>
                          <Slider
                            value={[criteria.minIVPercentile]}
                            onValueChange={([value]) => setCriteria({...criteria, minIVPercentile: value})}
                            max={100}
                            step={5}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Max Percentile</Label>
                          <Slider
                            value={[criteria.maxIVPercentile]}
                            onValueChange={([value]) => setCriteria({...criteria, maxIVPercentile: value})}
                            max={100}
                            step={5}
                            className="mt-1"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Days to Expiry */}
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Days to Expiration</Label>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs text-muted-foreground">Min Days</Label>
                        <Input
                          type="number"
                          value={criteria.minDaysToExpiry}
                          onChange={(e) => setCriteria({...criteria, minDaysToExpiry: Number(e.target.value)})}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Max Days</Label>
                        <Input
                          type="number"
                          value={criteria.maxDaysToExpiry}
                          onChange={(e) => setCriteria({...criteria, maxDaysToExpiry: Number(e.target.value)})}
                          className="mt-1"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Premium Cost */}
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Max Premium Cost</Label>
                    <Input
                      type="number"
                      value={criteria.maxPremiumCost}
                      onChange={(e) => setCriteria({...criteria, maxPremiumCost: Number(e.target.value)})}
                      placeholder="Maximum total premium"
                    />
                  </div>

                  {/* Stock Price Range */}
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Stock Price Range</Label>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs text-muted-foreground">Min Price</Label>
                        <Input
                          type="number"
                          value={criteria.minPrice}
                          onChange={(e) => setCriteria({...criteria, minPrice: Number(e.target.value)})}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Max Price</Label>
                        <Input
                          type="number"
                          value={criteria.maxPrice}
                          onChange={(e) => setCriteria({...criteria, maxPrice: Number(e.target.value)})}
                          className="mt-1"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Sector Filter */}
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Sector</Label>
                    <Select value={criteria.sector} onValueChange={(value) => setCriteria({...criteria, sector: value})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SECTOR_OPTIONS.map(option => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Sort By */}
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Sort Results By</Label>
                    <Select value={criteria.sortBy} onValueChange={(value: any) => setCriteria({...criteria, sortBy: value})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="iv_percentile">IV Percentile (High to Low)</SelectItem>
                        <SelectItem value="profit_range">Profit Range (Wide to Narrow)</SelectItem>
                        <SelectItem value="premium_cost">Premium Cost (Low to High)</SelectItem>
                        <SelectItem value="days_to_expiry">Days to Expiry (Long to Short)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Button 
              onClick={runScreener} 
              disabled={isScanning}
              data-testid="button-run-screener"
            >
              {isScanning ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              {isScanning ? 'Scanning...' : 'Scan Market'}
            </Button>
          </div>
        </div>

        {/* Current Criteria Summary */}
        <div className="mb-6 p-3 bg-muted/50 rounded-lg">
          <div className="text-xs text-muted-foreground mb-2">Current Criteria:</div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="text-xs">
              IV: {criteria.minIV}%-{criteria.maxIV}%
            </Badge>
            <Badge variant="secondary" className="text-xs">
              IV Percentile: {criteria.minIVPercentile}%-{criteria.maxIVPercentile}%
            </Badge>
            <Badge variant="secondary" className="text-xs">
              Days: {criteria.minDaysToExpiry}-{criteria.maxDaysToExpiry}
            </Badge>
            <Badge variant="secondary" className="text-xs">
              Max Premium: ${criteria.maxPremiumCost}
            </Badge>
            {criteria.sector !== 'all' && (
              <Badge variant="secondary" className="text-xs">
                {SECTOR_OPTIONS.find(s => s.value === criteria.sector)?.label}
              </Badge>
            )}
          </div>
        </div>

        {/* Results */}
        {results.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">
                Screening Results ({results.length})
              </h3>
              <Badge variant="outline" className="text-xs">
                Sorted by {criteria.sortBy.replace('_', ' ')}
              </Badge>
            </div>

            <div className="grid gap-3">
              {results.map((result, index) => (
                <Card key={result.symbol} className="p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-foreground">{result.symbol}</span>
                          <Badge className={`text-xs ${getScoreColor(result.score)}`}>
                            Score: {result.score}
                          </Badge>
                          <Badge className={`text-xs ${getSectorColor(result.sector)}`}>
                            {result.sector}
                          </Badge>
                          {index < 3 && (
                            <Badge variant="outline" className="text-xs border-yellow-400 text-yellow-700">
                              <Star className="h-3 w-3 mr-1" />
                              Top Pick
                            </Badge>
                          )}
                        </div>
                      </div>
                      
                      <div className="text-sm text-muted-foreground mb-2">{result.companyName}</div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                        <div>
                          <div className="text-muted-foreground">Current Price</div>
                          <div className="font-medium">${result.currentPrice.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">IV Percentile</div>
                          <div className="font-medium">{result.ivPercentile.toFixed(2)}%</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Est. Premium</div>
                          <div className="font-medium">${result.estimatedPremiumCost.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Profit Range</div>
                          <div className="font-medium">{result.profitRangePercent.toFixed(2)}%</div>
                        </div>
                      </div>

                      {result.reasons.length > 0 && (
                        <div className="mt-3">
                          <div className="text-xs text-muted-foreground mb-1">Why this pick:</div>
                          <div className="flex flex-wrap gap-1">
                            {result.reasons.slice(0, 3).map((reason, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {reason}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="ml-4">
                      <Button
                        size="sm"
                        onClick={() => handleAddTicker(result.symbol)}
                        data-testid={`button-add-${result.symbol}`}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="text-muted-foreground mb-4">
              <BarChart3 className="h-12 w-12 mx-auto mb-2 opacity-50" />
              {isScanning ? 'Scanning market for opportunities...' : 'Click "Scan Market" to find long strangle opportunities'}
            </div>
            {!isScanning && (
              <Button onClick={runScreener} data-testid="button-start-scan">
                <Search className="h-4 w-4 mr-2" />
                Start Screening
              </Button>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}