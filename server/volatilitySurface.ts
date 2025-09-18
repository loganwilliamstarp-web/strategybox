// Mock volatility surface data generator
// In production, this would integrate with real options market data
export interface VolatilityPoint {
  strike: number;
  expiration: string;
  daysToExp: number;
  impliedVol: number;
  moneyness: number;
}

export interface VolatilitySurfaceData {
  points: VolatilityPoint[];
  currentPrice: number;
  surfaceStats: {
    avgIV: number;
    minIV: number;
    maxIV: number;
    ivSkew: number;
    termStructure: 'upward' | 'downward' | 'flat';
  };
}

export function generateVolatilitySurface(symbol: string, currentPrice: number): VolatilitySurfaceData {
  const points: VolatilityPoint[] = [];
  const baseIV = getBaseImpliedVolatility(symbol);
  
  // Generate expiration dates (next 6 months)
  const expirations = getExpirationDates();
  
  // Generate strikes around current price
  const strikes = generateStrikes(currentPrice);
  
  for (const expiration of expirations) {
    for (const strike of strikes) {
      const daysToExp = Math.round((new Date(expiration).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      const moneyness = strike / currentPrice;
      
      // Calculate implied volatility with realistic skew and term structure
      const iv = calculateImpliedVolatility(baseIV, moneyness, daysToExp, symbol);
      
      points.push({
        strike,
        expiration,
        daysToExp,
        impliedVol: iv,
        moneyness
      });
    }
  }
  
  // Calculate surface statistics
  const ivValues = points.map(p => p.impliedVol);
  const avgIV = ivValues.reduce((sum, iv) => sum + iv, 0) / ivValues.length;
  const minIV = Math.min(...ivValues);
  const maxIV = Math.max(...ivValues);
  
  // Calculate IV skew (put skew is typically negative)
  const atmPoints = points.filter(p => Math.abs(p.moneyness - 1) < 0.05);
  const otmPutPoints = points.filter(p => p.moneyness < 0.95);
  const avgAtmIV = atmPoints.length > 0 ? atmPoints.reduce((sum, p) => sum + p.impliedVol, 0) / atmPoints.length : avgIV;
  const avgOtmPutIV = otmPutPoints.length > 0 ? otmPutPoints.reduce((sum, p) => sum + p.impliedVol, 0) / otmPutPoints.length : avgIV;
  const ivSkew = avgOtmPutIV - avgAtmIV;
  
  // Determine term structure
  const shortTermPoints = points.filter(p => p.daysToExp <= 30 && Math.abs(p.moneyness - 1) < 0.05);
  const longTermPoints = points.filter(p => p.daysToExp >= 90 && Math.abs(p.moneyness - 1) < 0.05);
  const avgShortIV = shortTermPoints.length > 0 ? shortTermPoints.reduce((sum, p) => sum + p.impliedVol, 0) / shortTermPoints.length : avgIV;
  const avgLongIV = longTermPoints.length > 0 ? longTermPoints.reduce((sum, p) => sum + p.impliedVol, 0) / longTermPoints.length : avgIV;
  
  let termStructure: 'upward' | 'downward' | 'flat' = 'flat';
  if (avgLongIV > avgShortIV + 2) termStructure = 'upward';
  else if (avgShortIV > avgLongIV + 2) termStructure = 'downward';
  
  return {
    points,
    currentPrice,
    surfaceStats: {
      avgIV,
      minIV,
      maxIV,
      ivSkew,
      termStructure
    }
  };
}

function getBaseImpliedVolatility(symbol: string): number {
  // Base IV levels for different symbols (realistic ranges)
  const baseIVMap: Record<string, number> = {
    'AAPL': 35,
    'TSLA': 55,
    'NVDA': 45,
    'SPY': 20,
    'QQQ': 25,
    'MSFT': 30,
    'GOOGL': 35,
    'AMZN': 40
  };
  
  return baseIVMap[symbol] || 30;
}

function getExpirationDates(): string[] {
  const dates: string[] = [];
  const today = new Date();
  
  // Add weekly expirations for next 8 weeks
  for (let i = 1; i <= 8; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + (i * 7));
    // Adjust to Friday
    const dayOfWeek = date.getDay();
    const daysUntilFriday = (5 - dayOfWeek + 7) % 7;
    date.setDate(date.getDate() + daysUntilFriday);
    dates.push(date.toISOString().split('T')[0]);
  }
  
  // Add monthly expirations for next 6 months
  for (let i = 1; i <= 6; i++) {
    const date = new Date(today.getFullYear(), today.getMonth() + i, 15);
    // Third Friday of the month
    const dayOfWeek = date.getDay();
    const daysUntilFriday = (5 - dayOfWeek + 7) % 7;
    date.setDate(date.getDate() + daysUntilFriday);
    dates.push(date.toISOString().split('T')[0]);
  }
  
  return Array.from(new Set(dates)).sort();
}

function generateStrikes(currentPrice: number): number[] {
  const strikes: number[] = [];
  const strikeInterval = getStrikeInterval(currentPrice);
  
  // Generate strikes from 70% to 130% of current price
  const minStrike = Math.floor(currentPrice * 0.7 / strikeInterval) * strikeInterval;
  const maxStrike = Math.ceil(currentPrice * 1.3 / strikeInterval) * strikeInterval;
  
  for (let strike = minStrike; strike <= maxStrike; strike += strikeInterval) {
    strikes.push(strike);
  }
  
  return strikes;
}

function getStrikeInterval(price: number): number {
  if (price < 50) return 1;
  if (price < 100) return 2.5;
  if (price < 200) return 5;
  if (price < 500) return 10;
  return 25;
}

function calculateImpliedVolatility(baseIV: number, moneyness: number, daysToExp: number, symbol: string): number {
  let iv = baseIV;
  
  // Volatility skew (smile) - puts typically have higher IV
  const skewFactor = 1 + (1 - moneyness) * 0.3;
  iv *= skewFactor;
  
  // Term structure - shorter terms can have higher IV due to event risk
  const termFactor = symbol === 'TSLA' || symbol === 'NVDA' ? 
    1 + (60 - daysToExp) / 300 :  // High vol stocks
    1 + (45 - daysToExp) / 400;   // Normal stocks
  iv *= Math.max(0.7, termFactor);
  
  // Add some randomness for realism
  const randomFactor = 0.9 + Math.random() * 0.2;
  iv *= randomFactor;
  
  // Ensure reasonable bounds
  return Math.max(5, Math.min(150, Math.round(iv * 10) / 10));
}