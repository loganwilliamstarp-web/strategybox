import type { Express } from "express";
import { requireSupabaseAuth } from "../supabaseAuth";
import { rateLimitRules } from "../middleware/rateLimiter";

/**
 * Register data refresh routes for login-triggered data updates
 */
export function registerDataRefreshRoutes(app: Express): void {

  // Force refresh all cached data on login
  app.post("/api/refresh-all-data", requireSupabaseAuth, rateLimitRules.general, async (req: any, res) => {
    try {
      console.log(`🔄 Starting comprehensive data refresh for user: ${req.user?.email || req.user?.id}`);
      
      const refreshResults = {
        marketData: false,
        optionsChains: false,
        portfolioSummary: false,
        userTickers: false,
        timestamp: new Date().toISOString(),
        userId: req.user?.id
      };

      // 1. Clear all market data caches
      try {
        console.log('🧹 Clearing market data caches...');
        const { marketDataApiService } = await import('../marketDataApi');
        marketDataApiService.clearCache();
        refreshResults.marketData = true;
        console.log('✅ Market data cache cleared');
      } catch (error) {
        console.error('❌ Failed to clear market data cache:', error);
      }

      // 2. Clear performance optimizer caches
      try {
        console.log('🧹 Clearing performance optimizer caches...');
        const { performanceOptimizer } = await import('../services/performanceOptimizer');
        if (performanceOptimizer) {
          performanceOptimizer.clearAllCaches();
          refreshResults.optionsChains = true;
          console.log('✅ Performance optimizer cache cleared');
        }
      } catch (error) {
        console.error('❌ Failed to clear performance optimizer cache:', error);
      }

      // 3. Clear app cache (if using Redis/memory cache)
      try {
        console.log('🧹 Clearing app cache...');
        const { appCache } = await import('../cache/RedisCache');
        if (appCache) {
          appCache.clearAll();
          refreshResults.portfolioSummary = true;
          console.log('✅ App cache cleared');
        }
      } catch (error) {
        console.error('❌ Failed to clear app cache:', error);
      }

      // 4. Trigger fresh data fetch for user's tickers
      try {
        console.log('🔄 Triggering fresh ticker data fetch...');
        const { storage } = await import('../storage');
        const userTickers = await storage.getTickersForUser(req.user.id);
        
        if (userTickers && userTickers.length > 0) {
          console.log(`📊 Found ${userTickers.length} tickers for user, triggering refresh...`);
          
          // Trigger refresh for each ticker symbol
          const { performanceOptimizer } = await import('../services/performanceOptimizer');
          for (const ticker of userTickers) {
            try {
              await performanceOptimizer.refreshSymbol(ticker.symbol, true); // Full refresh with options
              console.log(`✅ Refreshed data for ${ticker.symbol}`);
            } catch (error) {
              console.error(`❌ Failed to refresh ${ticker.symbol}:`, error);
            }
          }
          
          refreshResults.userTickers = true;
        }
      } catch (error) {
        console.error('❌ Failed to refresh user tickers:', error);
      }

      // 5. Log comprehensive refresh results
      const successCount = Object.values(refreshResults).filter(result => 
        typeof result === 'boolean' && result
      ).length;
      
      console.log(`🎯 Data refresh completed: ${successCount}/4 components refreshed`);
      console.log('📊 Refresh results:', refreshResults);

      res.json({
        success: true,
        message: "Data refresh completed successfully",
        results: refreshResults,
        refreshedComponents: successCount,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('❌ Comprehensive data refresh failed:', error);
      res.status(500).json({
        success: false,
        error: "Failed to refresh data",
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Get refresh status (for monitoring)
  app.get("/api/refresh-status", requireSupabaseAuth, rateLimitRules.general, async (req: any, res) => {
    try {
      const { marketDataApiService } = await import('../marketDataApi');
      const { performanceOptimizer } = await import('../services/performanceOptimizer');
      
      const status = {
        marketDataConfigured: marketDataApiService.isConfigured(),
        performanceOptimizerActive: !!performanceOptimizer,
        cacheSizes: {
          quoteCache: performanceOptimizer?.getCacheSize?.() || 0,
          optionsCache: performanceOptimizer?.getOptionsCacheSize?.() || 0
        },
        timestamp: new Date().toISOString()
      };

      res.json(status);
    } catch (error) {
      console.error('❌ Failed to get refresh status:', error);
      res.status(500).json({
        error: "Failed to get refresh status",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}
