import { logger } from '../middleware/logger';

// Redis-compatible cache interface for future Redis implementation
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiry: number;
}

/**
 * In-memory cache with Redis-compatible interface
 * Can be easily swapped with actual Redis in production
 */
export class InMemoryCache {
  private cache = new Map<string, CacheEntry<any>>();
  private cleanupInterval: NodeJS.Timeout;
  
  constructor() {
    // Clean expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  /**
   * Set cache entry with TTL
   */
  async set<T>(key: string, value: T, ttlSeconds: number = 300): Promise<void> {
    const now = Date.now();
    const entry: CacheEntry<T> = {
      data: value,
      timestamp: now,
      expiry: now + (ttlSeconds * 1000)
    };

    this.cache.set(key, entry);
    
    logger.debug('Cache entry set', {
      key,
      ttlSeconds,
      cacheSize: this.cache.size
    });
  }

  /**
   * Get cache entry
   */
  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    
    if (!entry) {
      logger.debug('Cache miss', { key });
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      logger.debug('Cache entry expired', { key });
      return null;
    }

    logger.debug('Cache hit', { 
      key, 
      ageSeconds: Math.floor((Date.now() - entry.timestamp) / 1000)
    });
    
    return entry.data;
  }

  /**
   * Delete cache entry
   */
  async del(key: string): Promise<boolean> {
    const deleted = this.cache.delete(key);
    
    if (deleted) {
      logger.debug('Cache entry deleted', { key });
    }
    
    return deleted;
  }

  /**
   * Check if key exists and is not expired
   */
  async exists(key: string): Promise<boolean> {
    const entry = this.cache.get(key);
    
    if (!entry) return false;
    
    // Check if expired
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    const size = this.cache.size;
    this.cache.clear();
    
    logger.info('Cache cleared', { clearedEntries: size });
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const now = Date.now();
    let expiredCount = 0;
    let validCount = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiry) {
        expiredCount++;
      } else {
        validCount++;
      }
    }

    return {
      totalEntries: this.cache.size,
      validEntries: validCount,
      expiredEntries: expiredCount,
      memoryUsage: this.estimateMemoryUsage(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Estimate memory usage (rough calculation)
   */
  private estimateMemoryUsage(): string {
    const entries = Array.from(this.cache.entries());
    const estimatedBytes = entries.reduce((total, [key, value]) => {
      const keySize = key.length * 2; // Rough Unicode size
      const valueSize = JSON.stringify(value).length * 2; // Rough JSON size
      return total + keySize + valueSize;
    }, 0);

    if (estimatedBytes < 1024) return `${estimatedBytes}B`;
    if (estimatedBytes < 1024 * 1024) return `${(estimatedBytes / 1024).toFixed(1)}KB`;
    return `${(estimatedBytes / (1024 * 1024)).toFixed(1)}MB`;
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiry) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.debug('Cache cleanup completed', {
        cleanedEntries: cleanedCount,
        remainingEntries: this.cache.size
      });
    }
  }

  /**
   * Destroy cache and cleanup
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.cache.clear();
    logger.info('Cache destroyed');
  }
}

/**
 * Application cache service with predefined cache keys and TTLs
 */
export class AppCache {
  private cache: InMemoryCache;

  // Cache TTL configurations (in seconds)
  private static readonly TTL = {
    STOCK_QUOTE: 60,           // 1 minute for stock prices
    OPTIONS_CHAIN: 15 * 60,    // 15 minutes for options data
    PORTFOLIO_SUMMARY: 5 * 60, // 5 minutes for portfolio summary
    USER_SESSION: 30 * 60,     // 30 minutes for user session data
    MARKET_DATA: 10 * 60,      // 10 minutes for general market data
    VOLATILITY_SURFACE: 60 * 60 // 1 hour for volatility surface
  };

  constructor() {
    this.cache = new InMemoryCache();
  }

  // Stock quote caching
  async setStockQuote(symbol: string, quote: any): Promise<void> {
    await this.cache.set(`stock:${symbol}`, quote, AppCache.TTL.STOCK_QUOTE);
  }

  async getStockQuote(symbol: string): Promise<any | null> {
    return await this.cache.get(`stock:${symbol}`);
  }

  // Options chain caching
  async setOptionsChain(symbol: string, expirationDate: string, chain: any): Promise<void> {
    await this.cache.set(`options:${symbol}:${expirationDate}`, chain, AppCache.TTL.OPTIONS_CHAIN);
  }

  async getOptionsChain(symbol: string, expirationDate: string): Promise<any | null> {
    return await this.cache.get(`options:${symbol}:${expirationDate}`);
  }

  // Portfolio summary caching
  async setPortfolioSummary(userId: string, summary: any): Promise<void> {
    await this.cache.set(`portfolio:${userId}`, summary, AppCache.TTL.PORTFOLIO_SUMMARY);
  }

  async getPortfolioSummary(userId: string): Promise<any | null> {
    return await this.cache.get(`portfolio:${userId}`);
  }

  // User session caching
  async setUserSession(userId: string, sessionData: any): Promise<void> {
    await this.cache.set(`session:${userId}`, sessionData, AppCache.TTL.USER_SESSION);
  }

  async getUserSession(userId: string): Promise<any | null> {
    return await this.cache.get(`session:${userId}`);
  }

  // Strategy calculation caching
  async setStrategyCalculation(symbol: string, strategyType: string, result: any): Promise<void> {
    await this.cache.set(`strategy:${symbol}:${strategyType}`, result, AppCache.TTL.MARKET_DATA);
  }

  async getStrategyCalculation(symbol: string, strategyType: string): Promise<any | null> {
    return await this.cache.get(`strategy:${symbol}:${strategyType}`);
  }

  // Invalidate related cache entries
  async invalidateSymbol(symbol: string): Promise<void> {
    const keys = Array.from(this.cache['cache'].keys()).filter(key => key.includes(symbol));
    
    for (const key of keys) {
      await this.cache.del(key);
    }
    
    logger.debug('Invalidated cache for symbol', { symbol, keysCleared: keys.length });
  }

  async invalidateUser(userId: string): Promise<void> {
    const keys = Array.from(this.cache['cache'].keys()).filter(key => key.includes(userId));
    
    for (const key of keys) {
      await this.cache.del(key);
    }
    
    logger.debug('Invalidated cache for user', { userId, keysCleared: keys.length });
  }

  // Get cache statistics
  getStats() {
    return this.cache.getStats();
  }

  // Clear all cache
  async clear(): Promise<void> {
    await this.cache.clear();
  }

  // Destroy cache
  destroy(): void {
    this.cache.destroy();
  }
}

// Export singleton instance
export const appCache = new AppCache();

// Graceful shutdown
process.on('SIGTERM', () => {
  appCache.destroy();
});

process.on('SIGINT', () => {
  appCache.destroy();
});
