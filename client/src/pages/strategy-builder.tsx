import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Play, 
  Save, 
  RotateCcw, 
  Download, 
  Upload, 
  Settings,
  Target,
  TrendingUp,
  Shield,
  Zap,
  BarChart3,
  Calculator,
  Eye,
  Copy
} from 'lucide-react';
import { STRATEGY_LIBRARY, type StrategyDefinition } from '@/data/strategy-library';

// Strategy Builder Types
interface StrategyLeg {
  id: string;
  type: 'call' | 'put';
  action: 'buy' | 'sell';
  strike: number;
  expiration: string;
  quantity: number;
  premium?: number;
  position?: 'long' | 'short';
}

interface StrategyCanvas {
  legs: StrategyLeg[];
  underlying: string;
  currentPrice: number;
  expiration: string;
}

interface StrategyRisk {
  maxLoss: number;
  maxGain: number;
  breakevens: number[];
  probabilityOfProfit: number;
  expectedValue: number;
  riskRewardRatio: number;
}

// Mock data for testing
const MOCK_STOCKS = [
  { symbol: 'AAPL', price: 202.50, iv: 28.5 },
  { symbol: 'TSLA', price: 245.30, iv: 45.2 },
  { symbol: 'NVDA', price: 875.20, iv: 32.1 },
  { symbol: 'SPY', price: 485.75, iv: 15.8 },
  { symbol: 'QQQ', price: 425.90, iv: 18.3 },
];

const MOCK_EXPIRATIONS = [
  '2024-01-19',
  '2024-02-16', 
  '2024-03-15',
  '2024-04-19',
  '2024-05-17',
  '2024-06-21'
];

export default function StrategyBuilder() {
  const [selectedStock, setSelectedStock] = useState(MOCK_STOCKS[0]);
  const [selectedExpiration, setSelectedExpiration] = useState(MOCK_EXPIRATIONS[0]);
  const [canvas, setCanvas] = useState<StrategyCanvas>({
    legs: [],
    underlying: selectedStock.symbol,
    currentPrice: selectedStock.price,
    expiration: selectedExpiration
  });
  const [selectedStrategy, setSelectedStrategy] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Strategy templates organized by complexity
  const strategyTemplates = useMemo(() => {
    const grouped = STRATEGY_LIBRARY.reduce((acc, strategy) => {
      if (!acc[strategy.complexity]) {
        acc[strategy.complexity] = [];
      }
      acc[strategy.complexity].push(strategy);
      return acc;
    }, {} as Record<string, StrategyDefinition[]>);

    return grouped;
  }, []);

  // Auto-detect strategy pattern
  const detectStrategy = (legs: StrategyLeg[]): string => {
    if (legs.length === 1) {
      const leg = legs[0];
      if (leg.type === 'call' && leg.action === 'buy') return 'long-call';
      if (leg.type === 'put' && leg.action === 'buy') return 'long-put';
      if (leg.type === 'call' && leg.action === 'sell') return 'short-call';
      if (leg.type === 'put' && leg.action === 'sell') return 'short-put';
    }
    
    if (legs.length === 2) {
      const [leg1, leg2] = legs;
      if (leg1.type === leg2.type && leg1.action !== leg2.action) {
        if (leg1.type === 'call') return leg1.action === 'buy' ? 'bull-call-spread' : 'bear-call-spread';
        if (leg1.type === 'put') return leg1.action === 'buy' ? 'bear-put-spread' : 'bull-put-spread';
      }
      if (leg1.type !== leg2.type && leg1.action === 'buy' && leg2.action === 'buy') {
        return 'long-straddle';
      }
      if (leg1.type !== leg2.type && leg1.action === 'sell' && leg2.action === 'sell') {
        return 'short-straddle';
      }
    }

    if (legs.length === 4) {
      const calls = legs.filter(l => l.type === 'call');
      const puts = legs.filter(l => l.type === 'put');
      if (calls.length === 2 && puts.length === 2) {
        return 'iron-condor';
      }
      if (calls.length === 3 && puts.length === 1) {
        return 'call-butterfly';
      }
      if (calls.length === 1 && puts.length === 3) {
        return 'put-butterfly';
      }
    }

    return 'custom-strategy';
  };

  // Calculate strategy risk metrics
  const calculateRisk = (legs: StrategyLeg[]): StrategyRisk => {
    // Mock calculation - in real app, this would use Black-Scholes
    const totalCost = legs.reduce((sum, leg) => {
      const cost = leg.premium || 2.50;
      return sum + (leg.action === 'buy' ? cost : -cost) * leg.quantity;
    }, 0);

    const maxLoss = Math.abs(Math.min(0, totalCost));
    const maxGain = Math.max(0, totalCost * 2); // Simplified
    const breakevens = [canvas.currentPrice * 0.95, canvas.currentPrice * 1.05]; // Mock
    const probabilityOfProfit = 65; // Mock
    const expectedValue = totalCost * 0.8; // Mock
    const riskRewardRatio = maxGain / maxLoss || 0;

    return {
      maxLoss,
      maxGain,
      breakevens,
      probabilityOfProfit,
      expectedValue,
      riskRewardRatio
    };
  };

  const detectedStrategy = detectStrategy(canvas.legs);
  const riskMetrics = calculateRisk(canvas.legs);

  const addLeg = (type: 'call' | 'put', action: 'buy' | 'sell') => {
    const newLeg: StrategyLeg = {
      id: `leg-${Date.now()}`,
      type,
      action,
      strike: canvas.currentPrice,
      expiration: selectedExpiration,
      quantity: 1,
      premium: 2.50
    };
    
    setCanvas(prev => ({
      ...prev,
      legs: [...prev.legs, newLeg]
    }));
  };

  const removeLeg = (legId: string) => {
    setCanvas(prev => ({
      ...prev,
      legs: prev.legs.filter(leg => leg.id !== legId)
    }));
  };

  const updateLeg = (legId: string, updates: Partial<StrategyLeg>) => {
    setCanvas(prev => ({
      ...prev,
      legs: prev.legs.map(leg => 
        leg.id === legId ? { ...leg, ...updates } : leg
      )
    }));
  };

  const loadStrategyTemplate = (strategyId: string) => {
    const strategy = STRATEGY_LIBRARY.find(s => s.id === strategyId);
    if (!strategy) return;

    // Convert strategy definition to legs (simplified)
    const legs: StrategyLeg[] = [];
    
    if (strategy.id === 'long-strangle') {
      legs.push(
        { id: 'leg-1', type: 'call', action: 'buy', strike: canvas.currentPrice * 1.05, expiration: selectedExpiration, quantity: 1, premium: 3.20 },
        { id: 'leg-2', type: 'put', action: 'buy', strike: canvas.currentPrice * 0.95, expiration: selectedExpiration, quantity: 1, premium: 2.80 }
      );
    } else if (strategy.id === 'iron-condor') {
      legs.push(
        { id: 'leg-1', type: 'call', action: 'sell', strike: canvas.currentPrice * 1.02, expiration: selectedExpiration, quantity: 1, premium: 2.10 },
        { id: 'leg-2', type: 'call', action: 'buy', strike: canvas.currentPrice * 1.05, expiration: selectedExpiration, quantity: 1, premium: 1.20 },
        { id: 'leg-3', type: 'put', action: 'sell', strike: canvas.currentPrice * 0.98, expiration: selectedExpiration, quantity: 1, premium: 1.90 },
        { id: 'leg-4', type: 'put', action: 'buy', strike: canvas.currentPrice * 0.95, expiration: selectedExpiration, quantity: 1, premium: 1.10 }
      );
    }

    setCanvas(prev => ({ ...prev, legs }));
    setSelectedStrategy(strategyId);
  };

  const clearCanvas = () => {
    setCanvas(prev => ({ ...prev, legs: [] }));
    setSelectedStrategy('');
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Strategy Builder</h1>
              <p className="text-gray-600 mt-2">Build, analyze, and optimize options strategies visually</p>
            </div>
            <div className="flex items-center space-x-3">
              <Button variant="outline" size="sm">
                <Upload className="w-4 h-4 mr-2" />
                Import
              </Button>
              <Button variant="outline" size="sm">
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
                <Save className="w-4 h-4 mr-2" />
                Save Strategy
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Sidebar - Strategy Templates */}
          <div className="lg:col-span-1">
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center">
                <Target className="w-5 h-5 mr-2" />
                Strategy Templates
              </h3>
              
              <Tabs defaultValue="beginner" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="beginner">Beginner</TabsTrigger>
                  <TabsTrigger value="intermediate">Intermediate</TabsTrigger>
                  <TabsTrigger value="advanced">Advanced</TabsTrigger>
                </TabsList>
                
                <TabsContent value="beginner" className="mt-4">
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {strategyTemplates.beginner?.map((strategy) => (
                      <div
                        key={strategy.id}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                          selectedStrategy === strategy.id 
                            ? 'bg-blue-50 border-blue-200' 
                            : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                        }`}
                        onClick={() => loadStrategyTemplate(strategy.id)}
                      >
                        <div className="font-medium text-sm">{strategy.name}</div>
                        <div className="text-xs text-gray-600 mt-1">{strategy.summary}</div>
                        <Badge 
                          variant="outline" 
                          className={`text-xs mt-2 ${
                            strategy.riskLevel === 'Low' ? 'bg-green-100 text-green-800' :
                            strategy.riskLevel === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}
                        >
                          {strategy.riskLevel} Risk
                        </Badge>
                      </div>
                    ))}
                  </div>
                </TabsContent>
                
                <TabsContent value="intermediate" className="mt-4">
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {strategyTemplates.intermediate?.map((strategy) => (
                      <div
                        key={strategy.id}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                          selectedStrategy === strategy.id 
                            ? 'bg-blue-50 border-blue-200' 
                            : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                        }`}
                        onClick={() => loadStrategyTemplate(strategy.id)}
                      >
                        <div className="font-medium text-sm">{strategy.name}</div>
                        <div className="text-xs text-gray-600 mt-1">{strategy.summary}</div>
                        <Badge 
                          variant="outline" 
                          className={`text-xs mt-2 ${
                            strategy.riskLevel === 'Low' ? 'bg-green-100 text-green-800' :
                            strategy.riskLevel === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}
                        >
                          {strategy.riskLevel} Risk
                        </Badge>
                      </div>
                    ))}
                  </div>
                </TabsContent>
                
                <TabsContent value="advanced" className="mt-4">
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {strategyTemplates.advanced?.map((strategy) => (
                      <div
                        key={strategy.id}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                          selectedStrategy === strategy.id 
                            ? 'bg-blue-50 border-blue-200' 
                            : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                        }`}
                        onClick={() => loadStrategyTemplate(strategy.id)}
                      >
                        <div className="font-medium text-sm">{strategy.name}</div>
                        <div className="text-xs text-gray-600 mt-1">{strategy.summary}</div>
                        <Badge 
                          variant="outline" 
                          className={`text-xs mt-2 ${
                            strategy.riskLevel === 'Low' ? 'bg-green-100 text-green-800' :
                            strategy.riskLevel === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}
                        >
                          {strategy.riskLevel} Risk
                        </Badge>
                      </div>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>
            </Card>
          </div>

          {/* Main Canvas Area */}
          <div className="lg:col-span-2">
            <Card className="p-6 h-full">
              {/* Market Setup */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                  <Settings className="w-5 h-5 mr-2" />
                  Market Setup
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="underlying">Underlying</Label>
                    <Select value={selectedStock.symbol} onValueChange={(value) => {
                      const stock = MOCK_STOCKS.find(s => s.symbol === value);
                      if (stock) {
                        setSelectedStock(stock);
                        setCanvas(prev => ({ ...prev, underlying: stock.symbol, currentPrice: stock.price }));
                      }
                    }}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MOCK_STOCKS.map(stock => (
                          <SelectItem key={stock.symbol} value={stock.symbol}>
                            {stock.symbol} - ${stock.price}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="expiration">Expiration</Label>
                    <Select value={selectedExpiration} onValueChange={(value) => {
                      setSelectedExpiration(value);
                      setCanvas(prev => ({ ...prev, expiration: value }));
                    }}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MOCK_EXPIRATIONS.map(exp => (
                          <SelectItem key={exp} value={exp}>
                            {new Date(exp).toLocaleDateString()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="currentPrice">Current Price</Label>
                    <Input 
                      id="currentPrice"
                      value={canvas.currentPrice}
                      onChange={(e) => setCanvas(prev => ({ ...prev, currentPrice: parseFloat(e.target.value) || 0 }))}
                      type="number"
                      step="0.01"
                    />
                  </div>
                </div>
              </div>

              {/* Strategy Canvas */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold flex items-center">
                    <BarChart3 className="w-5 h-5 mr-2" />
                    Strategy Canvas
                  </h3>
                  <div className="flex space-x-2">
                    <Button variant="outline" size="sm" onClick={clearCanvas}>
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Clear
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => addLeg('call', 'buy')}
                    >
                      + Call
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => addLeg('put', 'buy')}
                    >
                      + Put
                    </Button>
                  </div>
                </div>

                {/* Canvas Area */}
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 min-h-[300px] bg-gray-50">
                  {canvas.legs.length === 0 ? (
                    <div className="flex items-center justify-center h-64 text-gray-500">
                      <div className="text-center">
                        <Target className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                        <p className="text-lg font-medium">Start Building Your Strategy</p>
                        <p className="text-sm">Drag options from templates or click + Call/Put to add legs</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {canvas.legs.map((leg, index) => (
                        <div key={leg.id} className="bg-white border rounded-lg p-4 shadow-sm">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-4">
                              <Badge 
                                variant="outline"
                                className={`${
                                  leg.action === 'buy' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                }`}
                              >
                                {leg.action.toUpperCase()}
                              </Badge>
                              <Badge 
                                variant="outline"
                                className={`${
                                  leg.type === 'call' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                                }`}
                              >
                                {leg.type.toUpperCase()}
                              </Badge>
                              <span className="font-medium">Leg {index + 1}</span>
                            </div>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => removeLeg(leg.id)}
                              className="text-red-600 hover:text-red-800"
                            >
                              Remove
                            </Button>
                          </div>
                          
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                            <div>
                              <Label className="text-xs">Strike</Label>
                              <Input 
                                value={leg.strike}
                                onChange={(e) => updateLeg(leg.id, { strike: parseFloat(e.target.value) || 0 })}
                                type="number"
                                step="0.01"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Premium</Label>
                              <Input 
                                value={leg.premium || ''}
                                onChange={(e) => updateLeg(leg.id, { premium: parseFloat(e.target.value) || 0 })}
                                type="number"
                                step="0.01"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Quantity</Label>
                              <Input 
                                value={leg.quantity}
                                onChange={(e) => updateLeg(leg.id, { quantity: parseInt(e.target.value) || 1 })}
                                type="number"
                                min="1"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Expiration</Label>
                              <Select 
                                value={leg.expiration} 
                                onValueChange={(value) => updateLeg(leg.id, { expiration: value })}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {MOCK_EXPIRATIONS.map(exp => (
                                    <SelectItem key={exp} value={exp}>
                                      {new Date(exp).toLocaleDateString()}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Detected Strategy */}
                {detectedStrategy !== 'custom-strategy' && (
                  <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center">
                      <Eye className="w-4 h-4 mr-2 text-blue-600" />
                      <span className="text-sm font-medium text-blue-800">
                        Detected Strategy: {STRATEGY_LIBRARY.find(s => s.id === detectedStrategy)?.name || detectedStrategy}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Right Sidebar - Analysis */}
          <div className="lg:col-span-1">
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center">
                <Calculator className="w-5 h-5 mr-2" />
                Risk Analysis
              </h3>

              {canvas.legs.length > 0 ? (
                <div className="space-y-4">
                  {/* Risk Metrics */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Max Loss</span>
                      <span className="font-medium text-red-600">${riskMetrics.maxLoss.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Max Gain</span>
                      <span className="font-medium text-green-600">${riskMetrics.maxGain.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Risk/Reward</span>
                      <span className="font-medium">{riskMetrics.riskRewardRatio.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Probability of Profit</span>
                      <span className="font-medium">{riskMetrics.probabilityOfProfit}%</span>
                    </div>
                  </div>

                  {/* Breakevens */}
                  <div>
                    <h4 className="text-sm font-medium mb-2">Breakeven Points</h4>
                    <div className="space-y-1">
                      {riskMetrics.breakevens.map((be, index) => (
                        <div key={index} className="text-sm text-gray-600">
                          ${be.toFixed(2)}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="space-y-2 pt-4 border-t">
                    <Button className="w-full bg-blue-600 hover:bg-blue-700">
                      <Play className="w-4 h-4 mr-2" />
                      Analyze Strategy
                    </Button>
                    <Button variant="outline" className="w-full">
                      <Copy className="w-4 h-4 mr-2" />
                      Copy to Portfolio
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center text-gray-500 py-8">
                  <Calculator className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                  <p className="text-sm">Add strategy legs to see risk analysis</p>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
