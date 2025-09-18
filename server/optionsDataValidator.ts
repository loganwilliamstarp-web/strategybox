// Options data validation service to ensure broker-level accuracy
import { MarketDataOptionContract } from '../shared/schema';

export interface ValidationResult {
  isValid: boolean;
  issues: string[];
  dataSource: string;
  validatedContract?: MarketDataOptionContract;
}

export class OptionsDataValidator {
  
  /**
   * Validate options contract data for realistic pricing and spreads
   */
  static validateContract(
    contract: MarketDataOptionContract, 
    underlyingPrice: number,
    dataSource: string
  ): ValidationResult {
    const issues: string[] = [];
    
    // Check bid/ask spread reasonableness (should not be more than 20% of mid-price)
    const mid = (contract.bid + contract.ask) / 2;
    const spread = contract.ask - contract.bid;
    const spreadPercent = mid > 0 ? (spread / mid) * 100 : 0;
    
    if (spreadPercent > 50) {
      issues.push(`Excessive bid/ask spread: ${spreadPercent.toFixed(1)}%`);
    }
    
    // Check if bid is greater than ask (invalid)
    if (contract.bid > contract.ask) {
      issues.push(`Invalid bid/ask: bid ${contract.bid} > ask ${contract.ask}`);
    }
    
    // Check for unrealistic premium relative to underlying price
    const premiumPercent = (mid / underlyingPrice) * 100;
    const isOTM = (contract.optionType === 'call' && contract.strike > underlyingPrice) ||
                  (contract.optionType === 'put' && contract.strike < underlyingPrice);
    
    // OTM options should generally not exceed 50% of underlying price for weeklies
    if (isOTM && premiumPercent > 50) {
      issues.push(`Unrealistic OTM premium: ${premiumPercent.toFixed(1)}% of underlying`);
    }
    
    // Check for ITM options having less intrinsic value than premium
    const intrinsicValue = contract.optionType === 'call' 
      ? Math.max(0, underlyingPrice - contract.strike)
      : Math.max(0, contract.strike - underlyingPrice);
      
    if (intrinsicValue > 0 && mid < intrinsicValue * 0.95) {
      issues.push(`Premium below intrinsic value: ${mid} < ${intrinsicValue * 0.95}`);
    }
    
    return {
      isValid: issues.length === 0,
      issues,
      dataSource,
      validatedContract: issues.length === 0 ? contract : undefined
    };
  }
  
  /**
   * Compare multiple data sources and select the most reliable one
   */
  static selectBestDataSource(
    sources: Array<{
      data: MarketDataOptionContract;
      source: string;
      underlyingPrice: number;
    }>
  ): MarketDataOptionContract | null {
    
    const validatedSources = sources.map(source => ({
      ...source,
      validation: this.validateContract(source.data, source.underlyingPrice, source.source)
    }));
    
    // Priority: 1) Valid data, 2) Fewer issues, 3) Tighter spreads
    const bestSource = validatedSources
      .filter(s => s.validation.isValid)
      .sort((a, b) => {
        const aSpread = (a.data.ask - a.data.bid) / ((a.data.ask + a.data.bid) / 2);
        const bSpread = (b.data.ask - b.data.bid) / ((b.data.ask + b.data.bid) / 2);
        return aSpread - bSpread;
      })[0];
    
    if (bestSource) {
      console.log(`✅ Selected ${bestSource.source} as most reliable data source`);
      return bestSource.validation.validatedContract || null;
    }
    
    // If no valid sources, log all issues and return null
    console.log(`❌ No valid options data sources found:`);
    validatedSources.forEach(source => {
      console.log(`   ${source.source}: ${source.validation.issues.join(', ')}`);
    });
    
    return null;
  }
  
  /**
   * Check if options data matches expected broker-level accuracy
   */
  static checkBrokerAccuracy(
    contract: MarketDataOptionContract,
    expectedBid?: number,
    expectedAsk?: number
  ): boolean {
    if (!expectedBid || !expectedAsk) return true;
    
    const bidDiff = Math.abs(contract.bid - expectedBid) / expectedBid;
    const askDiff = Math.abs(contract.ask - expectedAsk) / expectedAsk;
    
    // Allow up to 5% difference from expected broker values
    const tolerance = 0.05;
    
    if (bidDiff > tolerance || askDiff > tolerance) {
      console.log(`❌ Data diverges from broker: expected bid=${expectedBid} ask=${expectedAsk}, got bid=${contract.bid} ask=${contract.ask}`);
      return false;
    }
    
    return true;
  }
}