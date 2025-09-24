import { storage } from "../storage";
import { optionsApiService } from "../optionsApiService";

/**
 * Background job to update options chain data in the database
 * This ensures we have fresh data available from the database instead of relying on API caching
 */
export class OptionsDataUpdater {
  private static instance: OptionsDataUpdater;
  private updateInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  private constructor() {}

  static getInstance(): OptionsDataUpdater {
    if (!OptionsDataUpdater.instance) {
      OptionsDataUpdater.instance = new OptionsDataUpdater();
    }
    return OptionsDataUpdater.instance;
  }

  /**
   * Start the background options data updater
   */
  start(intervalMinutes: number = 15): void {
    if (this.isRunning) {
      console.log('🔄 OptionsDataUpdater already running');
      return;
    }

    console.log(`🚀 Starting OptionsDataUpdater - updating every ${intervalMinutes} minutes`);
    this.isRunning = true;

    // Initial update
    this.updateOptionsData();

    // Set up recurring updates
    this.updateInterval = setInterval(() => {
      this.updateOptionsData();
    }, intervalMinutes * 60 * 1000);
  }

  /**
   * Stop the background options data updater
   */
  stop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    this.isRunning = false;
    console.log('🛑 OptionsDataUpdater stopped');
  }

  /**
   * Update options data for all active symbols across all users
   * OPTIMIZED: Only makes ONE API call per unique symbol regardless of how many users have it
   */
  private async updateOptionsData(): Promise<void> {
    try {
      console.log('🔄 OptionsDataUpdater: Starting OPTIMIZED options data update...');

      // Check for Saturday 8am historical data archival on every update cycle
      await storage.scheduleSaturdayArchival();

      // Get ALL unique symbols from ALL users (not just one user)
      const allTickers = await storage.getAllActiveTickersAcrossAllUsers();
      const uniqueSymbols = [...new Set(allTickers.map(ticker => ticker.symbol))];

      console.log(`📊 OptionsDataUpdater: Found ${uniqueSymbols.length} UNIQUE symbols across ALL users: ${uniqueSymbols.join(', ')}`);
      console.log(`📊 OptionsDataUpdater: Total tickers across all users: ${allTickers.length}`);

      let updatedCount = 0;
      let errorCount = 0;

      // Process each UNIQUE symbol only once
      for (const symbol of uniqueSymbols) {
        try {
          console.log(`🔄 OptionsDataUpdater: Fetching ${symbol} options data (ONE API call for ALL users)...`);

          // Get fresh options data from API - ONLY ONE CALL PER SYMBOL
          const optionsChain = await optionsApiService.getOptionsChain(symbol);
          
          if (!optionsChain || !optionsChain.options || optionsChain.options.length === 0) {
            console.log(`⚠️ OptionsDataUpdater: No options data available for ${symbol}`);
            continue;
          }

          // Clear existing data for this symbol
          await storage.clearOptionsChainData(symbol);

          // Store new data in database - available for ALL users with this symbol
          await storage.updateOptionsChainData(symbol, optionsChain.options);

          // Count how many users benefit from this single API call
          const userCount = allTickers.filter(ticker => ticker.symbol === symbol).length;
          console.log(`✅ OptionsDataUpdater: Updated ${symbol} with ${optionsChain.options.length} options contracts (benefits ${userCount} users)`);
          updatedCount++;

        } catch (error) {
          console.error(`❌ OptionsDataUpdater: Failed to update ${symbol}:`, error);
          errorCount++;
        }
      }

      console.log(`🎯 OptionsDataUpdater: OPTIMIZED update completed - ${updatedCount} unique symbols updated, ${errorCount} errors`);
      console.log(`🎯 OptionsDataUpdater: Total users benefited: ${allTickers.length} tickers across all users`);

    } catch (error) {
      console.error('❌ OptionsDataUpdater: Failed to update options data:', error);
    }
  }

  /**
   * Force update options data for a specific symbol
   */
  async updateSymbol(symbol: string): Promise<boolean> {
    try {
      console.log(`🔄 OptionsDataUpdater: Force updating ${symbol}...`);

      const optionsChain = await optionsApiService.getOptionsChain(symbol);
      
      if (!optionsChain || !optionsChain.options || optionsChain.options.length === 0) {
        console.log(`⚠️ OptionsDataUpdater: No options data available for ${symbol}`);
        return false;
      }

      await storage.clearOptionsChainData(symbol);
      await storage.updateOptionsChainData(symbol, optionsChain.options);

      console.log(`✅ OptionsDataUpdater: Force updated ${symbol} with ${optionsChain.options.length} options contracts`);
      return true;

    } catch (error) {
      console.error(`❌ OptionsDataUpdater: Failed to force update ${symbol}:`, error);
      return false;
    }
  }

  /**
   * Get status of the updater
   */
  getStatus(): { isRunning: boolean; intervalMinutes: number } {
    return {
      isRunning: this.isRunning,
      intervalMinutes: this.updateInterval ? 15 : 0 // Default to 15 minutes
    };
  }
}

// Export singleton instance
export const optionsDataUpdater = OptionsDataUpdater.getInstance();
