import { useState, useMemo, useEffect, useRef } from 'react';
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
  Copy,
  Trash2,
  Plus,
  Minus
} from 'lucide-react';
import { STRATEGY_LIBRARY, type StrategyDefinition } from '@/data/strategy-library';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

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

  // Calculate P&L at a specific stock price
  const calculatePLAtPrice = (legs: StrategyLeg[], stockPrice: number): number => {
    return legs.reduce((totalPL, leg) => {
      let intrinsicValue = 0;
      
      if (leg.type === 'call') {
        intrinsicValue = Math.max(0, stockPrice - leg.strike);
      } else {
        intrinsicValue = Math.max(0, leg.strike - stockPrice);
      }
      
      const optionValue = intrinsicValue * leg.quantity;
      const premiumPaid = (leg.premium || 0) * leg.quantity;
      
      if (leg.action === 'buy') {
        return totalPL + (optionValue - premiumPaid);
      } else {
        return totalPL + (premiumPaid - optionValue);
      }
    }, 0);
  };

  // Generate P&L data for chart
  const generatePLData = (legs: StrategyLeg[]) => {
    if (legs.length === 0) return { labels: [], datasets: [] };
    
    const currentPrice = canvas.currentPrice;
    const minPrice = currentPrice * 0.8;
    const maxPrice = currentPrice * 1.2;
    const step = (maxPrice - minPrice) / 50;
    
    const labels = [];
    const plData = [];
    
    for (let price = minPrice; price <= maxPrice; price += step) {
      labels.push(price.toFixed(2));
      plData.push(calculatePLAtPrice(legs, price));
    }
    
    return {
      labels,
      datasets: [{
        label: 'P&L',
        data: plData,
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.1
      }]
    };
  };

  // Calculate strategy risk metrics
  const calculateRisk = (legs: StrategyLeg[]): StrategyRisk => {
    if (legs.length === 0) {
      return {
        maxLoss: 0,
        maxGain: 0,
        breakevens: [],
        probabilityOfProfit: 0,
        expectedValue: 0,
        riskRewardRatio: 0
      };
    }

    const currentPrice = canvas.currentPrice;
    const minPrice = currentPrice * 0.7;
    const maxPrice = currentPrice * 1.3;
    const step = (maxPrice - minPrice) / 100;
    
    let maxLoss = 0;
    let maxGain = 0;
    const breakevens = [];
    
    // Find max loss/gain and breakevens
    for (let price = minPrice; price <= maxPrice; price += step) {
      const pl = calculatePLAtPrice(legs, price);
      maxLoss = Math.min(maxLoss, pl);
      maxGain = Math.max(maxGain, pl);
      
      // Find breakeven points (where P&L crosses zero)
      if (Math.abs(pl) < 0.5) {
        breakevens.push(price);
      }
    }
    
    // Remove duplicate breakevens (within 1% of each other)
    const uniqueBreakevens = breakevens.filter((be, index) => {
      return index === 0 || Math.abs(be - breakevens[index - 1]) > currentPrice * 0.01;
    });
    
    const probabilityOfProfit = 65; // Mock - would need options pricing model
    const expectedValue = (maxGain + maxLoss) / 2; // Simplified
    const riskRewardRatio = Math.abs(maxGain / maxLoss) || 0;

    return {
      maxLoss: Math.abs(maxLoss),
      maxGain,
      breakevens: uniqueBreakevens.slice(0, 3), // Limit to 3 breakevens
      probabilityOfProfit,
      expectedValue,
      riskRewardRatio
    };
  };

  const detectedStrategy = detectStrategy(canvas.legs);
  const plChartData = generatePLData(canvas.legs);
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

    const legs: StrategyLeg[] = [];
    const currentPrice = canvas.currentPrice;
    
    // Generate realistic premiums based on current price and strategy
    const generatePremium = (strike: number, type: 'call' | 'put', action: 'buy' | 'sell') => {
      const distance = Math.abs(strike - currentPrice);
      const basePremium = Math.max(0.5, distance * 0.1 + Math.random() * 2);
      return action === 'sell' ? basePremium : basePremium + Math.random() * 1;
    };

    switch (strategyId) {
      // Single Leg Strategies
      case 'long-call':
        legs.push({
          id: 'leg-1', type: 'call', action: 'buy', 
          strike: Math.round(currentPrice), 
          expiration: selectedExpiration, 
          quantity: 1, 
          premium: generatePremium(currentPrice, 'call', 'buy')
        });
        break;
        
      case 'long-put':
        legs.push({
          id: 'leg-1', type: 'put', action: 'buy', 
          strike: Math.round(currentPrice), 
          expiration: selectedExpiration, 
          quantity: 1, 
          premium: generatePremium(currentPrice, 'put', 'buy')
        });
        break;
        
      case 'short-call':
        legs.push({
          id: 'leg-1', type: 'call', action: 'sell', 
          strike: Math.round(currentPrice * 1.02), 
          expiration: selectedExpiration, 
          quantity: 1, 
          premium: generatePremium(currentPrice * 1.02, 'call', 'sell')
        });
        break;
        
      case 'short-put':
        legs.push({
          id: 'leg-1', type: 'put', action: 'sell', 
          strike: Math.round(currentPrice * 0.98), 
          expiration: selectedExpiration, 
          quantity: 1, 
          premium: generatePremium(currentPrice * 0.98, 'put', 'sell')
        });
        break;

      // Two Leg Strategies
      case 'long-strangle':
        legs.push(
          { id: 'leg-1', type: 'call', action: 'buy', strike: Math.round(currentPrice * 1.05), expiration: selectedExpiration, quantity: 1, premium: generatePremium(currentPrice * 1.05, 'call', 'buy') },
          { id: 'leg-2', type: 'put', action: 'buy', strike: Math.round(currentPrice * 0.95), expiration: selectedExpiration, quantity: 1, premium: generatePremium(currentPrice * 0.95, 'put', 'buy') }
        );
        break;
        
      case 'short-strangle':
        legs.push(
          { id: 'leg-1', type: 'call', action: 'sell', strike: Math.round(currentPrice * 1.05), expiration: selectedExpiration, quantity: 1, premium: generatePremium(currentPrice * 1.05, 'call', 'sell') },
          { id: 'leg-2', type: 'put', action: 'sell', strike: Math.round(currentPrice * 0.95), expiration: selectedExpiration, quantity: 1, premium: generatePremium(currentPrice * 0.95, 'put', 'sell') }
        );
        break;
        
      case 'long-straddle':
        legs.push(
          { id: 'leg-1', type: 'call', action: 'buy', strike: Math.round(currentPrice), expiration: selectedExpiration, quantity: 1, premium: generatePremium(currentPrice, 'call', 'buy') },
          { id: 'leg-2', type: 'put', action: 'buy', strike: Math.round(currentPrice), expiration: selectedExpiration, quantity: 1, premium: generatePremium(currentPrice, 'put', 'buy') }
        );
        break;
        
      case 'short-straddle':
        legs.push(
          { id: 'leg-1', type: 'call', action: 'sell', strike: Math.round(currentPrice), expiration: selectedExpiration, quantity: 1, premium: generatePremium(currentPrice, 'call', 'sell') },
          { id: 'leg-2', type: 'put', action: 'sell', strike: Math.round(currentPrice), expiration: selectedExpiration, quantity: 1, premium: generatePremium(currentPrice, 'put', 'sell') }
        );
        break;

      // Spread Strategies
      case 'bull-call-spread':
        legs.push(
          { id: 'leg-1', type: 'call', action: 'buy', strike: Math.round(currentPrice * 0.98), expiration: selectedExpiration, quantity: 1, premium: generatePremium(currentPrice * 0.98, 'call', 'buy') },
          { id: 'leg-2', type: 'call', action: 'sell', strike: Math.round(currentPrice * 1.02), expiration: selectedExpiration, quantity: 1, premium: generatePremium(currentPrice * 1.02, 'call', 'sell') }
        );
        break;
        
      case 'bear-call-spread':
        legs.push(
          { id: 'leg-1', type: 'call', action: 'sell', strike: Math.round(currentPrice * 0.98), expiration: selectedExpiration, quantity: 1, premium: generatePremium(currentPrice * 0.98, 'call', 'sell') },
          { id: 'leg-2', type: 'call', action: 'buy', strike: Math.round(currentPrice * 1.02), expiration: selectedExpiration, quantity: 1, premium: generatePremium(currentPrice * 1.02, 'call', 'buy') }
        );
        break;
        
      case 'bull-put-spread':
        legs.push(
          { id: 'leg-1', type: 'put', action: 'sell', strike: Math.round(currentPrice * 1.02), expiration: selectedExpiration, quantity: 1, premium: generatePremium(currentPrice * 1.02, 'put', 'sell') },
          { id: 'leg-2', type: 'put', action: 'buy', strike: Math.round(currentPrice * 0.98), expiration: selectedExpiration, quantity: 1, premium: generatePremium(currentPrice * 0.98, 'put', 'buy') }
        );
        break;
        
      case 'bear-put-spread':
        legs.push(
          { id: 'leg-1', type: 'put', action: 'buy', strike: Math.round(currentPrice * 1.02), expiration: selectedExpiration, quantity: 1, premium: generatePremium(currentPrice * 1.02, 'put', 'buy') },
          { id: 'leg-2', type: 'put', action: 'sell', strike: Math.round(currentPrice * 0.98), expiration: selectedExpiration, quantity: 1, premium: generatePremium(currentPrice * 0.98, 'put', 'sell') }
        );
        break;

      // Four Leg Strategies
      case 'iron-condor':
        legs.push(
          { id: 'leg-1', type: 'call', action: 'sell', strike: Math.round(currentPrice * 1.02), expiration: selectedExpiration, quantity: 1, premium: generatePremium(currentPrice * 1.02, 'call', 'sell') },
          { id: 'leg-2', type: 'call', action: 'buy', strike: Math.round(currentPrice * 1.05), expiration: selectedExpiration, quantity: 1, premium: generatePremium(currentPrice * 1.05, 'call', 'buy') },
          { id: 'leg-3', type: 'put', action: 'sell', strike: Math.round(currentPrice * 0.98), expiration: selectedExpiration, quantity: 1, premium: generatePremium(currentPrice * 0.98, 'put', 'sell') },
          { id: 'leg-4', type: 'put', action: 'buy', strike: Math.round(currentPrice * 0.95), expiration: selectedExpiration, quantity: 1, premium: generatePremium(currentPrice * 0.95, 'put', 'buy') }
        );
        break;
        
      case 'iron-butterfly':
        legs.push(
          { id: 'leg-1', type: 'call', action: 'buy', strike: Math.round(currentPrice * 0.97), expiration: selectedExpiration, quantity: 1, premium: generatePremium(currentPrice * 0.97, 'call', 'buy') },
          { id: 'leg-2', type: 'call', action: 'sell', strike: Math.round(currentPrice), expiration: selectedExpiration, quantity: 2, premium: generatePremium(currentPrice, 'call', 'sell') },
          { id: 'leg-3', type: 'call', action: 'buy', strike: Math.round(currentPrice * 1.03), expiration: selectedExpiration, quantity: 1, premium: generatePremium(currentPrice * 1.03, 'call', 'buy') },
          { id: 'leg-4', type: 'put', action: 'sell', strike: Math.round(currentPrice), expiration: selectedExpiration, quantity: 1, premium: generatePremium(currentPrice, 'put', 'sell') }
        );
        break;

      // Calendar Spreads
      case 'call-calendar':
        legs.push(
          { id: 'leg-1', type: 'call', action: 'sell', strike: Math.round(currentPrice), expiration: MOCK_EXPIRATIONS[0], quantity: 1, premium: generatePremium(currentPrice, 'call', 'sell') },
          { id: 'leg-2', type: 'call', action: 'buy', strike: Math.round(currentPrice), expiration: MOCK_EXPIRATIONS[1], quantity: 1, premium: generatePremium(currentPrice, 'call', 'buy') }
        );
        break;
        
      case 'put-calendar':
        legs.push(
          { id: 'leg-1', type: 'put', action: 'sell', strike: Math.round(currentPrice), expiration: MOCK_EXPIRATIONS[0], quantity: 1, premium: generatePremium(currentPrice, 'put', 'sell') },
          { id: 'leg-2', type: 'put', action: 'buy', strike: Math.round(currentPrice), expiration: MOCK_EXPIRATIONS[1], quantity: 1, premium: generatePremium(currentPrice, 'put', 'buy') }
        );
        break;

      // Butterfly Spreads
      case 'call-butterfly':
        legs.push(
          { id: 'leg-1', type: 'call', action: 'buy', strike: Math.round(currentPrice * 0.95), expiration: selectedExpiration, quantity: 1, premium: generatePremium(currentPrice * 0.95, 'call', 'buy') },
          { id: 'leg-2', type: 'call', action: 'sell', strike: Math.round(currentPrice), expiration: selectedExpiration, quantity: 2, premium: generatePremium(currentPrice, 'call', 'sell') },
          { id: 'leg-3', type: 'call', action: 'buy', strike: Math.round(currentPrice * 1.05), expiration: selectedExpiration, quantity: 1, premium: generatePremium(currentPrice * 1.05, 'call', 'buy') }
        );
        break;
        
      case 'put-butterfly':
        legs.push(
          { id: 'leg-1', type: 'put', action: 'buy', strike: Math.round(currentPrice * 1.05), expiration: selectedExpiration, quantity: 1, premium: generatePremium(currentPrice * 1.05, 'put', 'buy') },
          { id: 'leg-2', type: 'put', action: 'sell', strike: Math.round(currentPrice), expiration: selectedExpiration, quantity: 2, premium: generatePremium(currentPrice, 'put', 'sell') },
          { id: 'leg-3', type: 'put', action: 'buy', strike: Math.round(currentPrice * 0.95), expiration: selectedExpiration, quantity: 1, premium: generatePremium(currentPrice * 0.95, 'put', 'buy') }
        );
        break;

      default:
        // For any unmatched strategy, create a basic long call
        legs.push({
          id: 'leg-1', type: 'call', action: 'buy', 
          strike: Math.round(currentPrice), 
          expiration: selectedExpiration, 
          quantity: 1, 
          premium: generatePremium(currentPrice, 'call', 'buy')
        });
        break;
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
                      <Trash2 className="w-4 h-4 mr-2" />
                      Clear
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => addLeg('call', 'buy')}
                      className="bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Buy Call
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => addLeg('call', 'sell')}
                      className="bg-red-50 border-red-200 text-red-700 hover:bg-red-100"
                    >
                      <Minus className="w-4 h-4 mr-1" />
                      Sell Call
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => addLeg('put', 'buy')}
                      className="bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Buy Put
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => addLeg('put', 'sell')}
                      className="bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100"
                    >
                      <Minus className="w-4 h-4 mr-1" />
                      Sell Put
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

          {/* Right Sidebar - Analysis & Charts */}
          <div className="lg:col-span-1 space-y-6">
            {/* P&L Chart */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center">
                <BarChart3 className="w-5 h-5 mr-2" />
                P&L Chart
              </h3>

              {canvas.legs.length > 0 && plChartData.labels.length > 0 ? (
                <div className="h-64">
                  <Line 
                    data={plChartData} 
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: {
                          display: false
                        },
                        tooltip: {
                          callbacks: {
                            label: function(context) {
                              return `P&L: $${context.parsed.y.toFixed(2)}`;
                            },
                            title: function(context) {
                              return `Stock Price: $${context[0].label}`;
                            }
                          }
                        }
                      },
                      scales: {
                        x: {
                          title: {
                            display: true,
                            text: 'Stock Price ($)'
                          }
                        },
                        y: {
                          title: {
                            display: true,
                            text: 'P&L ($)'
                          },
                          grid: {
                            color: function(context) {
                              return context.tick.value === 0 ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.1)';
                            }
                          }
                        }
                      },
                      elements: {
                        point: {
                          radius: 0
                        }
                      }
                    }}
                  />
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-gray-500">
                  <div className="text-center">
                    <BarChart3 className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                    <p className="text-sm">Add strategy legs to see P&L chart</p>
                  </div>
                </div>
              )}
            </Card>

            {/* Risk Analysis */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center">
                <Calculator className="w-5 h-5 mr-2" />
                Risk Analysis
              </h3>

              {canvas.legs.length > 0 ? (
                <div className="space-y-4">
                  {/* Risk Metrics Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <div className="text-xs text-red-600 font-medium">Max Loss</div>
                      <div className="text-lg font-bold text-red-700">${riskMetrics.maxLoss.toFixed(2)}</div>
                    </div>
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                      <div className="text-xs text-green-600 font-medium">Max Gain</div>
                      <div className="text-lg font-bold text-green-700">${riskMetrics.maxGain.toFixed(2)}</div>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <div className="text-xs text-blue-600 font-medium">Risk/Reward</div>
                      <div className="text-lg font-bold text-blue-700">{riskMetrics.riskRewardRatio.toFixed(2)}</div>
                    </div>
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                      <div className="text-xs text-purple-600 font-medium">Win Rate</div>
                      <div className="text-lg font-bold text-purple-700">{riskMetrics.probabilityOfProfit}%</div>
                    </div>
                  </div>

                  {/* Breakevens */}
                  {riskMetrics.breakevens.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Breakeven Points</h4>
                      <div className="space-y-1">
                        {riskMetrics.breakevens.map((be, index) => (
                          <div key={index} className="flex items-center justify-between bg-gray-50 rounded px-3 py-2">
                            <span className="text-sm text-gray-600">BE{index + 1}</span>
                            <span className="font-medium">${be.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Current P&L */}
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <div className="text-xs text-gray-600 font-medium mb-1">Current P&L</div>
                    <div className={`text-lg font-bold ${calculatePLAtPrice(canvas.legs, canvas.currentPrice) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {calculatePLAtPrice(canvas.legs, canvas.currentPrice) >= 0 ? '+' : ''}${calculatePLAtPrice(canvas.legs, canvas.currentPrice).toFixed(2)}
                    </div>
                    <div className="text-xs text-gray-500">at ${canvas.currentPrice}</div>
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
