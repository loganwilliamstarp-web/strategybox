import { BaseOptionsStrategy, type BaseStrategyInputs, type StrikePremiumData, type StrategyResult, type MarketDataInput } from './base/StrategyInterface';
import { strategyTypes } from '@shared/schema';

/**
 * Diagonal Calendar Strategy Implementation
 * 
 * Structure: Sell 1 Short-term Option + Buy 1 Long-term Option (different expirations, different strikes)
 * Market Outlook: Neutral to slightly directional, benefits from time decay
 * Max Profit: Variable, typically when short option expires worthless and long retains value
 * Max Loss: Net debit paid (if both options expire worthless)
 * Breakeven: Complex calculation based on time decay and volatility
 */
export class DiagonalCalendarStrategy extends BaseOptionsStrategy {
  
  constructor() {
    super(strategyTypes.DIAGONAL_CALENDAR);
  }

  /**
   * Find optimal strikes for Diagonal Calendar (2 different expirations)
   */
  async findOptimalStrikes(inputs: BaseStrategyInputs, marketData: MarketDataInput): Promise<StrikePremiumData> {
    const { currentPrice, daysToExpiry } = inputs;
    const { optionsChain } = marketData;
    
    if (!optionsChain?.options) {
      throw new Error('Options chain data required for Diagonal Calendar');
    }

    console.log(`📅 Finding Diagonal Calendar strikes for ${inputs.symbol} at $${currentPrice}`);

    // Get available expiration dates
    const expirationDates = Array.from(new Set(
      optionsChain.options.map((opt: any) => opt.expiration_date)
    )).sort();

    if (expirationDates.length < 2) {
      throw new Error('Need at least 2 expiration dates for Diagonal Calendar');
    }

    // Find short-term expiration (front month) - what we sell
    const shortExpiration = expirationDates.find(date => {
      const daysToExp = Math.ceil((new Date(date).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
      return daysToExp >= 7 && daysToExp <= 30; // 1-4 weeks
    }) || expirationDates[0];

    // Find long-term expiration (back month) - what we buy
    const longExpiration = expirationDates.find(date => {
      const daysToExp = Math.ceil((new Date(date).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
      return daysToExp >= 45 && daysToExp <= 90; // 6-12 weeks
    }) || expirationDates[expirationDates.length - 1];

    console.log(`📅 Using expirations: Short ${shortExpiration}, Long ${longExpiration}`);

    // Filter options by expiration
    const shortTermOptions = optionsChain.options.filter((opt: any) => opt.expiration_date === shortExpiration);
    const longTermOptions = optionsChain.options.filter((opt: any) => opt.expiration_date === longExpiration);

    // Use calls for diagonal calendar (can also implement with puts)
    const shortTermCalls = shortTermOptions.filter((opt: any) => opt.contract_type === 'call').sort((a: any, b: any) => a.strike - b.strike);
    const longTermCalls = longTermOptions.filter((opt: any) => opt.contract_type === 'call').sort((a: any, b: any) => a.strike - b.strike);

    if (shortTermCalls.length === 0 || longTermCalls.length === 0) {
      throw new Error('Insufficient call options for Diagonal Calendar');
    }

    // Strike selection for diagonal calendar
    // Short strike: Slightly OTM (we want this to expire worthless)
    // Long strike: ATM or slightly ITM (we want this to retain value)
    
    const shortStrikeDistance = currentPrice * 0.05; // 5% OTM for short call
    const longStrikeDistance = currentPrice * 0.02;  // 2% OTM for long call (more conservative)

    const targetShortStrike = currentPrice + shortStrikeDistance;
    const targetLongStrike = currentPrice + longStrikeDistance;

    // Find strikes
    const shortStrike = this.findNearestStrike(targetShortStrike, shortTermCalls.map((c: any) => c.strike), 'above');
    const longStrike = this.findNearestStrike(targetLongStrike, longTermCalls.map((c: any) => c.strike), 'above');

    // Get option contracts
    const shortCallOption = shortTermCalls.find((c: any) => c.strike === shortStrike);
    const longCallOption = longTermCalls.find((c: any) => c.strike === longStrike);

    if (!shortCallOption || !longCallOption) {
      throw new Error('Could not find suitable strikes for Diagonal Calendar');
    }

    // Calculate premiums
    const shortCallPremium = (shortCallOption.bid + shortCallOption.ask) / 2 || shortCallOption.last;
    const longCallPremium = (longCallOption.bid + longCallOption.ask) / 2 || longCallOption.last;

    // Diagonal calendar should result in net debit (long premium > short premium)
    const netDebit = longCallPremium - shortCallPremium;

    if (netDebit <= 0) {
      throw new Error('Diagonal Calendar must result in net debit (long premium > short premium)');
    }

    console.log(`✅ Diagonal Calendar structure:`);
    console.log(`   Sell Short Call: ${shortStrike}@$${shortCallPremium} (${shortExpiration})`);
    console.log(`   Buy Long Call: ${longStrike}@$${longCallPremium} (${longExpiration})`);
    console.log(`💰 Net Debit: $${netDebit.toFixed(2)} per share ($${(netDebit * 100).toFixed(0)} per contract)`);

    return {
      longCallStrike: longStrike,
      longCallPremium,
      shortCallStrike: shortStrike,
      shortCallPremium,
      // Use put fields for additional data storage
      longPutStrike: longStrike,    // Same strike for compatibility
      longPutPremium: longCallPremium, // Same premium for compatibility
      shortPutStrike: shortStrike,
      shortPutPremium: shortCallPremium
    };
  }

  /**
   * Calculate Diagonal Calendar position metrics
   */
  calculatePosition(inputs: BaseStrategyInputs, data: StrikePremiumData): StrategyResult {
    const { currentPrice, daysToExpiry, expirationDate, impliedVolatility = 25, ivPercentile = 50 } = inputs;
    const { longCallStrike, longCallPremium, shortCallStrike, shortCallPremium } = data;

    if (!longCallStrike || !longCallPremium || !shortCallStrike || !shortCallPremium) {
      throw new Error('Missing required strike/premium data for Diagonal Calendar');
    }

    // Calculate breakevens (complex for diagonal calendar)
    const breakevens = this.calculateBreakevens(data);
    
    // Calculate max profit/loss
    const profitLoss = this.calculateMaxProfitLoss(data);
    
    // Net debit calculation
    const netDebit = (longCallPremium - shortCallPremium) * 100;

    return {
      strategyType: strategyTypes.DIAGONAL_CALENDAR,
      longPutStrike: longCallStrike,    // Using call data
      longCallStrike,
      longPutPremium: longCallPremium,  // Using call data
      longCallPremium,
      shortPutStrike: shortCallStrike,  // Using call data
      shortCallStrike,
      shortPutPremium: shortCallPremium, // Using call data
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
      netDebit,
      profitZone: {
        lower: Math.min(shortCallStrike, longCallStrike) * 0.95,
        upper: Math.max(shortCallStrike, longCallStrike) * 1.05
      },
      riskProfile: 'medium' // Time decay dependent
    };
  }

  /**
   * Calculate breakeven points (approximation for diagonal calendar)
   */
  protected calculateBreakevens(data: StrikePremiumData): { lowerBreakeven: number; upperBreakeven: number } {
    const netDebit = data.longCallPremium! - data.shortCallPremium!;
    const avgStrike = (data.longCallStrike! + data.shortCallStrike!) / 2;
    
    // Approximate breakevens (actual calculation is complex due to different expirations)
    return {
      lowerBreakeven: avgStrike - (netDebit * 2),
      upperBreakeven: avgStrike + (netDebit * 2)
    };
  }

  /**
   * Calculate maximum profit and loss (estimates for diagonal calendar)
   */
  protected calculateMaxProfitLoss(data: StrikePremiumData): { maxProfit: number; maxLoss: number } {
    const netDebit = data.longCallPremium! - data.shortCallPremium!;
    const strikeSpread = Math.abs(data.longCallStrike! - data.shortCallStrike!);
    
    return {
      maxProfit: (data.shortCallPremium! + strikeSpread * 0.5) * 100, // Estimated max profit
      maxLoss: netDebit * 100 // Net debit paid
    };
  }

  /**
   * Get P&L at specific stock price (simplified for diagonal calendar)
   */
  getProfitLossAtPrice(price: number, data: StrikePremiumData): number {
    const { longCallStrike, shortCallStrike, longCallPremium, shortCallPremium } = data;
    
    if (!longCallStrike || !shortCallStrike || !longCallPremium || !shortCallPremium) {
      return 0;
    }

    const netDebit = longCallPremium - shortCallPremium;
    const avgStrike = (longCallStrike + shortCallStrike) / 2;
    
    // Simplified P&L calculation (actual is complex due to different time decays)
    if (Math.abs(price - avgStrike) <= avgStrike * 0.05) {
      // Near optimal zone
      return (shortCallPremium * 0.8 - netDebit) * 100;
    } else {
      // Away from optimal zone
      return -netDebit * 100;
    }
  }

  /**
   * Get strategy parameters
   */
  getStrategyParameters() {
    return {
      optimalDaysToExpiry: 35, // 4-8 weeks optimal
      riskLevel: 'medium' as const,
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
      name: 'Diagonal Calendar Spread',
      description: 'Sell a short-term option and buy a longer-term option with different strikes. Profits from time decay of the short option while maintaining upside potential with the long option.',
      marketOutlook: 'Neutral to slightly bullish. Expects short-term consolidation followed by gradual upward movement.',
      entryRules: [
        'Enter when front-month IV > back-month IV',
        'Choose short strike slightly OTM (5-10%)',
        'Choose long strike near ATM or slightly ITM',
        'Target 30-60 days difference between expirations',
        'Look for net debit < 50% of strike difference'
      ],
      exitRules: [
        'Close short leg at 50-75% profit',
        'Hold long leg if still profitable after short expires',
        'Exit entire position if short strike breached',
        'Consider rolling short leg if challenged early'
      ],
      riskManagement: [
        'Maximum loss limited to net debit paid',
        'Monitor early assignment risk on short leg',
        'Close before short expiration if ITM',
        'Manage as two separate positions after short expires',
        'Size conservatively due to complexity'
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
