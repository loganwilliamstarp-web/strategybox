import type { OptionsCalculationInputs, OptionsCalculationResult } from '../positionCalculator';
import { strategyFactory } from './StrategyFactory';
import type { BaseStrategyInputs, MarketDataInput } from './base/StrategyInterface';
import { strategyTypes } from '@shared/schema';

/**
 * Adapter to bridge the new strategy system with existing calculator interface
 * Maintains backward compatibility while using the new modular strategy system
 */
export class StrategyCalculatorAdapter {

  /**
   * Calculate position using new strategy system (main entry point)
   */
  static async calculatePosition(inputs: OptionsCalculationInputs): Promise<OptionsCalculationResult> {
    try {
      console.log(`🎯 StrategyCalculatorAdapter: Calculating ${inputs.strategyType} for ${inputs.symbol}`);

      // Convert legacy inputs to new strategy inputs format
      const strategyInputs: BaseStrategyInputs = {
        strategyType: inputs.strategyType,
        symbol: inputs.symbol || 'UNKNOWN',
        currentPrice: inputs.currentPrice,
        expirationDate: inputs.expirationDate || this.getNextOptionsExpiration(),
        daysToExpiry: inputs.daysToExpiry ?? this.calculateDaysToExpiry(inputs.expirationDate),
        impliedVolatility: inputs.impliedVolatility,
        ivPercentile: inputs.ivPercentile
      };

      // Prepare market data
      const marketData: MarketDataInput = {
        symbol: inputs.symbol || 'UNKNOWN',
        currentPrice: inputs.currentPrice,
        optionsChain: inputs.optionsChain,
        expirationDate: inputs.expirationDate
      };

      // If no options chain provided, fetch it
      if (!marketData.optionsChain && inputs.symbol) {
        console.log(`📊 Fetching options chain for ${inputs.symbol}...`);
        const { optionsApiService } = await import('../optionsApiService');
        marketData.optionsChain = await optionsApiService.getOptionsChain(inputs.symbol, inputs.currentPrice);
      }

      if (!marketData.optionsChain) {
        throw new Error(`No options chain data available for ${inputs.symbol}`);
      }

      // Calculate using new strategy system
      const result = await strategyFactory.calculatePosition(
        inputs.strategyType,
        strategyInputs,
        marketData
      );

      // Convert back to legacy format for compatibility
      const legacyResult: OptionsCalculationResult = {
        strategyType: result.strategyType,
        longPutStrike: result.longPutStrike,
        longCallStrike: result.longCallStrike,
        longPutPremium: result.longPutPremium,
        longCallPremium: result.longCallPremium,
        shortPutStrike: result.shortPutStrike,
        shortCallStrike: result.shortCallStrike,
        shortPutPremium: result.shortPutPremium,
        shortCallPremium: result.shortCallPremium,
        lowerBreakeven: result.lowerBreakeven,
        upperBreakeven: result.upperBreakeven,
        maxLoss: result.maxLoss,
        maxProfit: result.maxProfit,
        atmValue: result.atmValue,
        impliedVolatility: result.impliedVolatility,
        ivPercentile: result.ivPercentile,
        daysToExpiry: result.daysToExpiry,
        expirationDate: result.expirationDate,
        longExpiration: result.expirationDate
      };

      console.log(`✅ StrategyCalculatorAdapter: ${inputs.strategyType} calculation completed`);
      return legacyResult;

    } catch (error) {
      console.error(`❌ StrategyCalculatorAdapter error for ${inputs.strategyType}:`, error);
      throw error;
    }
  }

  /**
   * Calculate optimal position (legacy compatibility)
   */
  static async calculateOptimalPosition(inputs: OptionsCalculationInputs): Promise<OptionsCalculationResult> {
    return this.calculatePosition(inputs);
  }

  /**
   * Get strategy information
   */
  static getStrategyInfo(strategyType: StrategyType) {
    return strategyFactory.getStrategyInfo(strategyType);
  }

  /**
   * Get all available strategies
   */
  static getAvailableStrategies() {
    return strategyFactory.getAvailableStrategies();
  }

  /**
   * Calculate P&L curve for charting
   */
  static calculatePLCurve(
    strategyType: StrategyType,
    result: OptionsCalculationResult,
    currentPrice: number
  ) {
    const priceRange = {
      min: currentPrice * 0.7,  // 30% below
      max: currentPrice * 1.3,  // 30% above
      points: 100
    };

    return strategyFactory.calculatePLCurve(strategyType, result, priceRange);
  }

  /**
   * Get recommended position sizing
   */
  static getRecommendedPositionSize(strategyType: StrategyType, portfolioValue: number) {
    return strategyFactory.getRecommendedPositionSize(strategyType, portfolioValue);
  }

  /**
   * Helper: Calculate days to expiry
   */
  private static calculateDaysToExpiry(expirationDate?: string): number {
    if (!expirationDate) return 30; // Default

    const today = new Date();
    const expiry = new Date(expirationDate);
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  }

  /**
   * Helper: Get next options expiration
   */
  private static getNextOptionsExpiration(): string {
    const today = new Date();
    const currentDay = today.getDay(); // 0=Sunday, 5=Friday
    
    // Calculate days until next Friday
    let daysUntilFriday;
    if (currentDay < 5) {
      daysUntilFriday = 5 - currentDay;
    } else if (currentDay === 5) {
      // If it's Friday after 4 PM ET, use next Friday
      daysUntilFriday = today.getHours() >= 16 ? 7 : 0;
    } else {
      // Saturday (6) to Friday = 6 days
      daysUntilFriday = 6;
    }
    
    const nextFriday = new Date(today);
    nextFriday.setDate(today.getDate() + daysUntilFriday);
    
    // Format as YYYY-MM-DD
    const year = nextFriday.getFullYear();
    const month = String(nextFriday.getMonth() + 1).padStart(2, '0');
    const day = String(nextFriday.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
  }

  /**
   * Validate strategy can be calculated with available data
   */
  static validateStrategyData(strategyType: StrategyType, marketData: MarketDataInput): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic validation
    if (!marketData.optionsChain?.options || marketData.optionsChain.options.length === 0) {
      errors.push('No options chain data available');
    }

    if (marketData.currentPrice <= 0) {
      errors.push('Invalid current price');
    }

    // Strategy-specific validation
    switch (strategyType) {
      case strategyTypes.LONG_STRANGLE:
      case strategyTypes.SHORT_STRANGLE:
        // Need both calls and puts
        if (marketData.optionsChain?.options) {
          const calls = marketData.optionsChain.options.filter((opt: any) => opt.contract_type === 'call');
          const puts = marketData.optionsChain.options.filter((opt: any) => opt.contract_type === 'put');
          
          if (calls.length === 0) errors.push('No call options available');
          if (puts.length === 0) errors.push('No put options available');
          
          if (calls.length < 3) warnings.push('Limited call option strikes available');
          if (puts.length < 3) warnings.push('Limited put option strikes available');
        }
        break;

      case strategyTypes.IRON_CONDOR:
        // Need at least 4 strikes of each type
        if (marketData.optionsChain?.options) {
          const calls = marketData.optionsChain.options.filter((opt: any) => opt.contract_type === 'call');
          const puts = marketData.optionsChain.options.filter((opt: any) => opt.contract_type === 'put');
          
          if (calls.length < 4) errors.push('Iron Condor requires at least 4 call strikes');
          if (puts.length < 4) errors.push('Iron Condor requires at least 4 put strikes');
        }
        break;

      case strategyTypes.BUTTERFLY_SPREAD:
        // Need at least 6 strikes
        if (marketData.optionsChain?.options) {
          const calls = marketData.optionsChain.options.filter((opt: any) => opt.contract_type === 'call');
          if (calls.length < 6) errors.push('Butterfly Spread requires at least 6 call strikes');
        }
        break;

      case strategyTypes.DIAGONAL_CALENDAR:
        // Need multiple expiration dates
        if (marketData.optionsChain?.options) {
          const expirations = new Set(marketData.optionsChain.options.map((opt: any) => opt.expiration_date));
          if (expirations.size < 2) errors.push('Diagonal Calendar requires multiple expiration dates');
        }
        break;
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}

// Export for easy access
export { strategyFactory };
