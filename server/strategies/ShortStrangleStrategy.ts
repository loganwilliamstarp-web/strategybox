import { BaseOptionsStrategy, type BaseStrategyInputs, type StrikePremiumData, type StrategyResult, type MarketDataInput } from './base/StrategyInterface';
import { strategyTypes } from '@shared/schema';

/**
 * Short Strangle Strategy Implementation
 * 
 * Structure: Sell 1 OTM Put + Sell 1 OTM Call
 * Market Outlook: Low volatility expected, sideways movement
 * Max Profit: Total premium collected (if stock stays between strikes)
 * Max Loss: Unlimited (if stock moves significantly beyond strikes)
 * Breakeven: Put Strike - Total Premium, Call Strike + Total Premium
 */
export class ShortStrangleStrategy extends BaseOptionsStrategy {
  
  constructor() {
    super(strategyTypes.SHORT_STRANGLE);
  }

  /**
   * Find optimal OTM strikes for Short Strangle
   */
  async findOptimalStrikes(inputs: BaseStrategyInputs, marketData: MarketDataInput): Promise<StrikePremiumData> {
    const { currentPrice, daysToExpiry } = inputs;
    const { optionsChain } = marketData;
    
    if (!optionsChain?.options) {
      throw new Error('Options chain data required for Short Strangle');
    }

    console.log(`📉 Finding Short Strangle strikes for ${inputs.symbol} at $${currentPrice}`);

    // Filter options by expiration
    const optionsForExpiration = optionsChain.options.filter((opt: any) => 
      opt.expiration_date === inputs.expirationDate
    );

    const calls = optionsForExpiration.filter((opt: any) => opt.contract_type === 'call').sort((a: any, b: any) => a.strike - b.strike);
    const puts = optionsForExpiration.filter((opt: any) => opt.contract_type === 'put').sort((a: any, b: any) => a.strike - b.strike);

    if (calls.length === 0 || puts.length === 0) {
      throw new Error(`Insufficient options data for Short Strangle on ${inputs.symbol}`);
    }

    // Short Strangle: Select strikes with good premium collection potential
    let putStrikeDistance: number;
    let callStrikeDistance: number;

    if (daysToExpiry <= 14) {
      // Short-term: Closer strikes for higher premium collection
      putStrikeDistance = currentPrice * 0.08; // 8% OTM
      callStrikeDistance = currentPrice * 0.08;
    } else if (daysToExpiry <= 45) {
      // Medium-term: Standard strikes for balanced risk/reward
      putStrikeDistance = currentPrice * 0.12; // 12% OTM
      callStrikeDistance = currentPrice * 0.12;
    } else {
      // Long-term: Wider strikes for safety margin
      putStrikeDistance = currentPrice * 0.15; // 15% OTM
      callStrikeDistance = currentPrice * 0.15;
    }

    // Find optimal put strike (below current price) - we SELL this
    const targetPutStrike = currentPrice - putStrikeDistance;
    const putStrike = this.findNearestStrike(targetPutStrike, puts.map((p: any) => p.strike), 'below');
    const putOption = puts.find((p: any) => p.strike === putStrike);

    // Find optimal call strike (above current price) - we SELL this
    const targetCallStrike = currentPrice + callStrikeDistance;
    const callStrike = this.findNearestStrike(targetCallStrike, calls.map((c: any) => c.strike), 'above');
    const callOption = calls.find((c: any) => c.strike === callStrike);

    if (!putOption || !callOption) {
      throw new Error('Could not find suitable strikes for Short Strangle');
    }

    // For short positions, we collect premium (positive cash flow)
    const putPremium = (putOption.bid + putOption.ask) / 2 || putOption.last;
    const callPremium = (callOption.bid + callOption.ask) / 2 || callOption.last;

    // Validate premium collection potential
    const totalPremium = putPremium + callPremium;
    const strikeWidth = callStrike - putStrike;
    const premiumToWidthRatio = totalPremium / strikeWidth;

    if (premiumToWidthRatio < 0.02) {
      console.warn(`⚠️ Low premium collection for Short Strangle: ${premiumToWidthRatio.toFixed(3)} ratio`);
    }

    console.log(`✅ Short Strangle strikes: Sell Put ${putStrike}@$${putPremium}, Sell Call ${callStrike}@$${callPremium}`);
    console.log(`💰 Total premium collected: $${totalPremium.toFixed(2)} per share ($${(totalPremium * 100).toFixed(0)} per contract)`);

    return {
      shortPutStrike: putStrike,    // We SELL the put
      shortCallStrike: callStrike,  // We SELL the call
      shortPutPremium: putPremium,
      shortCallPremium: callPremium,
      // For compatibility with existing schema
      longPutStrike: putStrike,
      longCallStrike: callStrike,
      longPutPremium: -putPremium,  // Negative because we collect premium
      longCallPremium: -callPremium // Negative because we collect premium
    };
  }

  /**
   * Calculate Short Strangle position metrics
   */
  calculatePosition(inputs: BaseStrategyInputs, data: StrikePremiumData): StrategyResult {
    const { currentPrice, daysToExpiry, expirationDate, impliedVolatility = 25, ivPercentile = 50 } = inputs;
    const { shortPutStrike, shortCallStrike, shortPutPremium, shortCallPremium } = data;

    if (!shortPutStrike || !shortCallStrike || !shortPutPremium || !shortCallPremium) {
      throw new Error('Missing required strike/premium data for Short Strangle');
    }

    // Calculate breakevens
    const breakevens = this.calculateBreakevens(data);
    
    // Calculate max profit/loss
    const profitLoss = this.calculateMaxProfitLoss(data);
    
    // Total premium collected (credit strategy)
    const totalPremium = shortPutPremium + shortCallPremium;
    const netCredit = totalPremium * 100; // Convert to per-contract

    return {
      strategyType: strategyTypes.SHORT_STRANGLE,
      longPutStrike: shortPutStrike,    // Schema compatibility
      longCallStrike: shortCallStrike,  // Schema compatibility
      longPutPremium: -shortPutPremium, // Negative (we collect premium)
      longCallPremium: -shortCallPremium, // Negative (we collect premium)
      shortPutStrike,
      shortCallStrike,
      shortPutPremium,
      shortCallPremium,
      lowerBreakeven: breakevens.lowerBreakeven,
      upperBreakeven: breakevens.upperBreakeven,
      maxLoss: profitLoss.maxLoss,
      maxProfit: profitLoss.maxProfit,
      atmValue: currentPrice,
      impliedVolatility,
      ivPercentile,
      daysToExpiry,
      expirationDate,
      netCredit,
      profitZone: {
        lower: shortPutStrike,
        upper: shortCallStrike
      },
      riskProfile: 'unlimited' // Unlimited loss potential
    };
  }

  /**
   * Calculate breakeven points
   */
  protected calculateBreakevens(data: StrikePremiumData): { lowerBreakeven: number; upperBreakeven: number } {
    const totalPremium = data.shortPutPremium! + data.shortCallPremium!;
    
    return {
      lowerBreakeven: data.shortPutStrike! - totalPremium,
      upperBreakeven: data.shortCallStrike! + totalPremium
    };
  }

  /**
   * Calculate maximum profit and loss
   */
  protected calculateMaxProfitLoss(data: StrikePremiumData): { maxProfit: number; maxLoss: number } {
    const totalPremium = data.shortPutPremium! + data.shortCallPremium!;
    
    return {
      maxProfit: totalPremium * 100, // Premium collected per contract
      maxLoss: Number.MAX_SAFE_INTEGER // Unlimited loss potential
    };
  }

  /**
   * Get P&L at specific stock price at expiration
   */
  getProfitLossAtPrice(price: number, data: StrikePremiumData): number {
    const { shortPutStrike, shortCallStrike, shortPutPremium, shortCallPremium } = data;
    
    if (!shortPutStrike || !shortCallStrike || !shortPutPremium || !shortCallPremium) {
      return 0;
    }

    const premiumCollected = shortPutPremium + shortCallPremium;

    if (price <= shortPutStrike) {
      // Put assigned - we buy stock at put strike
      const putAssignmentLoss = shortPutStrike - price;
      return (premiumCollected - putAssignmentLoss) * 100;
    } else if (price >= shortCallStrike) {
      // Call assigned - we sell stock at call strike
      const callAssignmentLoss = price - shortCallStrike;
      return (premiumCollected - callAssignmentLoss) * 100;
    } else {
      // Stock stays between strikes - we keep all premium
      return premiumCollected * 100;
    }
  }

  /**
   * Get strategy parameters
   */
  getStrategyParameters() {
    return {
      optimalDaysToExpiry: 30, // 3-6 weeks optimal
      riskLevel: 'unlimited' as const,
      complexity: 'intermediate' as const,
      capitalRequirement: 'high' as const, // Requires margin for short positions
      directionality: 'neutral' as const
    };
  }

  /**
   * Get strategy description
   */
  getDescription() {
    return {
      name: 'Short Strangle',
      description: 'Sell an out-of-the-money put and an out-of-the-money call with the same expiration date. Profits from low volatility and sideways price movement.',
      marketOutlook: 'Low volatility expected, stock price to remain range-bound between strikes. Ideal when IV is high and expected to decrease.',
      entryRules: [
        'Enter when implied volatility is high (IV percentile > 70)',
        'Choose strikes 10-15% out-of-the-money for safety margin',
        'Target 20-45 days to expiration for optimal time decay',
        'Ensure strong support/resistance levels near strikes',
        'Avoid earnings announcements and major events'
      ],
      exitRules: [
        'Close when profit reaches 25-50% of premium collected',
        'Exit immediately if stock breaks through either strike',
        'Close before expiration week to avoid assignment risk',
        'Consider rolling strikes out and up/down if challenged'
      ],
      riskManagement: [
        'UNLIMITED LOSS POTENTIAL - use strict stop losses',
        'Monitor delta exposure and hedge if necessary',
        'Close positions before major events or earnings',
        'Keep position size small (1-2% of portfolio maximum)',
        'Have assignment plan ready for both puts and calls',
        'Consider converting to iron condor if strikes threatened'
      ]
    };
  }

  /**
   * Helper method to find nearest available strike
   */
  private findNearestStrike(target: number, availableStrikes: number[], direction: 'above' | 'below'): number {
    const sortedStrikes = [...availableStrikes].sort((a, b) => a - b);
    
    if (direction === 'above') {
      return sortedStrikes.find(strike => strike > target) || sortedStrikes[sortedStrikes.length - 1];
    } else {
      return sortedStrikes.reverse().find(strike => strike < target) || sortedStrikes[0];
    }
  }
}
