import { BaseOptionsStrategy, type BaseStrategyInputs, type StrikePremiumData, type StrategyResult, type MarketDataInput } from './base/StrategyInterface';
import { strategyTypes } from '@shared/schema';

/**
 * Iron Condor Strategy Implementation
 * 
 * Structure: Sell 1 OTM Put + Buy 1 Further OTM Put + Sell 1 OTM Call + Buy 1 Further OTM Call
 * Market Outlook: Low volatility, stock to remain range-bound
 * Max Profit: Net credit received (if stock stays between short strikes)
 * Max Loss: Spread width - Net credit (if stock moves beyond long strikes)
 * Breakeven: Short Put - Net Credit, Short Call + Net Credit
 */
export class IronCondorStrategy extends BaseOptionsStrategy {
  
  constructor() {
    super(strategyTypes.IRON_CONDOR);
  }

  /**
   * Find optimal strikes for Iron Condor (4 strikes total)
   */
  async findOptimalStrikes(inputs: BaseStrategyInputs, marketData: MarketDataInput): Promise<StrikePremiumData> {
    const { currentPrice, daysToExpiry } = inputs;
    const { optionsChain } = marketData;
    
    if (!optionsChain?.options) {
      throw new Error('Options chain data required for Iron Condor');
    }

    console.log(`🦅 Finding Iron Condor strikes for ${inputs.symbol} at $${currentPrice}`);

    // Filter options by expiration
    const optionsForExpiration = optionsChain.options.filter((opt: any) => 
      opt.expiration_date === inputs.expirationDate
    );

    const calls = optionsForExpiration.filter((opt: any) => opt.contract_type === 'call').sort((a: any, b: any) => a.strike - b.strike);
    const puts = optionsForExpiration.filter((opt: any) => opt.contract_type === 'put').sort((a: any, b: any) => a.strike - b.strike);

    if (calls.length < 4 || puts.length < 4) {
      throw new Error(`Insufficient options for Iron Condor on ${inputs.symbol} (need 4+ calls and 4+ puts)`);
    }

    // Iron Condor strike selection based on days to expiry
    let innerStrikeDistance: number; // Distance for short strikes (sold)
    let outerStrikeDistance: number; // Distance for long strikes (bought)
    let spreadWidth: number;         // Width between short and long strikes

    if (daysToExpiry <= 14) {
      // Short-term: Tighter spreads for higher probability of success
      innerStrikeDistance = currentPrice * 0.05; // 5% for short strikes
      spreadWidth = currentPrice * 0.03; // 3% spread width
    } else if (daysToExpiry <= 30) {
      // Medium-term: Standard spreads
      innerStrikeDistance = currentPrice * 0.08; // 8% for short strikes
      spreadWidth = currentPrice * 0.05; // 5% spread width
    } else {
      // Long-term: Wider spreads for safety
      innerStrikeDistance = currentPrice * 0.12; // 12% for short strikes
      spreadWidth = currentPrice * 0.08; // 8% spread width
    }

    outerStrikeDistance = innerStrikeDistance + spreadWidth;

    // Find PUT side strikes
    const targetShortPutStrike = currentPrice - innerStrikeDistance;
    const targetLongPutStrike = currentPrice - outerStrikeDistance;

    const shortPutStrike = this.findNearestStrike(targetShortPutStrike, puts.map((p: any) => p.strike), 'below');
    const longPutStrike = this.findNearestStrike(targetLongPutStrike, puts.map((p: any) => p.strike), 'below');

    // Find CALL side strikes
    const targetShortCallStrike = currentPrice + innerStrikeDistance;
    const targetLongCallStrike = currentPrice + outerStrikeDistance;

    const shortCallStrike = this.findNearestStrike(targetShortCallStrike, calls.map((c: any) => c.strike), 'above');
    const longCallStrike = this.findNearestStrike(targetLongCallStrike, calls.map((c: any) => c.strike), 'above');

    // Get option contracts
    const shortPutOption = puts.find((p: any) => p.strike === shortPutStrike);
    const longPutOption = puts.find((p: any) => p.strike === longPutStrike);
    const shortCallOption = calls.find((c: any) => c.strike === shortCallStrike);
    const longCallOption = calls.find((c: any) => c.strike === longCallStrike);

    if (!shortPutOption || !longPutOption || !shortCallOption || !longCallOption) {
      throw new Error('Could not find all required strikes for Iron Condor');
    }

    // Calculate premiums (mid price)
    const shortPutPremium = (shortPutOption.bid + shortPutOption.ask) / 2 || shortPutOption.last;
    const longPutPremium = (longPutOption.bid + longPutOption.ask) / 2 || longPutOption.last;
    const shortCallPremium = (shortCallOption.bid + shortCallOption.ask) / 2 || shortCallOption.last;
    const longCallPremium = (longCallOption.bid + longCallOption.ask) / 2 || longCallOption.last;

    // Calculate net credit (what we collect)
    const putSpreadCredit = shortPutPremium - longPutPremium;
    const callSpreadCredit = shortCallPremium - longCallPremium;
    const netCredit = putSpreadCredit + callSpreadCredit;

    if (netCredit <= 0) {
      throw new Error('Iron Condor must result in net credit (premium collected)');
    }

    console.log(`✅ Iron Condor structure:`);
    console.log(`   Long Put: ${longPutStrike}@$${longPutPremium} (BUY)`);
    console.log(`   Short Put: ${shortPutStrike}@$${shortPutPremium} (SELL)`);
    console.log(`   Short Call: ${shortCallStrike}@$${shortCallPremium} (SELL)`);
    console.log(`   Long Call: ${longCallStrike}@$${longCallPremium} (BUY)`);
    console.log(`💰 Net Credit: $${netCredit.toFixed(2)} per share ($${(netCredit * 100).toFixed(0)} per contract)`);

    return {
      longPutStrike,
      longCallStrike,
      longPutPremium,
      longCallPremium,
      shortPutStrike,
      shortCallStrike,
      shortPutPremium,
      shortCallPremium
    };
  }

  /**
   * Calculate Iron Condor position metrics
   */
  calculatePosition(inputs: BaseStrategyInputs, data: StrikePremiumData): StrategyResult {
    const { currentPrice, daysToExpiry, expirationDate, impliedVolatility = 25, ivPercentile = 50 } = inputs;
    const { longPutStrike, longCallStrike, longPutPremium, longCallPremium, shortPutStrike, shortCallStrike, shortPutPremium, shortCallPremium } = data;

    if (!longPutStrike || !longCallStrike || !longPutPremium || !longCallPremium ||
        !shortPutStrike || !shortCallStrike || !shortPutPremium || !shortCallPremium) {
      throw new Error('Missing required strike/premium data for Iron Condor');
    }

    // Calculate breakevens
    const breakevens = this.calculateBreakevens(data);
    
    // Calculate max profit/loss
    const profitLoss = this.calculateMaxProfitLoss(data);
    
    // Calculate net credit
    const putSpreadCredit = shortPutPremium - longPutPremium;
    const callSpreadCredit = shortCallPremium - longCallPremium;
    const netCredit = (putSpreadCredit + callSpreadCredit) * 100; // Per contract

    return {
      strategyType: strategyTypes.IRON_CONDOR,
      longPutStrike,
      longCallStrike,
      longPutPremium,
      longCallPremium,
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
      riskProfile: 'low' // Defined max loss
    };
  }

  /**
   * Calculate breakeven points
   */
  protected calculateBreakevens(data: StrikePremiumData): { lowerBreakeven: number; upperBreakeven: number } {
    const netCredit = (data.shortPutPremium! - data.longPutPremium!) + (data.shortCallPremium! - data.longCallPremium!);
    
    return {
      lowerBreakeven: data.shortPutStrike! - netCredit,
      upperBreakeven: data.shortCallStrike! + netCredit
    };
  }

  /**
   * Calculate maximum profit and loss
   */
  protected calculateMaxProfitLoss(data: StrikePremiumData): { maxProfit: number; maxLoss: number } {
    const putSpreadCredit = data.shortPutPremium! - data.longPutPremium!;
    const callSpreadCredit = data.shortCallPremium! - data.longCallPremium!;
    const netCredit = putSpreadCredit + callSpreadCredit;
    
    // Calculate spread widths
    const putSpreadWidth = data.shortPutStrike! - data.longPutStrike!;
    const callSpreadWidth = data.longCallStrike! - data.shortCallStrike!;
    const maxSpreadWidth = Math.max(putSpreadWidth, callSpreadWidth);
    
    return {
      maxProfit: netCredit * 100, // Credit collected per contract
      maxLoss: (maxSpreadWidth - netCredit) * 100 // Spread width minus credit
    };
  }

  /**
   * Get P&L at specific stock price at expiration
   */
  getProfitLossAtPrice(price: number, data: StrikePremiumData): number {
    const { longPutStrike, shortPutStrike, shortCallStrike, longCallStrike, 
            longPutPremium, shortPutPremium, shortCallPremium, longCallPremium } = data;
    
    if (!longPutStrike || !shortPutStrike || !shortCallStrike || !longCallStrike ||
        !longPutPremium || !shortPutPremium || !shortCallPremium || !longCallPremium) {
      return 0;
    }

    // Calculate net credit received
    const netCredit = (shortPutPremium - longPutPremium) + (shortCallPremium - longCallPremium);

    // Calculate intrinsic values at expiration
    const longPutIntrinsic = Math.max(longPutStrike - price, 0);
    const shortPutIntrinsic = Math.max(shortPutStrike - price, 0);
    const shortCallIntrinsic = Math.max(price - shortCallStrike, 0);
    const longCallIntrinsic = Math.max(price - longCallStrike, 0);

    // Calculate spread values (what we owe)
    const putSpreadValue = longPutIntrinsic - shortPutIntrinsic;
    const callSpreadValue = longCallIntrinsic - shortCallIntrinsic;
    const totalSpreadValue = putSpreadValue + callSpreadValue;

    // P&L = Credit received - Spread values owed
    return (netCredit - totalSpreadValue) * 100; // Per contract
  }

  /**
   * Get strategy parameters
   */
  getStrategyParameters() {
    return {
      optimalDaysToExpiry: 30, // 3-6 weeks optimal
      riskLevel: 'low' as const,
      complexity: 'advanced' as const,
      capitalRequirement: 'medium' as const,
      directionality: 'neutral' as const
    };
  }

  /**
   * Get strategy description
   */
  getDescription() {
    return {
      name: 'Iron Condor',
      description: 'Combination of a put spread and call spread. Sell closer strikes, buy further strikes for protection. Profits from low volatility and range-bound movement.',
      marketOutlook: 'Low volatility expected with stock remaining between the short strikes. Ideal for range-bound markets with strong support/resistance.',
      entryRules: [
        'Enter when implied volatility is high (IV percentile > 60)',
        'Choose short strikes with strong support/resistance levels',
        'Target 20-45 days to expiration for optimal time decay',
        'Ensure 5-10 point spread width for good risk/reward',
        'Look for credit of 1/3 to 1/2 of spread width'
      ],
      exitRules: [
        'Close when profit reaches 25-50% of credit collected',
        'Exit if stock approaches either short strike',
        'Close before expiration week to avoid assignment',
        'Consider closing one side if directionally challenged'
      ],
      riskManagement: [
        'Maximum loss is limited (spread width - credit)',
        'Monitor both short strikes for breach risk',
        'Consider adjustments if one side threatened',
        'Close early if volatility expands significantly',
        'Size positions appropriately (3-5% of portfolio)',
        'Have plan for early assignment on short options'
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
