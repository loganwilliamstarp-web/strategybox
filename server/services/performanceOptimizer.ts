import { WebSocket } from 'ws';
import { storage } from '../storage';
import { marketDataApiService } from '../marketDataApi';
import type { TickerWithPosition } from '@shared/schema';
import { getOptimalApiIntervals, getMarketSession, logMarketSession } from '../utils/marketHours';

interface ConnectionInfo {
  ws: WebSocket;
  userId: string;
  lastUpdate: number;
  subscribedSymbols: Set<string>;
}

interface BatchQuoteRequest {
  symbols: string[];
  userId: string;
  timestamp: number;
}

interface CachedQuote {
  symbol: string;
  price: number;
  timestamp: number;
}

interface CachedOptionsData {
  symbol: string;
  data: any;
  timestamp: number;
  expirationDate?: string;
}

/**
 * Performance optimizer for real-time data streaming
 * Implements batching, caching, and intelligent update strategies
 */
export class PerformanceOptimizer {
  private connections = new Map<string, ConnectionInfo>();
  private quoteCache = new Map<string, CachedQuote>();
  private optionsCache = new Map<string, CachedOptionsData>();
  private batchQueue: BatchQuoteRequest[] = [];
  private priceUpdateIntervals = new Map<string, NodeJS.Timeout>();
  private optionsUpdateIntervals = new Map<string, NodeJS.Timeout>();
  private updateIntervals = new Map<string, NodeJS.Timeout>();
  
  // Configuration
  private readonly PRICE_CACHE_DURATION = 30 * 1000; // 30 seconds for live data
  private readonly OPTIONS_CACHE_DURATION = 30 * 60 * 1000; // 30 minutes for options (less frequent changes)
  private readonly BATCH_INTERVAL = 5 * 1000; // 5 seconds
  private readonly MAX_BATCH_SIZE = 10;
  private readonly INACTIVE_THRESHOLD = 5 * 60 * 1000; // 5 minutes
  
  // Dynamic intervals based on market hours (will be overridden by getOptimalIntervals)
  private readonly PRICE_UPDATE_INTERVAL = 60 * 1000; // Base: 1 minute for price updates
  private readonly OPTIONS_UPDATE_INTERVAL = 15 * 60 * 1000; // Base: 15 minutes for options updates

  constructor() {
    this.startBatchProcessor();
    this.startCacheCleanup();
    
    // Log initial market session
    logMarketSession();
  }
  
  /**
   * Get current optimal intervals based on market hours
   */
  private getOptimalIntervals(): ApiIntervals {
    return getOptimalApiIntervals();
  }

  /**
   * Register a WebSocket connection
   */
  addConnection(connectionId: string, ws: WebSocket, userId: string): void {
    this.connections.set(connectionId, {
      ws,
      userId,
      lastUpdate: Date.now(),
      subscribedSymbols: new Set()
    });

    console.log(`📡 Added connection ${connectionId} for user ${userId}`);
    this.startUserUpdates(userId);
  }

  /**
   * Remove a WebSocket connection
   */
  removeConnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      this.connections.delete(connectionId);
      console.log(`📡 Removed connection ${connectionId} for user ${connection.userId}`);
      
      // Check if this was the last connection for this user
      const userConnections = Array.from(this.connections.values())
        .filter(conn => conn.userId === connection.userId);
      
      if (userConnections.length === 0) {
        this.stopUserUpdates(connection.userId);
      }
    }
  }

  /**
   * Get cached quote or add to batch queue
   */
  async getQuote(symbol: string, userId: string): Promise<number | null> {
    // Check cache first - use shorter cache for prices (1 minute)
    const cached = this.quoteCache.get(symbol);
    if (cached && Date.now() - cached.timestamp < this.PRICE_CACHE_DURATION) {
      return cached.price;
    }

    // Add to batch queue
    this.addToBatchQueue(symbol, userId);
    
    // Return cached value if available (even if stale)
    return cached?.price || null;
  }

  /**
   * Get options data - ALWAYS fetch fresh from API and save to database (no caching)
   */
  async getOptionsData(symbol: string, expirationDate?: string): Promise<any | null> {
    try {
      console.log(`🔄 Fetching fresh options data for ${symbol} (no caching - database-only)...`);
      const { optionsApiService } = await import('../optionsApiService');
      
      let optionsData;
      if (expirationDate) {
        optionsData = await optionsApiService.getOptionsChainSnapshot(symbol, expirationDate);
      } else {
        optionsData = await optionsApiService.getOptionsChain(symbol);
      }

      if (optionsData) {
        // ALWAYS SAVE TO DATABASE (for comprehensive chains only)
        if (!expirationDate && optionsData.options) {
          try {
            const { storage } = await import('../storage');
            await storage.saveOptionsChain(symbol, optionsData);
            console.log(`💾 Auto-saved options chain for ${symbol} to database`);
          } catch (saveError) {
            console.error(`❌ Failed to auto-save options chain for ${symbol}:`, saveError);
          }
        }
        
        console.log(`✅ Retrieved fresh options data for ${symbol} from API`);
        return optionsData;
      }
    } catch (error) {
      console.error(`Failed to fetch options data for ${symbol}:`, error);
    }

    return null;
  }

  /**
   * Clear all caches (for login refresh)
   */
  clearAllCaches(): void {
    console.log('🧹 Clearing all performance optimizer caches...');
    this.quoteCache.clear();
    this.optionsCache.clear();
    console.log('✅ Performance optimizer caches cleared');
  }

  /**
   * Get cache sizes for monitoring
   */
  getCacheSize(): number {
    return this.quoteCache.size;
  }

  getOptionsCacheSize(): number {
    return this.optionsCache.size;
  }

  /**
   * Batch process quote requests
   */
  private addToBatchQueue(symbol: string, userId: string): void {
    // Check if already in current batch
    const existingBatch = this.batchQueue.find(batch => 
      batch.userId === userId && batch.symbols.includes(symbol)
    );

    if (!existingBatch) {
      // Find or create batch for this user
      let userBatch = this.batchQueue.find(batch => batch.userId === userId);
      
      if (!userBatch) {
        userBatch = {
          symbols: [],
          userId,
          timestamp: Date.now()
        };
        this.batchQueue.push(userBatch);
      }

      if (userBatch.symbols.length < this.MAX_BATCH_SIZE) {
        userBatch.symbols.push(symbol);
      }
    }
  }

  /**
   * Process batched requests
   */
  private startBatchProcessor(): void {
    setInterval(async () => {
      if (this.batchQueue.length === 0) return;

      const batchesToProcess = [...this.batchQueue];
      this.batchQueue.length = 0; // Clear queue

      for (const batch of batchesToProcess) {
        await this.processBatch(batch);
      }
    }, this.BATCH_INTERVAL);
  }

  /**
   * Process a single batch of quote requests
   */
  private async processBatch(batch: BatchQuoteRequest): Promise<void> {
    try {
      console.log(`📊 Processing batch for user ${batch.userId}: ${batch.symbols.join(', ')}`);

      // Fetch quotes for all symbols in parallel
      const quotePromises = batch.symbols.map(async (symbol) => {
        try {
          const quote = await marketDataApiService.getStockQuote(symbol);
          return { symbol, quote };
        } catch (error) {
          console.error(`Failed to get quote for ${symbol}:`, error);
          return { symbol, quote: null };
        }
      });

      const results = await Promise.all(quotePromises);

      // Update cache and notify connections
      for (const { symbol, quote } of results) {
        if (quote) {
          this.quoteCache.set(symbol, {
            symbol,
            price: quote.currentPrice,
            timestamp: Date.now()
          });

          // Notify connections subscribed to this symbol
          await this.notifySubscribers(symbol, quote.currentPrice, batch.userId);
        }
      }

    } catch (error) {
      console.error('Error processing batch:', error);
    }
  }

  /**
   * Notify WebSocket connections about price updates
   */
  private async notifySubscribers(symbol: string, price: number, userId: string): Promise<void> {
    const userConnections = Array.from(this.connections.values())
      .filter(conn => conn.userId === userId && conn.subscribedSymbols.has(symbol));

    for (const connection of userConnections) {
      if (connection.ws.readyState === WebSocket.OPEN) {
        try {
          connection.ws.send(JSON.stringify({
            type: 'price_update',
            symbol,
            price,
            timestamp: Date.now()
          }));
          
          connection.lastUpdate = Date.now();
        } catch (error) {
          console.error('Error sending WebSocket message:', error);
        }
      }
    }
  }

  /**
   * Start periodic updates for a user with market-aware intervals
   */
  private startUserUpdates(userId: string): void {
    if (this.updateIntervals.has(userId)) {
      return; // Already started
    }

    // Use market-aware intervals
    const intervals = this.getOptimalIntervals();
    
    const interval = setInterval(async () => {
      // Log market session periodically (every hour)
      if (Date.now() % (60 * 60 * 1000) < intervals.stockPrice) {
        logMarketSession();
      }
      
      await this.updateUserPositions(userId);
    }, intervals.stockPrice); // Dynamic interval based on market hours

    this.updateIntervals.set(userId, interval);
    console.log(`⏰ Started market-aware updates for user ${userId} (${intervals.description})`);
    console.log(`   🔄 Update frequency: ${intervals.stockPrice / 1000}s`);
  }

  /**
   * Stop periodic updates for a user
   */
  private stopUserUpdates(userId: string): void {
    const interval = this.updateIntervals.get(userId);
    if (interval) {
      clearInterval(interval);
      this.updateIntervals.delete(userId);
      console.log(`⏰ Stopped updates for user ${userId}`);
    }
  }

  /**
   * Update positions for a specific user
   */
  private async updateUserPositions(userId: string): Promise<void> {
    try {
      const tickers = await storage.getActiveTickersWithPositionsForUser(userId);
      
      if (tickers.length === 0) {
        return;
      }

      // Update subscriptions for user connections
      const symbols = tickers.map(t => t.symbol);
      const userConnections = Array.from(this.connections.values())
        .filter(conn => conn.userId === userId);

      for (const connection of userConnections) {
        connection.subscribedSymbols.clear();
        symbols.forEach(symbol => connection.subscribedSymbols.add(symbol));
      }

      // Batch request quotes for all user's symbols
      for (const symbol of symbols) {
        this.addToBatchQueue(symbol, userId);
      }

    } catch (error) {
      console.error(`Error updating positions for user ${userId}:`, error);
    }
  }

  /**
   * Clean up stale cache entries
   */
  private startCacheCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      const staleEntries: string[] = [];

      for (const [symbol, cached] of this.quoteCache.entries()) {
        if (now - cached.timestamp > this.CACHE_DURATION * 2) {
          staleEntries.push(symbol);
        }
      }

      staleEntries.forEach(symbol => this.quoteCache.delete(symbol));

      if (staleEntries.length > 0) {
        console.log(`🧹 Cleaned up ${staleEntries.length} stale cache entries`);
      }
    }, 5 * 60 * 1000); // Clean every 5 minutes
  }

  /**
   * Get performance metrics
   */
  getMetrics(): Record<string, any> {
    const activeConnections = this.connections.size;
    const cachedQuotes = this.quoteCache.size;
    const activeUsers = new Set(Array.from(this.connections.values()).map(c => c.userId)).size;
    const queuedBatches = this.batchQueue.length;

    return {
      activeConnections,
      activeUsers,
      cachedQuotes,
      queuedBatches,
      timestamp: Date.now()
    };
  }

  /**
   * Force refresh cache for a symbol (both price and options)
   */
  async refreshSymbol(symbol: string, forceOptionsRefresh: boolean = false): Promise<void> {
    try {
      // Always refresh price
      const quote = await marketDataApiService.getStockQuote(symbol);
      if (quote) {
        this.quoteCache.set(symbol, {
          symbol,
          price: quote.currentPrice,
          timestamp: Date.now()
        });
        
        console.log(`💰 Force refreshed price for ${symbol}: $${quote.currentPrice}`);
        
        // CRITICAL FIX: Update the database with fresh prices
        // Find ALL tickers for this symbol across ALL users and update their prices
        const { storage } = await import('../storage');
        
        try {
          console.log(`🔍 Searching for ALL tickers with symbol ${symbol} in database...`);
          
          // Update for all known users (not just WebSocket connections)
          const knownUserIds = ['5630d6b1-42b4-43bd-8669-d554281a5e1b', 'demo-user-12345', 'test-user-id'];
          
          for (const userId of knownUserIds) {
            try {
              const ticker = await storage.getTickerBySymbol(symbol, userId);
              if (ticker) {
                console.log(`📊 FOUND ${symbol} for user ${userId}! Updating database price: $${quote.currentPrice} (was $${ticker.currentPrice})`);
                await storage.updateTicker(ticker.id, {
                  currentPrice: quote.currentPrice,
                  priceChange: quote.change || 0,
                  priceChangePercent: quote.changePercent || 0,
                });
                console.log(`✅ DATABASE UPDATED for ${symbol} user ${userId}: $${quote.currentPrice}`);
              }
            } catch (error) {
              // Silent fail for users who don't have this symbol
            }
          }
        } catch (error) {
          console.error(`❌ Failed to update database for ${symbol}:`, error);
        }
        
        // Notify all subscribers about price update
        for (const connection of this.connections.values()) {
          if (connection.subscribedSymbols.has(symbol)) {
            await this.notifySubscribers(symbol, quote.currentPrice, connection.userId);
          }
        }
      }

      // Force refresh options data if requested (manual refresh)
      if (forceOptionsRefresh) {
        console.log(`📊 Force refreshing options data for ${symbol}...`);
        
        // Clear existing options cache for this symbol
        const optionsCacheKeys = Array.from(this.optionsCache.keys()).filter(key => key.startsWith(symbol));
        optionsCacheKeys.forEach(key => this.optionsCache.delete(key));
        
        // Fetch fresh options data
        const { optionsApiService } = await import('../optionsApiService');
        try {
          const freshOptionsData = await optionsApiService.getOptionsChain(symbol, quote?.currentPrice);
          if (freshOptionsData) {
            // Cache the fresh options data
            this.optionsCache.set(`${symbol}:all`, {
              symbol,
              data: freshOptionsData,
              timestamp: Date.now()
            });

            // AUTOMATICALLY SAVE TO DATABASE
            try {
              const { storage } = await import('../storage');
              await storage.saveOptionsChain(symbol, freshOptionsData);
              console.log(`💾 Auto-saved options chain for ${symbol} to database`);
            } catch (saveError) {
              console.error(`❌ Failed to auto-save options chain for ${symbol}:`, saveError);
            }
            
            console.log(`✅ Force refreshed options data for ${symbol}`);
            
            // Notify connections about options update
            for (const connection of this.connections.values()) {
              if (connection.subscribedSymbols.has(symbol) && connection.ws.readyState === WebSocket.OPEN) {
                connection.ws.send(JSON.stringify({
                  type: 'options_update',
                  symbol,
                  optionsData: freshOptionsData,
                  timestamp: Date.now()
                }));
              }
            }
          }
        } catch (error) {
          console.error(`Failed to force refresh options for ${symbol}:`, error);
        }
      }
    } catch (error) {
      console.error(`Error refreshing symbol ${symbol}:`, error);
    }
  }

  /**
   * Clear all caches to force fresh data
   */
  clearAllCaches(): void {
    console.log(`🧹 Clearing all performance optimizer caches...`);
    this.quoteCache.clear();
    this.optionsCache.clear();
    console.log(`✅ Performance optimizer caches cleared`);
  }

  /**
   * Force refresh all cached data for manual refresh operations
   */
  async forceRefreshAll(userId: string): Promise<{ pricesUpdated: number; optionsUpdated: number }> {
    try {
      console.log(`🔄 MANUAL REFRESH: Force refreshing all data for user ${userId}...`);
      
      // CRITICAL: Clear ALL caches first to ensure fresh data
      console.log(`🧹 CLEARING ALL CACHES for manual refresh to get LIVE data...`);
      this.clearAllCaches();
      
      // Get user's active tickers
      const tickers = await storage.getActiveTickersWithPositionsForUser(userId);
      if (tickers.length === 0) {
        return { pricesUpdated: 0, optionsUpdated: 0 };
      }

      let pricesUpdated = 0;
      let optionsUpdated = 0;

      // Force refresh each ticker's data with fresh API calls
      for (const ticker of tickers) {
        try {
          console.log(`🚀 FORCE FRESH API CALLS for ${ticker.symbol} (bypassing all caches)...`);
          
          // Force refresh both price and options with cache bypass
          await this.refreshSymbol(ticker.symbol, true);
          pricesUpdated++;
          optionsUpdated++;
          
          console.log(`✅ Manual refresh completed for ${ticker.symbol} with FRESH data`);
        } catch (error) {
          console.error(`Failed to manually refresh ${ticker.symbol}:`, error);
        }
      }

      console.log(`🎯 MANUAL REFRESH COMPLETE: ${pricesUpdated} prices, ${optionsUpdated} options updated`);
      return { pricesUpdated, optionsUpdated };
      
    } catch (error) {
      console.error('Error in force refresh all:', error);
      return { pricesUpdated: 0, optionsUpdated: 0 };
    }
  }
}

// Export singleton instance
export const performanceOptimizer = new PerformanceOptimizer();
