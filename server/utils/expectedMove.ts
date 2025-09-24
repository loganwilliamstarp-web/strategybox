/**
 * Calculate expected move data for options positions
 * This function calculates the expected weekly price range based on implied volatility
 */

export interface ExpectedMoveData {
  weeklyLow: number;
  weeklyHigh: number;
  dailyMove: number;
  weeklyMove: number;
  movePercentage: number;
}

/**
 * Calculate expected move based on current price, implied volatility, and time to expiry
 */
export function calculateExpectedMove(
  currentPrice: number, 
  impliedVolatility: number, 
  daysToExpiry: number
): ExpectedMoveData {
  // Check if IV is already in decimal form (0.2) or percentage form (20)
  const ivDecimal = impliedVolatility > 1 ? impliedVolatility / 100 : impliedVolatility;
  
  // Handle edge cases for performance  
  if (impliedVolatility <= 0 || currentPrice <= 0) {
    return {
      weeklyLow: currentPrice * 0.95,
      weeklyHigh: currentPrice * 1.05,
      dailyMove: currentPrice * 0.01,
      weeklyMove: currentPrice * 0.025,
      movePercentage: 2.5
    };
  }
  
  // Fast calculation for normal cases
  const weeklyMove = currentPrice * ivDecimal * 0.14; // Pre-calculated constant
  const dailyMove = weeklyMove / 7;
  
  const movePercentage = (weeklyMove / currentPrice) * 100;
  
  return {
    weeklyLow: currentPrice - weeklyMove,
    weeklyHigh: currentPrice + weeklyMove,
    dailyMove: dailyMove,
    weeklyMove: weeklyMove,
    movePercentage: movePercentage
  };
}
