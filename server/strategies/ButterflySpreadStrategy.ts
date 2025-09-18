import { BaseOptionsStrategy, type BaseStrategyInputs, type StrikePremiumData, type StrategyResult, type MarketDataInput } from './base/StrategyInterface';
import { strategyTypes } from '@shared/schema';

/**
 * Butterfly Spread Strategy Implementation
 * 
 * Structure: Buy 1 ITM Option + Sell 2 ATM Options + Buy 1 OTM Option (all same type)
 * Can be implemented with calls (Long Call Butterfly) or puts (Long Put Butterfly)
 * 
 * Market Outlook: Low volatility, stock to finish near center strike
 * Max Profit: Center Strike - Lower Strike - Net Debit (at center strike)
 * Max Loss: Net debit paid (if stock finishes at wing strikes)
 * Breakeven: Lower Strike + Net Debit, Upper Strike - Net Debit
 */
export class ButterflySpreadStrategy extends BaseOptionsStrategy {
  
  constructor() {
    super(strategyTypes.BUTTERFLY_SPREAD);
  }

  /**
   * Find optimal strikes for Butterfly Spread (3 strikes with 2 contracts at center)
   */
  async findOptimalStrikes(inputs: BaseStrategyInputs, marketData: MarketDataInput): Promise<StrikePremiumData> {
    const { currentPrice, daysToExpiry } = inputs;
    const { optionsChain } = marketData;
    
    if (!optionsChain?.options) {
      throw new Error('Options chain data required for Butterfly Spread');
    }

    console.log(`🦋 Finding Butterfly Spread strikes for ${inputs.symbol} at $${currentPrice}`);

    // Filter options by expiration
    const optionsForExpiration = optionsChain.options.filter((opt: any) => 
      opt.expiration_date === inputs.expirationDate
    );

    // Use calls for butterfly spread (can also implement with puts)
    const calls = optionsForExpiration.filter((opt: any) => opt.contract_type === 'call').sort((a: any, b: any) => a.strike - b.strike);

    if (calls.length < 6) {
      throw new Error(`Insufficient call options for Butterfly Spread on ${inputs.symbol} (need 6+ strikes)`);
    }

    // Butterfly strike selection: Find ATM strike as center
    const atmStrike = this.findNearestStrike(currentPrice, calls.map((c: any) => c.strike), 'nearest');
    
    // Calculate wing distances based on days to expiry
    let wingDistance: number;
    
    if (daysToExpiry <= 14) {
      // Short-term: Narrow wings for higher probability
      wingDistance = this.getStrikeIncrement(currentPrice) * 2; // 2 strikes away
    } else if (daysToExpiry <= 30) {
      // Medium-term: Standard wings
      wingDistance = this.getStrikeIncrement(currentPrice) * 3; // 3 strikes away
    } else {
      // Long-term: Wider wings for better risk/reward
      wingDistance = this.getStrikeIncrement(currentPrice) * 4; // 4 strikes away
    }

    // Find wing strikes
    const lowerWingStrike = atmStrike - wingDistance;
    const upperWingStrike = atmStrike + wingDistance;

    // Get option contracts
    const lowerWingOption = calls.find((c: any) => c.strike === lowerWingStrike);
    const centerOption = calls.find((c: any) => c.strike === atmStrike);
    const upperWingOption = calls.find((c: any) => c.strike === upperWingStrike);

    if (!lowerWingOption || !centerOption || !upperWingOption) {
      throw new Error('Could not find required strikes for Butterfly Spread');
    }

    // Calculate premiums
    const lowerWingPremium = (lowerWingOption.bid + lowerWingOption.ask) / 2 || lowerWingOption.last;
    const centerPremium = (centerOption.bid + centerOption.ask) / 2 || centerOption.last;
    const upperWingPremium = (upperWingOption.bid + upperWingOption.ask) / 2 || upperWingOption.last;

    // Butterfly P&L calculation
    // Buy 1 lower wing + Sell 2 center + Buy 1 upper wing
    const netDebit = lowerWingPremium + upperWingPremium - (2 * centerPremium);

    if (netDebit <= 0) {
      console.warn(`⚠️ Butterfly Spread resulted in credit instead of debit: $${netDebit}`);
    }

    console.log(`✅ Butterfly Spread structure:`);
    console.log(`   Buy Lower Wing: ${lowerWingStrike}@$${lowerWingPremium}`);
    console.log(`   Sell 2x Center: ${atmStrike}@$${centerPremium} (×2)`);
    console.log(`   Buy Upper Wing: ${upperWingStrike}@$${upperWingPremium}`);
    console.log(`💰 Net Debit: $${netDebit.toFixed(2)} per share ($${(netDebit * 100).toFixed(0)} per contract)`);

    return {
      longPutStrike: lowerWingStrike,   // Lower wing (bought)
      longCallStrike: upperWingStrike,  // Upper wing (bought)
      longPutPremium: lowerWingPremium,
      longCallPremium: upperWingPremium,
      shortPutStrike: atmStrike,        // Center strike (sold 2x)
      shortCallStrike: atmStrike,       // Center strike (sold 2x)
      shortPutPremium: centerPremium,   // Actually sold as calls, but using put field for storage
      shortCallPremium: centerPremium
    };
  }

  /**
   * Calculate Butterfly Spread position metrics
   */
  calculatePosition(inputs: BaseStrategyInputs, data: StrikePremiumData): StrategyResult {
    const { currentPrice, daysToExpiry, expirationDate, impliedVolatility = 25, ivPercentile = 50 } = inputs;
    const { longPutStrike, longCallStrike, longPutPremium, longCallPremium, shortPutPremium } = data;

    if (!longPutStrike || !longCallStrike || !longPutPremium || !longCallPremium || !shortPutPremium) {
      throw new Error('Missing required strike/premium data for Butterfly Spread');
    }

    // Calculate breakevens
    const breakevens = this.calculateBreakevens(data);
    
    // Calculate max profit/loss
    const profitLoss = this.calculateMaxProfitLoss(data);
    
    // Net debit calculation
    const netDebit = (longPutPremium + longCallPremium - (2 * shortPutPremium)) * 100;

    return {
      strategyType: strategyTypes.BUTTERFLY_SPREAD,
      longPutStrike,
      longCallStrike,
      longPutPremium,
      longCallPremium,
      shortPutStrike: (longPutStrike + longCallStrike) / 2, // Center strike
      shortCallStrike: (longPutStrike + longCallStrike) / 2, // Center strike
      shortPutPremium,
      shortCallPremium: shortPutPremium, // Same as put premium (center strike)
      lowerBreakeven: breakevens.lowerBreakeven,
      upperBreakeven: breakevens.upperBreakeven,
      maxLoss: profitLoss.maxLoss,
      maxProfit: profitLoss.maxProfit,
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
      riskProfile: 'low' // Limited loss, limited profit
    };
  }

  /**
   * Calculate breakeven points
   */
  protected calculateBreakevens(data: StrikePremiumData): { lowerBreakeven: number; upperBreakeven: number } {
    const netDebit = data.longPutPremium! + data.longCallPremium! - (2 * data.shortPutPremium!);
    const centerStrike = (data.longPutStrike! + data.longCallStrike!) / 2;
    const wingDistance = (data.longCallStrike! - data.longPutStrike!) / 2;
    
    return {
      lowerBreakeven: data.longPutStrike! + netDebit,
      upperBreakeven: data.longCallStrike! - netDebit
    };
  }

  /**
   * Calculate maximum profit and loss
   */
  protected calculateMaxProfitLoss(data: StrikePremiumData): { maxProfit: number; maxLoss: number } {
    const netDebit = data.longPutPremium! + data.longCallPremium! - (2 * data.shortPutPremium!);
    const wingDistance = (data.longCallStrike! - data.longPutStrike!) / 2;
    
    return {
      maxProfit: (wingDistance - netDebit) * 100, // At center strike
      maxLoss: netDebit * 100 // Net debit paid
    };
  }

  /**
   * Get P&L at specific stock price at expiration
   */
  getProfitLossAtPrice(price: number, data: StrikePremiumData): number {
    const { longPutStrike, longCallStrike, longPutPremium, longCallPremium, shortPutPremium } = data;
    
    if (!longPutStrike || !longCallStrike || !longPutPremium || !longCallPremium || !shortPutPremium) {
      return 0;
    }

    const netDebit = longPutPremium + longCallPremium - (2 * shortPutPremium);
    const centerStrike = (longPutStrike + longCallStrike) / 2;

    if (price <= longPutStrike || price >= longCallStrike) {
      // At or beyond wings - maximum loss
      return -netDebit * 100;
    } else if (price === centerStrike) {
      // At center - maximum profit
      const wingDistance = (longCallStrike - longPutStrike) / 2;
      return (wingDistance - netDebit) * 100;
    } else {
      // Between wings - linear interpolation
      const distanceFromCenter = Math.abs(price - centerStrike);
      const wingDistance = (longCallStrike - longPutStrike) / 2;
      const profitFactor = 1 - (distanceFromCenter / wingDistance);
      const maxProfit = wingDistance - netDebit;
      return (maxProfit * profitFactor - netDebit) * 100;
    }
  }

  /**
   * Get strategy parameters
   */
  getStrategyParameters() {
    return {
      optimalDaysToExpiry: 21, // 2-4 weeks optimal
      riskLevel: 'low' as const,
      complexity: 'advanced' as const,
      capitalRequirement: 'low' as const,
      directionality: 'neutral' as const
    };
  }

  /**
   * Get strategy description
   */
  getDescription() {
    return {
      name: 'Butterfly Spread',
      description: 'Buy one lower strike, sell two middle strikes, buy one higher strike. All same expiration and option type. Profits when stock finishes near the middle strike.',
      marketOutlook: 'Low volatility with stock expected to finish near current price. Ideal when you have a specific price target.',
      entryRules: [
        'Enter when implied volatility is high (will decrease)',
        'Choose center strike near current stock price or target',
        'Target 15-30 days to expiration',
        'Look for even strike spacing (5 or 10 point intervals)',
        'Ensure net debit is reasonable (< 50% of wing spread)'
      ],
      exitRules: [
        'Close when profit reaches 50-75% of maximum potential',
        'Exit if stock moves beyond breakeven points',
        'Close before expiration week to avoid pin risk',
        'Take profits early if volatility decreases quickly'
      ],
      riskManagement: [
        'Maximum loss is limited to net debit paid',
        'Monitor pin risk near center strike at expiration',
        'Close early if volatility increases significantly',
        'Size positions small due to low probability of max profit',
        'Avoid butterflies over earnings or major events'
      ]
    };
  }

  /**
   * Get strike increment based on stock price
   */
  private getStrikeIncrement(currentPrice: number): number {
    if (currentPrice < 25) return 1;
    if (currentPrice < 50) return 2.5;
    if (currentPrice < 100) return 5;
    if (currentPrice < 200) return 5;
    if (currentPrice < 500) return 10;
    return 25;
  }

  /**
   * Helper method to find nearest available strike
   */
  private findNearestStrike(target: number, availableStrikes: number[], direction: 'above' | 'below' | 'nearest'): number {
    const sortedStrikes = [...availableStrikes].sort((a, b) => a - b);
    
    if (direction === 'above') {
      return sortedStrikes.find(strike => strike > target) || sortedStrikes[sortedStrikes.length - 1];
    } else if (direction === 'below') {
      return sortedStrikes.reverse().find(strike => strike < target) || sortedStrikes[0];
    } else {
      // Find nearest strike
      return sortedStrikes.reduce((prev, curr) => 
        Math.abs(curr - target) < Math.abs(prev - target) ? curr : prev
      );
    }
  }
}
