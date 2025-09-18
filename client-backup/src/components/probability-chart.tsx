import { ResponsiveContainer, XAxis, YAxis, ReferenceLine, Tooltip, Area, AreaChart } from "recharts";
import { memo, useMemo } from "react";
import type { TickerWithPosition } from "@shared/schema";

interface ProbabilityChartProps {
  ticker: TickerWithPosition;
}

export const ProbabilityChart = memo(function ProbabilityChart({ ticker }: ProbabilityChartProps) {
  const { position, currentPrice } = ticker;

  // Validate position data
  if (!position || !position.longPutStrike || !position.longCallStrike || !position.upperBreakeven || !position.lowerBreakeven) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p>Probability data unavailable</p>
      </div>
    );
  }

  // Additional validation for required fields
  if (!position.impliedVolatility || !position.daysToExpiry || !currentPrice) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p>Missing required data for probability calculation</p>
      </div>
    );
  }

  // Enhanced probability distribution with multiple statistical measures  
  const { data, probabilities } = useMemo(() => {
    try {
      const data = [];
      const impliedVol = position.impliedVolatility / 100;
      const timeToExpiry = position.daysToExpiry / 365;
      const currentStock = currentPrice;
      
      // Standard deviation for the expected move
      const stdDev = currentStock * impliedVol * Math.sqrt(timeToExpiry);
      
      // Generate price range around current price (extended for better visualization)
      const priceRange = stdDev * 4; // 4 standard deviations for better tail visibility
      const startPrice = currentStock - priceRange;
      const endPrice = currentStock + priceRange;
      const numPoints = 1000; // Even more data points for ultra-smooth curve
      const step = (endPrice - startPrice) / numPoints;

      for (let price = startPrice; price <= endPrice; price += step) {
        const zScore = (price - currentStock) / stdDev;
        const probability = (1 / (stdDev * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * zScore * zScore);
        
        // Determine if this price point would be profitable
        const isProfitable = price <= position.lowerBreakeven || price >= position.upperBreakeven;
        const profitLoss = isProfitable ? 
          (price <= position.lowerBreakeven ? 
            Math.max(position.longPutStrike - price, 0) - (position.longPutPremium + position.longCallPremium) :
            Math.max(price - position.longCallStrike, 0) - (position.longPutPremium + position.longCallPremium)
          ) : -(position.longPutPremium + position.longCallPremium);
        
        data.push({
          price: Math.round(price * 100) / 100,
          probability: probability * 1000, // Scale down to prevent overflow
          normalizedProbability: probability,
          isProfitable,
          profitLoss: Math.round(profitLoss * 100) / 100,
          zScore: Math.round(zScore * 100) / 100,
        });
      }

      // Calculate probabilities
      const lowerZ = (position.lowerBreakeven - currentStock) / stdDev;
      const upperZ = (position.upperBreakeven - currentStock) / stdDev;
      
      // Improved normal CDF approximation (Abramowitz and Stegun)
      const normalCDF = (z: number) => {
        const sign = z >= 0 ? 1 : -1;
        const absZ = Math.abs(z);
        const a1 = 0.254829592;
        const a2 = -0.284496736;
        const a3 = 1.421413741;
        const a4 = -1.453152027;
        const a5 = 1.061405429;
        const p = 0.3275911;
        const t = 1.0 / (1.0 + p * absZ);
        const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absZ * absZ);
        return 0.5 * (1.0 + sign * y);
      };
      
      const probBelowLower = normalCDF(lowerZ);
      const probAboveUpper = 1 - normalCDF(upperZ);
      const probBetween = normalCDF(upperZ) - normalCDF(lowerZ);
      
      // Find max probability price
      const maxProbPrice = currentStock;
      
      const probabilities = {
        probBelowLower: probBelowLower * 100,
        probAboveUpper: probAboveUpper * 100,
        probBetween: probBetween * 100,
        probOutside: (probBelowLower + probAboveUpper) * 100,
        maxProbPrice: maxProbPrice
      };

      return { data, probabilities };
    } catch (error) {
      console.error('Error calculating probability data:', error);
      return { 
        data: [], 
        probabilities: { 
          probOutside: 0, 
          maxProbPrice: currentPrice 
        } 
      };
    }

  }, [position.impliedVolatility, position.daysToExpiry, currentPrice, position.lowerBreakeven, position.upperBreakeven, position.longPutStrike, position.longCallStrike, position.longPutPremium, position.longCallPremium]);

  // Additional validation for empty data
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p>Unable to generate probability data</p>
      </div>
    );
  }

  const customTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0].payload;
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg min-w-48">
          <p className="text-sm font-bold text-gray-900 mb-2">${label}</p>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-600">Probability:</span>
              <span className="font-medium">{(dataPoint.normalizedProbability * 100).toFixed(3)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Z-Score:</span>
              <span className="font-medium">{dataPoint.zScore}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">P&L:</span>
              <span className={`font-medium ${dataPoint.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {dataPoint.profitLoss >= 0 ? '+' : ''}${dataPoint.profitLoss}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Outcome:</span>
              <span className={`font-medium ${dataPoint.isProfitable ? 'text-green-600' : 'text-red-600'}`}>
                {dataPoint.isProfitable ? 'Profitable' : 'Max Loss'}
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full h-full bg-gradient-to-br from-slate-50 to-white flex flex-col">
      {/* Enhanced Probability Distribution Chart */}
      <div className="flex-1 mb-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
            <XAxis 
              dataKey="price" 
              type="number" 
              scale="linear" 
              domain={['dataMin', 'dataMax']}
              tick={{ fontSize: 11, fill: '#64748b', fontWeight: 500 }}
              tickFormatter={(value) => `$${Math.round(value)}`}
              axisLine={false}
              tickLine={false}
              className="text-slate-600"
            />
            <YAxis 
              hide 
              domain={[0, 'dataMax']}
            />
            <Tooltip content={customTooltip} />
            
            {/* Enhanced gradient with better colors and smoother transitions */}
            <defs>
              <linearGradient id="probabilityGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.9}/>
                <stop offset="30%" stopColor="#a855f7" stopOpacity={0.7}/>
                <stop offset="70%" stopColor="#c084fc" stopOpacity={0.4}/>
                <stop offset="100%" stopColor="#e9d5ff" stopOpacity={0.1}/>
              </linearGradient>
              
              {/* Subtle shadow effect */}
              <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#8b5cf6" floodOpacity="0.1"/>
              </filter>
            </defs>
            
            <Area
              type="monotoneX"
              dataKey="probability"
              stroke="#7c3aed"
              fill="url(#probabilityGradient)"
              strokeWidth={2}
              dot={false}
              connectNulls={true}
              filter="url(#shadow)"
              style={{
                filter: 'drop-shadow(0 2px 4px rgba(139, 92, 246, 0.1))'
              }}
            />
            
            {/* Enhanced current price line with better styling */}
            <ReferenceLine 
              x={currentPrice} 
              stroke="#f59e0b" 
              strokeWidth={2.5} 
              strokeDasharray="6 4"
              label={{ 
                value: `$${currentPrice.toFixed(2)}`, 
                position: "top", 
                fill: "#f59e0b", 
                fontSize: 11,
                fontWeight: 600,
                offset: 8
              }}
            />
            
            {/* Enhanced breakeven lines with better styling */}
            <ReferenceLine 
              x={position.lowerBreakeven} 
              stroke="#22c55e" 
              strokeWidth={2} 
              strokeDasharray="3 3"
              label={{ value: `BE: $${position.lowerBreakeven.toFixed(2)}`, position: "top", fill: "#22c55e", fontSize: 10 }}
            />
            
            {/* Upper breakeven line - enhanced styling */}
            <ReferenceLine 
              x={position.upperBreakeven} 
              stroke="#22c55e" 
              strokeWidth={2} 
              strokeDasharray="4 2"
              label={{ 
                value: `BE: $${position.upperBreakeven.toFixed(2)}`, 
                position: "top", 
                fill: "#22c55e", 
                fontSize: 10,
                fontWeight: 500,
                offset: 5
              }}
            />
            
            {/* Strike lines with enhanced styling */}
            <ReferenceLine 
              x={position.longPutStrike} 
              stroke="#ef4444" 
              strokeWidth={1.5} 
              strokeDasharray="2 2"
              label={{ 
                value: `Put: $${position.longPutStrike}`, 
                position: "top", 
                fill: "#ef4444", 
                fontSize: 9,
                fontWeight: 500
              }}
            />
            <ReferenceLine 
              x={position.longCallStrike} 
              stroke="#3b82f6" 
              strokeWidth={1.5} 
              strokeDasharray="2 2"
              label={{ 
                value: `Call: $${position.longCallStrike}`, 
                position: "top", 
                fill: "#3b82f6", 
                fontSize: 9,
                fontWeight: 500
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Enhanced Key Metrics with better styling */}
      <div className="grid grid-cols-2 gap-6 px-4 pb-3">
        <div className="text-left">
          <div className="text-xs font-semibold text-purple-600 mb-1 uppercase tracking-wide">Profit Probability</div>
          <div className="text-2xl font-bold text-purple-700">
            {probabilities.probOutside.toFixed(1)}%
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs font-semibold text-slate-600 mb-1 uppercase tracking-wide">Max Probability</div>
          <div className="text-xl font-bold text-slate-800">
            At ${probabilities.maxProbPrice.toFixed(2)}
          </div>
        </div>
      </div>
    </div>
  );
});