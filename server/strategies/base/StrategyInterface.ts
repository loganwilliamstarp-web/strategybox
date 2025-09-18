import type { StrategyType } from "@shared/schema";

// Base input interface for all strategies
export interface BaseStrategyInputs {
  strategyType: StrategyType;
  symbol: string;
  currentPrice: number;
  expirationDate: string;
  daysToExpiry: number;
  impliedVolatility?: number;
  ivPercentile?: number;
}

// Strike and premium data for multi-leg strategies
export interface StrikePremiumData {
  // Long positions (we buy)
  longPutStrike?: number;
  longCallStrike?: number;
  longPutPremium?: number;
  longCallPremium?: number;
  
  // Short positions (we sell)
  shortPutStrike?: number;
  shortCallStrike?: number;
  shortPutPremium?: number;
  shortCallPremium?: number;
  
  // Additional legs for complex strategies
  additionalStrikes?: {
    strike: number;
    premium: number;
    type: 'call' | 'put';
    action: 'buy' | 'sell';
  }[];
}

// Complete strategy calculation result
export interface StrategyResult {
  strategyType: StrategyType;
  
  // Core position data
  longPutStrike: number;
  longCallStrike: number;
  longPutPremium: number;
  longCallPremium: number;
  
  // Additional legs for complex strategies
  shortPutStrike?: number;
  shortCallStrike?: number;
  shortPutPremium?: number;
  shortCallPremium?: number;
  
  // P&L calculations
  lowerBreakeven: number;
  upperBreakeven: number;
  maxLoss: number;
  maxProfit?: number;
  
  // Market data
  atmValue: number;
  impliedVolatility: number;
  ivPercentile: number;
  daysToExpiry: number;
  expirationDate: string;
  
  // Strategy-specific metadata
  netDebit?: number;    // For debit strategies
  netCredit?: number;   // For credit strategies
  profitZone?: {        // Define profit zones
    lower: number;
    upper: number;
  };
  riskProfile: 'low' | 'medium' | 'high' | 'unlimited';
  
  // Greeks (optional - can be calculated from market data)
  totalDelta?: number;
  totalGamma?: number;
  totalTheta?: number;
  totalVega?: number;
}

// Market data interface for real-time pricing
export interface MarketDataInput {
  symbol: string;
  currentPrice: number;
  optionsChain?: any;
  expirationDate?: string;
}

// Abstract base class for all options strategies
export abstract class BaseOptionsStrategy {
  protected strategyType: StrategyType;
  
  constructor(strategyType: StrategyType) {
    this.strategyType = strategyType;
  }

  /**
   * Calculate optimal strikes from market data
   */
  abstract findOptimalStrikes(inputs: BaseStrategyInputs, marketData: MarketDataInput): Promise<StrikePremiumData>;

  /**
   * Calculate position P&L and metrics
   */
  abstract calculatePosition(inputs: BaseStrategyInputs, strikePremiumData: StrikePremiumData): StrategyResult;

  /**
   * Get strategy-specific parameters
   */
  abstract getStrategyParameters(): {
    optimalDaysToExpiry: number;
    riskLevel: 'low' | 'medium' | 'high' | 'unlimited';
    complexity: 'simple' | 'intermediate' | 'advanced';
    capitalRequirement: 'low' | 'medium' | 'high';
    directionality: 'bullish' | 'bearish' | 'neutral' | 'volatile';
  };

  /**
   * Validate strategy inputs
   */
  protected validateInputs(inputs: BaseStrategyInputs): void {
    if (!inputs.symbol || inputs.symbol.length === 0) {
      throw new Error('Symbol is required');
    }
    if (inputs.currentPrice <= 0) {
      throw new Error('Current price must be positive');
    }
    if (inputs.daysToExpiry < 0) {
      throw new Error('Days to expiry cannot be negative');
    }
    if (!inputs.expirationDate) {
      throw new Error('Expiration date is required');
    }
  }

  /**
   * Calculate breakeven points for the strategy
   */
  protected abstract calculateBreakevens(strikePremiumData: StrikePremiumData): {
    lowerBreakeven: number;
    upperBreakeven: number;
  };

  /**
   * Calculate maximum profit and loss for the strategy
   */
  protected abstract calculateMaxProfitLoss(strikePremiumData: StrikePremiumData): {
    maxProfit?: number;
    maxLoss: number;
  };

  /**
   * Get profit/loss at a specific stock price at expiration
   */
  abstract getProfitLossAtPrice(price: number, strikePremiumData: StrikePremiumData): number;

  /**
   * Get strategy description and trading rules
   */
  abstract getDescription(): {
    name: string;
    description: string;
    marketOutlook: string;
    entryRules: string[];
    exitRules: string[];
    riskManagement: string[];
  };

  /**
   * Main entry point - calculate complete strategy
   */
  async calculate(inputs: BaseStrategyInputs, marketData: MarketDataInput): Promise<StrategyResult> {
    // Validate inputs
    this.validateInputs(inputs);
    
    // Find optimal strikes from market data
    const strikePremiumData = await this.findOptimalStrikes(inputs, marketData);
    
    // Calculate position
    const result = this.calculatePosition(inputs, strikePremiumData);
    
    // Validate result
    this.validateResult(result);
    
    return result;
  }

  /**
   * Validate calculation result
   */
  private validateResult(result: StrategyResult): void {
    if (result.maxLoss <= 0 && result.maxLoss !== Number.MAX_SAFE_INTEGER) {
      throw new Error('Invalid max loss calculation');
    }
    if (result.lowerBreakeven >= result.upperBreakeven) {
      throw new Error('Invalid breakeven calculation');
    }
  }
}
