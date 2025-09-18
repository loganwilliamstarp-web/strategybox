import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, ReferenceLine, Tooltip, CartesianGrid, Area, AreaChart, Legend } from "recharts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Maximize2, X } from "lucide-react";
import { useState, useMemo, memo } from "react";
import type { TickerWithPosition } from "@shared/schema";

interface PLChartProps {
  ticker: TickerWithPosition;
}

export const PLChart = memo(function PLChart({ ticker }: PLChartProps) {
  const { position, currentPrice } = ticker;
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Get expected weekly range if available
  const weeklyLow = position.expectedMove?.weeklyLow ? parseFloat(position.expectedMove.weeklyLow.toString()) : null;
  const weeklyHigh = position.expectedMove?.weeklyHigh ? parseFloat(position.expectedMove.weeklyHigh.toString()) : null;

  // Validate position data
  if (!position || !position.longPutStrike || !position.longCallStrike || !position.upperBreakeven || !position.lowerBreakeven) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p>Chart data unavailable</p>
      </div>
    );
  }

  // Get strategy-specific parameters for optimal chart visualization
  const getStrategyParameters = (strategyType: string) => {
    switch (strategyType) {
      case 'long_strangle':
        // Focus on breakeven range ±10 for long strangles
        const avgBreakeven = (position.lowerBreakeven + position.upperBreakeven) / 2;
        const breakevenRange = Math.abs(position.upperBreakeven - position.lowerBreakeven);
        return {
          optimalDaysToExpiry: 45,      // Typically held 4-8 weeks
          timeHorizonMultiplier: 1.0,   // Use base window, no multiplier
          priceWindowBase: Math.max(breakevenRange / 2 + 10, 15), // Breakeven range + 10 padding
          timeDecayRate: 0.8            // Slower time decay modeling for longer holds
        };
      case 'iron_condor':
        return {
          optimalDaysToExpiry: 14,      // Typically held 1-3 weeks
          timeHorizonMultiplier: 1.2,   // Narrower price window for range-bound strategy
          // Use short spread width for Iron Condor with fallback to long spread
          priceWindowBase: Math.max(
            position.shortCallStrike && position.shortPutStrike 
              ? Math.abs(position.shortCallStrike - position.shortPutStrike) * 1.0
              : Math.abs(position.longCallStrike - position.longPutStrike) * 1.0,
            12
          ),
          timeDecayRate: 1.2            // Faster time decay modeling for shorter holds
        };
      case 'short_strangle':
        return {
          optimalDaysToExpiry: 21,      // Typically held 2-4 weeks
          timeHorizonMultiplier: 1.0,   // Same base window as long strangle, no multiplier
          priceWindowBase: Math.max(Math.abs(position.longCallStrike - position.longPutStrike) * 1.3, 15),
          timeDecayRate: 1.0            // Standard time decay
        };
      case 'butterfly_spread':
        return {
          optimalDaysToExpiry: 10,      // Typically held 1-2 weeks
          timeHorizonMultiplier: 1.0,   // Narrow price window around center strike
          // Center the window on the middle strike and derive width from wing spread
          priceWindowBase: Math.max(Math.abs(position.longCallStrike - position.longPutStrike) * 0.6, 8),
          timeDecayRate: 1.3            // Faster time decay for short-term strategy
        };
      case 'diagonal_calendar':
        return {
          optimalDaysToExpiry: 30,      // Typically held 3-6 weeks
          timeHorizonMultiplier: 1.5,   // Moderate price window
          priceWindowBase: Math.max(Math.abs(position.longCallStrike - position.longPutStrike) * 1.2, 15),
          timeDecayRate: 0.9            // Slightly slower time decay
        };
      default:
        return {
          optimalDaysToExpiry: 30,
          timeHorizonMultiplier: 1.5,
          priceWindowBase: Math.max(Math.abs(position.longCallStrike - position.longPutStrike) * 1.5, 15),
          timeDecayRate: 1.0
        };
    }
  };

  // Generate P&L curve data with strategy-specific optimization
  const generatePLData = (isExpandedView: boolean = false) => {
    const data = [];
    
    // Normalize strategy type to handle any casing/naming inconsistencies
    const normalizedStrategyType = String(position.strategyType || '').toLowerCase().replace(/\s+/g, '_');
    
    // Debug logging to track strategy type issues
    console.log(`🎯 P&L Chart Strategy Debug:`, {
      original: position.strategyType,
      normalized: normalizedStrategyType,
      position: { longPutStrike: position.longPutStrike, longCallStrike: position.longCallStrike }
    });
    
    // Get strategy-specific parameters
    const strategyParams = getStrategyParameters(normalizedStrategyType);
    const currentPriceNum = parseFloat(currentPrice.toString());
    
    // Calculate strategy-appropriate price window
    const baseWindow = strategyParams.priceWindowBase;
    let priceWindow;
    
    if (isExpandedView && normalizedStrategyType === 'short_strangle') {
      // Use adaptive ±25 range for short strangle expanded view, but ensure it's proportional to stock price
      const adaptiveWindow = Math.max(25, currentPriceNum * 0.08); // At least ±25 or ±8% of stock price
      priceWindow = Math.min(adaptiveWindow, currentPriceNum * 0.4); // Cap at 40% to avoid extreme ranges
    } else {
      priceWindow = isExpandedView 
        ? baseWindow * strategyParams.timeHorizonMultiplier * 1.5  // Wider view for modal
        : baseWindow * strategyParams.timeHorizonMultiplier; // Strategy-optimized view for card
    }
    
    const startPrice = Math.max(0.01, currentPriceNum - priceWindow); // Prevent negative prices
    const endPrice = currentPriceNum + priceWindow;
    const step = (endPrice - startPrice) / 80; // More data points for smoother curves

    // Calculate strategy-specific time decay - ALWAYS use user's actual expiration date
    const actualDaysToExpiry = position.daysToExpiry ?? 30; // Only fallback if no user date set
    const timeDecayFactor = Math.max(0.1, Math.min(1.0, (actualDaysToExpiry / (strategyParams.optimalDaysToExpiry || 30)) * strategyParams.timeDecayRate));

    for (let price = startPrice; price <= endPrice; price += step) {
      let profitAtExpiry;
      let profitCurrent;
      
      switch (normalizedStrategyType) {
        case 'long_strangle':
          // U-shaped curve - profit at extremes, loss in middle
          // Expiration value calculation using proper long strangle formula
          const putIntrinsicValue = Math.max(position.longPutStrike - price, 0);
          const callIntrinsicValue = Math.max(price - position.longCallStrike, 0);
          const totalPremiumPaid = position.longPutPremium + position.longCallPremium;
          
          // P&L = (Put Intrinsic + Call Intrinsic) - Total Premium Paid
          profitAtExpiry = putIntrinsicValue + callIntrinsicValue - totalPremiumPaid;
          
          // Current value (pink line) - includes time decay
          const putIntrinsic = Math.max(position.longPutStrike - price, 0);
          const callIntrinsic = Math.max(price - position.longCallStrike, 0);
          const putTimeValue = Math.max(0, (position.longPutPremium - putIntrinsic) * timeDecayFactor);
          const callTimeValue = Math.max(0, (position.longCallPremium - callIntrinsic) * timeDecayFactor);
          profitCurrent = (putIntrinsic + putTimeValue + callIntrinsic + callTimeValue) - (position.longPutPremium + position.longCallPremium);
          break;

        case 'short_strangle':
          // Inverted U-shaped curve - profit in middle (collect premium), unlimited loss at extremes
          const shortPutStrike = position.shortPutStrike || position.longPutStrike; // Use actual short strikes
          const shortCallStrike = position.shortCallStrike || position.longCallStrike;
          const putPremium = position.shortPutPremium || Math.abs(position.longPutPremium || 0);
          const callPremium = position.shortCallPremium || Math.abs(position.longCallPremium || 0);
          const premiumCollected = putPremium + callPremium; // Ensure no NaN values
          
          if (price <= shortPutStrike) {
            // Below put strike - unlimited loss potential
            const putAssignment = shortPutStrike - price; // Amount we pay above market
            profitAtExpiry = premiumCollected - putAssignment;
            profitCurrent = profitAtExpiry * timeDecayFactor;
          } else if (price >= shortCallStrike) {
            // Above call strike - unlimited loss potential  
            const callAssignment = price - shortCallStrike; // Amount we pay above strike
            profitAtExpiry = premiumCollected - callAssignment;
            profitCurrent = profitAtExpiry * timeDecayFactor;
          } else {
            // Between strikes - maximum profit (keep all premium)
            profitAtExpiry = premiumCollected;
            profitCurrent = profitAtExpiry * timeDecayFactor;
          }
          break;

        case 'butterfly_spread':
          // Mountain-shaped curve - profit at center, loss at wings
          const centerStrike = (position.longPutStrike + position.longCallStrike) / 2;
          const wingSpread = position.longCallStrike - position.longPutStrike;
          const butterflyNetDebit = (position.longPutPremium + position.longCallPremium) - ((position.shortPutPremium || 0) + (position.shortCallPremium || 0));
          
          if (price <= position.longPutStrike) {
            profitAtExpiry = Math.max(position.longPutStrike - price, 0) - butterflyNetDebit;
            profitCurrent = profitAtExpiry * timeDecayFactor;
          } else if (price >= position.longCallStrike) {
            profitAtExpiry = Math.max(price - position.longCallStrike, 0) - butterflyNetDebit;
            profitCurrent = profitAtExpiry * timeDecayFactor;
          } else {
            // Between strikes - triangular profit
            const distanceFromCenter = Math.abs(price - centerStrike);
            profitAtExpiry = (wingSpread / 2) - distanceFromCenter - butterflyNetDebit;
            profitCurrent = profitAtExpiry * timeDecayFactor;
          }
          break;

        case 'diagonal_calendar':
          // Diagonal Calendar Spread - bell-shaped curve with max profit near center
          const diagonalCenterStrike = (position.longPutStrike + position.longCallStrike) / 2;
          const diagonalNetDebit = (position.longPutPremium + position.longCallPremium) - ((position.shortPutPremium || 0) + (position.shortCallPremium || 0));
          const maxProfit = position.maxProfit || diagonalNetDebit * 2; // Estimated max profit
          const distanceFromCenter = Math.abs(price - diagonalCenterStrike);
          const strikeRange = Math.abs(position.longCallStrike - position.longPutStrike) || 10;
          
          // Bell-shaped curve: max profit at center, tapering to max loss at extremes
          if (distanceFromCenter <= strikeRange / 2) {
            // Near center - profit zone
            const profitFactor = 1 - (distanceFromCenter / (strikeRange / 2));
            profitAtExpiry = (maxProfit * profitFactor) - diagonalNetDebit;
            profitCurrent = profitAtExpiry * timeDecayFactor;
          } else {
            // Far from center - approaches max loss
            const lossFactor = Math.min((distanceFromCenter - strikeRange / 2) / (strikeRange * 2), 1);
            profitAtExpiry = -diagonalNetDebit * (1 + lossFactor * 0.5);
            profitCurrent = profitAtExpiry * timeDecayFactor;
          }
          break;

        case 'iron_condor':
          // Iron Condor: defined profit/loss zones with max profit between short strikes
          const longPutIntrinsic = Math.max(position.longPutStrike - price, 0);
          const shortPutIntrinsic = Math.max((position.shortPutStrike || 0) - price, 0);
          const shortCallIntrinsic = Math.max(price - (position.shortCallStrike || 0), 0);
          const longCallIntrinsic = Math.max(price - position.longCallStrike, 0);
          
          // Calculate net option values (we own long options, sold short options)
          const putSpreadValue = longPutIntrinsic - shortPutIntrinsic;
          const callSpreadValue = longCallIntrinsic - shortCallIntrinsic;
          const totalOptionValue = putSpreadValue + callSpreadValue;
          
          // Iron Condor net credit (what we received upfront)
          const netCredit = ((position.shortPutPremium || 0) - position.longPutPremium) + 
                           ((position.shortCallPremium || 0) - position.longCallPremium);
          
          // P&L = Net Credit - Option Values
          profitAtExpiry = netCredit - totalOptionValue;
          
          // Current profit includes remaining time value (beneficial for Iron Condor)
          if (position.daysToExpiry > 0) {
            const shortPutTimeValue = Math.max(0, ((position.shortPutPremium || 0) - shortPutIntrinsic) * timeDecayFactor);
            const shortCallTimeValue = Math.max(0, ((position.shortCallPremium || 0) - shortCallIntrinsic) * timeDecayFactor);
            const longPutTimeValue = Math.max(0, (position.longPutPremium - longPutIntrinsic) * timeDecayFactor);
            const longCallTimeValue = Math.max(0, (position.longCallPremium - longCallIntrinsic) * timeDecayFactor);
            
            const netTimeValue = (shortPutTimeValue + shortCallTimeValue) - (longPutTimeValue + longCallTimeValue);
            const netCurrentValue = (shortPutIntrinsic + shortCallIntrinsic) - (longPutIntrinsic + longCallIntrinsic) - netTimeValue;
            profitCurrent = netCredit - netCurrentValue;
          } else {
            profitCurrent = profitAtExpiry;
          }
          break;

        default:
          // Default to long strangle with smooth U-shaped curve
          const defaultPutIntrinsic = Math.max(position.longPutStrike - price, 0);
          const defaultCallIntrinsic = Math.max(price - position.longCallStrike, 0);
          const defaultTotalPremium = position.longPutPremium + position.longCallPremium;
          
          // P&L = (Put Intrinsic + Call Intrinsic) - Total Premium Paid
          profitAtExpiry = defaultPutIntrinsic + defaultCallIntrinsic - defaultTotalPremium;
          
          const defaultPutTimeValue = Math.max(0, (position.longPutPremium - defaultPutIntrinsic) * timeDecayFactor);
          const defaultCallTimeValue = Math.max(0, (position.longCallPremium - defaultCallIntrinsic) * timeDecayFactor);
          profitCurrent = (defaultPutIntrinsic + defaultPutTimeValue + defaultCallIntrinsic + defaultCallTimeValue) - defaultTotalPremium;
      }

      // Convert to per-contract values (multiply by 100 since each contract = 100 shares)
      const profitAtExpiryPerContract = (profitAtExpiry || 0) * 100;
      const profitCurrentPerContract = (profitCurrent || 0) * 100;
      
      data.push({
        price: Math.round(price * 100) / 100,
        profitAtExpiry: Math.round(profitAtExpiryPerContract),
        profitCurrent: Math.round(profitCurrentPerContract), 
        // Separate profit and loss fills for better visualization
        profitFill: profitAtExpiryPerContract >= 0 ? Math.round(profitAtExpiryPerContract) : 0,
        lossFill: profitAtExpiryPerContract < 0 ? Math.round(profitAtExpiryPerContract) : 0,
      });
    }

    return data;
  };

  // Get strategy parameters for display
  const strategyParams = getStrategyParameters(position.strategyType);

  // Memoize chart data to prevent constant regeneration from price updates
  const data = useMemo(() => generatePLData(), [
    position.longPutStrike,
    position.longCallStrike,
    position.longPutPremium,
    position.longCallPremium,
    position.shortPutStrike,
    position.shortCallStrike,
    position.shortPutPremium,
    position.shortCallPremium,
    position.lowerBreakeven,
    position.upperBreakeven,
    position.strategyType,
    position.daysToExpiry,
    currentPrice
  ]);
  
  const expandedData = useMemo(() => generatePLData(true), [
    position.longPutStrike,
    position.longCallStrike,
    position.longPutPremium,
    position.longCallPremium,
    position.shortPutStrike,
    position.shortCallStrike,
    position.shortPutPremium,
    position.shortCallPremium,
    position.lowerBreakeven,
    position.upperBreakeven,
    position.strategyType,
    position.daysToExpiry,
    currentPrice
  ]);

  // Validate generated data
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p>Unable to generate chart data</p>
      </div>
    );
  }

  const customTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const expiryData = payload.find((p: any) => p.dataKey === 'profitAtExpiry');
      const currentData = payload.find((p: any) => p.dataKey === 'profitCurrent');
      
      const profitAtExpiry = expiryData?.value || 0;
      const profitCurrent = currentData?.value || 0;
      
      return (
        <div className="bg-white p-2 border border-gray-200 rounded shadow-lg">
          <p className="text-sm font-medium text-gray-900">${parseFloat(label).toFixed(2)}</p>
          <p className={`text-sm ${profitAtExpiry >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
            At Expiry: {profitAtExpiry >= 0 ? '+' : ''}${Math.round(profitAtExpiry)}
          </p>
          <p className={`text-sm ${profitCurrent >= 0 ? 'text-purple-600' : 'text-red-600'}`}>
            Current: {profitCurrent >= 0 ? '+' : ''}${Math.round(profitCurrent)}
          </p>
          <p className="text-xs text-gray-500 mt-1">Per contract</p>
        </div>
      );
    }
    return null;
  };

  const ChartComponent = ({ data: chartData, isModal = false }: { data: any[], isModal?: boolean }) => {
    // Use strategy-specific parameters for consistent domain calculation (matches generatePLData)
    const currentPriceNum = parseFloat(currentPrice.toString());
    const strategyParams = getStrategyParameters(position.strategyType);
    
    // Calculate strategy-appropriate price window (same logic as generatePLData)
    const baseWindow = strategyParams.priceWindowBase;
    let priceWindow;
    
    if (isModal && position.strategyType === 'short_strangle') {
      // Use adaptive ±25 range for short strangle expanded view, but ensure it's proportional to stock price
      const adaptiveWindow = Math.max(25, currentPriceNum * 0.08); // At least ±25 or ±8% of stock price
      priceWindow = Math.min(adaptiveWindow, currentPriceNum * 0.4); // Cap at 40% to avoid extreme ranges
    } else {
      priceWindow = isModal 
        ? baseWindow * strategyParams.timeHorizonMultiplier * 1.5
        : baseWindow * strategyParams.timeHorizonMultiplier;
    }
    
    const minPrice = currentPriceNum - priceWindow;
    const maxPrice = currentPriceNum + priceWindow;
    
    return (
      <div className="relative w-full h-full bg-white">
        {/* Time frame indicator for regular chart view */}
        {!isModal && (
          <div className="absolute top-2 left-2 z-10 text-xs text-muted-foreground bg-muted/80 backdrop-blur-sm px-2 py-1 rounded">
            {position.daysToExpiry ?? 0}d to expiration
          </div>
        )}
        
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
            {/* No grid - clean like the reference image */}
            
            <XAxis 
              dataKey="price" 
              type="number" 
              scale="linear" 
              domain={[minPrice, maxPrice]}
              tick={{ fontSize: 10, fill: '#6b7280' }}
              tickFormatter={(value) => `$${Math.round(value)}`}
              axisLine={false}
              tickLine={false}
              className="text-xs"
            />
            <YAxis 
              tick={{ fontSize: 10, fill: '#6b7280' }}
              tickFormatter={(value) => {
                const roundedValue = Math.round(value);
                if (roundedValue === 0) return '$0';
                const absValue = Math.abs(roundedValue);
                if (absValue >= 1000) {
                  return `${roundedValue >= 0 ? '+' : '-'}$${(absValue/1000).toFixed(1)}k`;
                } else {
                  return `${roundedValue >= 0 ? '+' : '-'}$${absValue}`;
                }
              }}
              axisLine={false}
              tickLine={false}
              domain={position.strategyType === 'short_strangle' 
                ? ['dataMin', 'dataMax + 200']  // For short strangle: limit negative range, expand positive
                : ['dataMin - 50', 'dataMax + 50']  // Standard domain for other strategies
              }
              className="text-xs"
            />
            <Tooltip content={customTooltip} />
            
            {/* Green profit fill area - matching the reference image */}
            <Area
              type="monotone"
              dataKey="profitAtExpiry"
              stroke="#10b981"
              strokeWidth={2}
              fill="#a7f3d0"
              fillOpacity={0.6}
              dot={false}
            />
            
            {/* Zero profit line - red horizontal line like reference */}
            <ReferenceLine y={0} stroke="#dc2626" strokeWidth={2} strokeDasharray="none" />
            
            {/* Current price line - yellow/orange vertical line */}
            <ReferenceLine 
              x={currentPrice} 
              stroke="#f59e0b" 
              strokeWidth={2}
              strokeDasharray="3 3"
              opacity={1}
            />
            
            {/* Breakeven lines - gray dotted lines like reference */}
            <ReferenceLine 
              x={position.lowerBreakeven} 
              stroke="#9ca3af" 
              strokeWidth={1}
              strokeDasharray="2 2"
              opacity={0.8}
            />
            <ReferenceLine 
              x={position.upperBreakeven} 
              stroke="#9ca3af" 
              strokeWidth={1}
              strokeDasharray="2 2"
              opacity={0.8}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  };

  return (
    <div className="relative w-full h-full">
      {/* Expand Modal Button */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="absolute top-2 right-2 z-10 bg-white/90 hover:bg-white shadow-sm"
            data-testid="chart-expand-modal"
          >
            <Maximize2 className="w-4 h-4 mr-1" />
            Expand
          </Button>
        </DialogTrigger>
        
        <DialogContent className="max-w-6xl w-[90vw] h-[80vh] p-0 flex flex-col">
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle className="text-xl font-semibold flex items-center gap-3">
              {ticker.symbol} {position.strategyType.replace('_', ' ').toUpperCase()} P&L Chart
              <span className="text-sm font-normal text-muted-foreground bg-muted px-2 py-1 rounded">
                {position.daysToExpiry ?? 0} days to expiration
              </span>
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 p-4 min-h-0">
            <ChartComponent data={expandedData} isModal={true} />
          </div>
        </DialogContent>
      </Dialog>

      {/* Regular chart view */}
      <ChartComponent data={data} />
    </div>
  );
});
