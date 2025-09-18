import type { StrategyType } from '@shared/schema';
import { strategyTypes } from '@shared/schema';
import { BaseOptionsStrategy, type BaseStrategyInputs, type StrategyResult, type MarketDataInput } from './base/StrategyInterface';

// Import all strategy implementations
import { LongStrangleStrategy } from './LongStrangleStrategy';
import { ShortStrangleStrategy } from './ShortStrangleStrategy';
import { IronCondorStrategy } from './IronCondorStrategy';
import { ButterflySpreadStrategy } from './ButterflySpreadStrategy';
import { DiagonalCalendarStrategy } from './DiagonalCalendarStrategy';

/**
 * Strategy Factory - Clean pattern for strategy selection and execution
 * Ensures each strategy is implemented independently with accurate calculations
 */
export class StrategyFactory {
  private strategies = new Map<StrategyType, BaseOptionsStrategy>();

  constructor() {
    // Register all available strategies
    this.strategies.set(strategyTypes.LONG_STRANGLE, new LongStrangleStrategy());
    this.strategies.set(strategyTypes.SHORT_STRANGLE, new ShortStrangleStrategy());
    this.strategies.set(strategyTypes.IRON_CONDOR, new IronCondorStrategy());
    this.strategies.set(strategyTypes.BUTTERFLY_SPREAD, new ButterflySpreadStrategy());
    this.strategies.set(strategyTypes.DIAGONAL_CALENDAR, new DiagonalCalendarStrategy());
  }

  /**
   * Get strategy implementation
   */
  getStrategy(strategyType: StrategyType): BaseOptionsStrategy {
    const strategy = this.strategies.get(strategyType);
    
    if (!strategy) {
      throw new Error(`Strategy ${strategyType} not implemented`);
    }
    
    return strategy;
  }

  /**
   * Calculate position for any strategy type
   */
  async calculatePosition(
    strategyType: StrategyType,
    inputs: Omit<BaseStrategyInputs, 'strategyType'>,
    marketData: MarketDataInput
  ): Promise<StrategyResult> {
    const strategy = this.getStrategy(strategyType);
    
    const fullInputs: BaseStrategyInputs = {
      ...inputs,
      strategyType
    };

    console.log(`🎯 Calculating ${strategyType} for ${inputs.symbol}`);
    
    try {
      const result = await strategy.calculate(fullInputs, marketData);
      
      console.log(`✅ ${strategyType} calculation completed for ${inputs.symbol}`);
      console.log(`   Max Loss: $${result.maxLoss}`);
      console.log(`   Max Profit: ${result.maxProfit ? `$${result.maxProfit}` : 'Unlimited'}`);
      console.log(`   Breakevens: $${result.lowerBreakeven.toFixed(2)} - $${result.upperBreakeven.toFixed(2)}`);
      
      return result;
      
    } catch (error) {
      console.error(`❌ Error calculating ${strategyType} for ${inputs.symbol}:`, error);
      throw error;
    }
  }

  /**
   * Get all available strategies with their metadata
   */
  getAvailableStrategies(): Array<{
    type: StrategyType;
    name: string;
    description: string;
    parameters: ReturnType<BaseOptionsStrategy['getStrategyParameters']>;
  }> {
    return Array.from(this.strategies.entries()).map(([type, strategy]) => ({
      type,
      name: strategy.getDescription().name,
      description: strategy.getDescription().description,
      parameters: strategy.getStrategyParameters()
    }));
  }

  /**
   * Get strategy description and trading rules
   */
  getStrategyInfo(strategyType: StrategyType) {
    const strategy = this.getStrategy(strategyType);
    return strategy.getDescription();
  }

  /**
   * Get strategy parameters
   */
  getStrategyParameters(strategyType: StrategyType) {
    const strategy = this.getStrategy(strategyType);
    return strategy.getStrategyParameters();
  }

  /**
   * Calculate P&L curve data for charting
   */
  calculatePLCurve(
    strategyType: StrategyType,
    result: StrategyResult,
    priceRange: { min: number; max: number; points: number }
  ): Array<{ price: number; profitLoss: number }> {
    const strategy = this.getStrategy(strategyType);
    const data = [];
    
    const step = (priceRange.max - priceRange.min) / priceRange.points;
    
    for (let price = priceRange.min; price <= priceRange.max; price += step) {
      const profitLoss = strategy.getProfitLossAtPrice(price, {
        longPutStrike: result.longPutStrike,
        longCallStrike: result.longCallStrike,
        longPutPremium: result.longPutPremium,
        longCallPremium: result.longCallPremium,
        shortPutStrike: result.shortPutStrike,
        shortCallStrike: result.shortCallStrike,
        shortPutPremium: result.shortPutPremium,
        shortCallPremium: result.shortCallPremium
      });
      
      data.push({
        price: Math.round(price * 100) / 100,
        profitLoss: Math.round(profitLoss)
      });
    }
    
    return data;
  }

  /**
   * Validate strategy inputs
   */
  validateStrategyInputs(strategyType: StrategyType, inputs: any): boolean {
    try {
      const strategy = this.getStrategy(strategyType);
      // Basic validation - each strategy will do detailed validation
      return true;
    } catch (error) {
      console.error(`Strategy validation failed for ${strategyType}:`, error);
      return false;
    }
  }

  /**
   * Get recommended position sizing for strategy
   */
  getRecommendedPositionSize(strategyType: StrategyType, portfolioValue: number): {
    maxPositionSize: number;
    recommendedSize: number;
    reasoning: string;
  } {
    const params = this.getStrategyParameters(strategyType);
    
    let maxPercent: number;
    let recommendedPercent: number;
    let reasoning: string;

    switch (params.riskLevel) {
      case 'low':
        maxPercent = 0.10; // 10% max
        recommendedPercent = 0.05; // 5% recommended
        reasoning = 'Low risk strategy - can size larger positions';
        break;
      case 'medium':
        maxPercent = 0.05; // 5% max
        recommendedPercent = 0.02; // 2% recommended
        reasoning = 'Medium risk strategy - moderate position sizing';
        break;
      case 'high':
        maxPercent = 0.03; // 3% max
        recommendedPercent = 0.01; // 1% recommended
        reasoning = 'High risk strategy - small position sizing required';
        break;
      case 'unlimited':
        maxPercent = 0.02; // 2% max
        recommendedPercent = 0.005; // 0.5% recommended
        reasoning = 'Unlimited risk strategy - very small positions only';
        break;
      default:
        maxPercent = 0.05;
        recommendedPercent = 0.02;
        reasoning = 'Default conservative sizing';
    }

    return {
      maxPositionSize: portfolioValue * maxPercent,
      recommendedSize: portfolioValue * recommendedPercent,
      reasoning
    };
  }
}

// Export singleton instance
export const strategyFactory = new StrategyFactory();

// Convenience function for backward compatibility
export async function calculateStrategy(
  strategyType: StrategyType,
  inputs: Omit<BaseStrategyInputs, 'strategyType'>,
  marketData: MarketDataInput
): Promise<StrategyResult> {
  return strategyFactory.calculatePosition(strategyType, inputs, marketData);
}
