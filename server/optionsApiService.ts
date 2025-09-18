// Unified Options API Service
// Uses MarketData.app as primary source with fallback capabilities

import { OptionsDataProvider, OptionContract, OptionsChainData } from './optionsDataProvider';
import { marketDataApiService } from './marketDataApi';

// REMOVED: All theoretical pricing functions - system now exclusively uses real MarketData.app data

class UnifiedOptionsApiService implements OptionsDataProvider {

  // Get current stock price (MarketData primary, no fallback needed for stocks)
  async getStockQuote(symbol: string): Promise<{ currentPrice: number } | null> {
    try {
      return await marketDataApiService.getStockQuote(symbol);
    } catch (error) {
      console.error(`❌ Failed to get stock quote for ${symbol}:`, error);
      return null;
    }
  }

  // Get options chain with real market data and fallback capabilities
  async getOptionsChainSnapshot(symbol: string, expiration: string, realTimePrice?: number): Promise<OptionContract[]> {
    console.log(`🔄 Getting options data for ${symbol} ${expiration}...`);
    
    try {
      // Try MarketData.app first for real market quotes
      const marketDataContracts = await marketDataApiService.getOptionsChainSnapshot(symbol, expiration, realTimePrice);
      
      if (marketDataContracts && marketDataContracts.length > 0) {
        console.log(`✅ Using REAL MARKET DATA from MarketData.app: ${marketDataContracts.length} contracts`);
        return marketDataContracts;
      }
      
      // No theoretical fallback - MarketData.app with extended cache is the only source
      console.log(`❌ MarketData.app unavailable and no cached data for ${symbol} ${expiration}`);
      return [];
      
    } catch (error) {
      console.error(`❌ Error getting options data for ${symbol}:`, error);
      // No theoretical fallback - MarketData.app with extended cache is the only source
      console.log(`❌ MarketData.app error and no cached data for ${symbol} ${expiration}`);
      return [];
    }
  }

  // Get comprehensive options chain
  async getOptionsChain(symbol: string, realTimePrice?: number): Promise<OptionsChainData | null> {
    console.log(`🔄 Getting comprehensive options chain for ${symbol}...`);
    
    try {
      // Try MarketData.app first
      const marketDataChain = await marketDataApiService.getOptionsChain(symbol, realTimePrice);
      
      if (marketDataChain && marketDataChain.options.length > 0) {
        console.log(`✅ Using REAL MARKET DATA chain from MarketData.app: ${marketDataChain.options.length} options`);
        return marketDataChain;
      }
      
      // No theoretical fallback - MarketData.app with extended cache is the only source
      console.log(`❌ MarketData.app chain unavailable and no cached data for ${symbol}`);
      return null;
      
    } catch (error) {
      console.error(`❌ Error getting options chain for ${symbol}:`, error);
      // No theoretical fallback - MarketData.app with extended cache is the only source
      console.log(`❌ MarketData.app chain error and no cached data for ${symbol}`);
      return null;
    }
  }

  // REMOVED: generateTheoreticalPricing function - no longer generating theoretical prices

  // REMOVED: generateTheoreticalChain function - no longer generating theoretical chains
}

// Export the unified service
export const optionsApiService = new UnifiedOptionsApiService();