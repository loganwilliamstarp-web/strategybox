import { BaseOptionsStrategy, type BaseStrategyInputs, type StrikePremiumData, type StrategyResult, type MarketDataInput } from './base/StrategyInterface';
import { strategyTypes } from '@shared/schema';

/**
 * Long Strangle Strategy Implementation
 * 
 * Structure: Buy 1 OTM Put + Buy 1 OTM Call
 * Market Outlook: High volatility expected, direction unknown
 * Max Profit: Unlimited (if stock moves significantly)
 * Max Loss: Total premium paid (if stock stays between strikes)
 * Breakeven: Put Strike - Total Premium, Call Strike + Total Premium
 */
export class LongStrangleStrategy extends BaseOptionsStrategy {
  
  constructor() {
    super(strategyTypes.LONG_STRANGLE);
  }

  /**
   * Find optimal OTM strikes for Long Strangle
   */
  async findOptimalStrikes(inputs: BaseStrategyInputs, marketData: MarketDataInput): Promise<StrikePremiumData> {
    const { currentPrice, daysToExpiry } = inputs;
    const { optionsChain } = marketData;
    
    if (!optionsChain?.options) {
      throw new Error('Options chain data required for Long Strangle');
    }

    console.log(`🎯 Finding Long Strangle strikes for ${inputs.symbol} at $${currentPrice}`);

    // Filter options by expiration
    const optionsForExpiration = optionsChain.options.filter((opt: any) => 
      opt.expiration_date === inputs.expirationDate
    );

    const calls = optionsForExpiration.filter((opt: any) => opt.contract_type === 'call').sort((a: any, b: any) => a.strike - b.strike);
    const puts = optionsForExpiration.filter((opt: any) => opt.contract_type === 'put').sort((a: any, b: any) => a.strike - b.strike);

    if (calls.length === 0 || puts.length === 0) {
      throw new Error(`Insufficient options data for Long Strangle on ${inputs.symbol}`);
    }

    // Long Strangle: Select OTM strikes based on days to expiry
    let putStrikeDistance: number;
    let callStrikeDistance: number;

    if (daysToExpiry <= 7) {
      // Short-term: Closer strikes for higher probability of movement
      putStrikeDistance = currentPrice * 0.03; // 3% OTM
      callStrikeDistance = currentPrice * 0.03;
    } else if (daysToExpiry <= 30) {
      // Medium-term: Standard strikes
      putStrikeDistance = currentPrice * 0.05; // 5% OTM
      callStrikeDistance = currentPrice * 0.05;
    } else {
      // Long-term: Wider strikes for better premium collection
      putStrikeDistance = currentPrice * 0.08; // 8% OTM
      callStrikeDistance = currentPrice * 0.08;
    }

    // Find optimal put strike (below current price)
    const targetPutStrike = currentPrice - putStrikeDistance;
    const putStrike = this.findNearestStrike(targetPutStrike, puts.map((p: any) => p.strike), 'below');
    const putOption = puts.find((p: any) => p.strike === putStrike);

    // Find optimal call strike (above current price)
    const targetCallStrike = currentPrice + callStrikeDistance;
    const callStrike = this.findNearestStrike(targetCallStrike, calls.map((c: any) => c.strike), 'above');
    const callOption = calls.find((c: any) => c.strike === callStrike);

    if (!putOption || !callOption) {
      throw new Error('Could not find suitable strikes for Long Strangle');
    }

    const putPremium = (putOption.bid + putOption.ask) / 2 || putOption.last;
    const callPremium = (callOption.bid + callOption.ask) / 2 || callOption.last;

    console.log(`✅ Long Strangle strikes: Put ${putStrike}@$${putPremium}, Call ${callStrike}@$${callPremium}`);

    return {
      longPutStrike: putStrike,
      longCallStrike: callStrike,
      longPutPremium: putPremium,
      longCallPremium: callPremium
    };
  }

  /**
   * Extract real implied volatility from options data
   */
  private extractImpliedVolatility(data: StrikePremiumData, inputs: BaseStrategyInputs): { iv: number, percentile: number } {
    // If IV is explicitly provided in inputs (from MarketData.app), use it
    if (inputs.impliedVolatility && inputs.impliedVolatility > 0) {
      console.log(`✅ Using real MarketData.app IV: ${inputs.impliedVolatility}% (${inputs.ivPercentile}th percentile)`);
      return {
        iv: inputs.impliedVolatility,
        percentile: inputs.ivPercentile || 50
      };
    }

    // Fallback to default values if no real IV data available
    console.log('⚠️ No real IV data available, using fallback values');
    return {
      iv: 25, // Fallback value
      percentile: 50 // Fallback value
    };
  }

  /**
   * Calculate Long Strangle position metrics
   */
  calculatePosition(inputs: BaseStrategyInputs, data: StrikePremiumData): StrategyResult {
    // Extract real IV from the options data if available, otherwise use provided values or defaults
    const realIV = this.extractImpliedVolatility(data, inputs);
    const { currentPrice, daysToExpiry, expirationDate } = inputs;
    const impliedVolatility = realIV.iv;
    const ivPercentile = realIV.percentile;
    const { longPutStrike, longCallStrike, longPutPremium, longCallPremium } = data;

    if (!longPutStrike || !longCallStrike || !longPutPremium || !longCallPremium) {
      throw new Error('Missing required strike/premium data for Long Strangle');
    }

    // Calculate breakevens
    const breakevens = this.calculateBreakevens(data);
    
    // Calculate max profit/loss
    const profitLoss = this.calculateMaxProfitLoss(data);
    
    // Total premium paid (debit strategy)
    const totalPremium = longPutPremium + longCallPremium;
    const netDebit = totalPremium * 100; // Convert to per-contract

    return {
      strategyType: strategyTypes.LONG_STRANGLE,
      longPutStrike,
      longCallStrike,
      longPutPremium,
      longCallPremium,
      lowerBreakeven: breakevens.lowerBreakeven,
      upperBreakeven: breakevens.upperBreakeven,
      maxLoss: profitLoss.maxLoss,
      maxProfit: profitLoss.maxProfit, // Unlimited
      atmValue: currentPrice,
      impliedVolatility,
      ivPercentile,
      daysToExpiry,
      expirationDate,
      netDebit,
      profitZone: {
        lower: breakevens.lowerBreakeven,
        upper: breakevens.upperBreakeven
      },
      riskProfile: 'medium' // Limited downside, unlimited upside
    };
  }

  /**
   * Calculate breakeven points
   */
  protected calculateBreakevens(data: StrikePremiumData): { lowerBreakeven: number; upperBreakeven: number } {
    const totalPremium = data.longPutPremium! + data.longCallPremium!;
    
    return {
      lowerBreakeven: data.longPutStrike! - totalPremium,
      upperBreakeven: data.longCallStrike! + totalPremium
    };
  }

  /**
   * Calculate maximum profit and loss
   */
  protected calculateMaxProfitLoss(data: StrikePremiumData): { maxProfit?: number; maxLoss: number } {
    const totalPremium = data.longPutPremium! + data.longCallPremium!;
    
    return {
      maxProfit: undefined, // Unlimited profit potential
      maxLoss: totalPremium * 100 // Total premium paid per contract
    };
  }

  /**
   * Get P&L at specific stock price at expiration
   */
  getProfitLossAtPrice(price: number, data: StrikePremiumData): number {
    const { longPutStrike, longCallStrike, longPutPremium, longCallPremium } = data;
    
    if (!longPutStrike || !longCallStrike || !longPutPremium || !longCallPremium) {
      return 0;
    }

    const putIntrinsicValue = Math.max(longPutStrike - price, 0);
    const callIntrinsicValue = Math.max(price - longCallStrike, 0);
    const totalPremiumPaid = longPutPremium + longCallPremium;
    
    return (putIntrinsicValue + callIntrinsicValue - totalPremiumPaid) * 100; // Per contract
  }

  /**
   * Get strategy parameters
   */
  getStrategyParameters() {
    return {
      optimalDaysToExpiry: 45, // 4-8 weeks optimal
      riskLevel: 'medium' as const,
      complexity: 'simple' as const,
      capitalRequirement: 'low' as const,
      directionality: 'volatile' as const
    };
  }

  /**
   * Get strategy description
   */
  getDescription() {
    return {
      name: 'Long Strangle',
      description: 'Buy an out-of-the-money put and an out-of-the-money call with the same expiration date. Profits from large price movements in either direction.',
      marketOutlook: 'High volatility expected, but direction uncertain. Ideal before earnings, FDA approvals, or major announcements.',
      entryRules: [
        'Enter when implied volatility is low (IV percentile < 30)',
        'Choose strikes 5-10% out-of-the-money',
        'Target 30-45 days to expiration for optimal time decay',
        'Ensure adequate liquidity in both strikes'
      ],
      exitRules: [
        'Close when profit reaches 50-100% of premium paid',
        'Exit before expiration week to avoid rapid time decay',
        'Close losing trades at 50% of premium paid',
        'Consider rolling to later expiration if thesis intact'
      ],
      riskManagement: [
        'Maximum loss is limited to premium paid',
        'Monitor time decay acceleration in final weeks',
        'Watch for volatility crush after events',
        'Size positions appropriately (2-5% of portfolio per trade)'
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
