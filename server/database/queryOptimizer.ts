import { sql, eq, and, inArray } from 'drizzle-orm';
import { db } from './connectionPool';
import { tickers, longStranglePositions, users } from '@shared/schema';
import { logger } from '../middleware/logger';

/**
 * Optimized database queries for better performance
 */
export class QueryOptimizer {

  /**
   * Get active tickers with positions using optimized JOIN query
   */
  static async getActiveTickersWithPositions(userId: string) {
    const startTime = Date.now();
    
    try {
      // Single optimized query instead of N+1 queries
      const result = await db
        .select({
          // Ticker fields
          tickerId: tickers.id,
          symbol: tickers.symbol,
          companyName: tickers.companyName,
          currentPrice: tickers.currentPrice,
          priceChange: tickers.priceChange,
          priceChangePercent: tickers.priceChangePercent,
          earningsDate: tickers.earningsDate,
          isActive: tickers.isActive,
          userId: tickers.userId,
          
          // Position fields
          positionId: longStranglePositions.id,
          strategyType: longStranglePositions.strategyType,
          longPutStrike: longStranglePositions.longPutStrike,
          longCallStrike: longStranglePositions.longCallStrike,
          longPutPremium: longStranglePositions.longPutPremium,
          longCallPremium: longStranglePositions.longCallPremium,
          shortPutStrike: longStranglePositions.shortPutStrike,
          shortCallStrike: longStranglePositions.shortCallStrike,
          shortPutPremium: longStranglePositions.shortPutPremium,
          shortCallPremium: longStranglePositions.shortCallPremium,
          lowerBreakeven: longStranglePositions.lowerBreakeven,
          upperBreakeven: longStranglePositions.upperBreakeven,
          maxLoss: longStranglePositions.maxLoss,
          maxProfit: longStranglePositions.maxProfit,
          atmValue: longStranglePositions.atmValue,
          impliedVolatility: longStranglePositions.impliedVolatility,
          ivPercentile: longStranglePositions.ivPercentile,
          daysToExpiry: longStranglePositions.daysToExpiry,
          expirationDate: longStranglePositions.expirationDate,
          strikesManuallySelected: longStranglePositions.strikesManuallySelected,
          customCallStrike: longStranglePositions.customCallStrike,
          customPutStrike: longStranglePositions.customPutStrike,
          expirationCycleForCustomStrikes: longStranglePositions.expirationCycleForCustomStrikes
        })
        .from(tickers)
        .innerJoin(longStranglePositions, eq(tickers.id, longStranglePositions.tickerId))
        .where(and(
          eq(tickers.userId, userId),
          eq(tickers.isActive, true)
        ))
        .orderBy(tickers.symbol);

      const responseTime = Date.now() - startTime;
      
      logger.debug('Optimized ticker query completed', {
        userId,
        resultCount: result.length,
        responseTime
      });

      // Transform to expected format
      return result.map(row => ({
        id: row.tickerId,
        symbol: row.symbol,
        companyName: row.companyName,
        currentPrice: row.currentPrice,
        priceChange: row.priceChange,
        priceChangePercent: row.priceChangePercent,
        earningsDate: row.earningsDate,
        isActive: row.isActive,
        userId: row.userId,
        position: {
          id: row.positionId,
          tickerId: row.tickerId,
          strategyType: row.strategyType,
          longPutStrike: row.longPutStrike,
          longCallStrike: row.longCallStrike,
          longPutPremium: row.longPutPremium,
          longCallPremium: row.longCallPremium,
          shortPutStrike: row.shortPutStrike,
          shortCallStrike: row.shortCallStrike,
          shortPutPremium: row.shortPutPremium,
          shortCallPremium: row.shortCallPremium,
          lowerBreakeven: row.lowerBreakeven,
          upperBreakeven: row.upperBreakeven,
          maxLoss: row.maxLoss,
          maxProfit: row.maxProfit,
          atmValue: row.atmValue,
          impliedVolatility: row.impliedVolatility,
          ivPercentile: row.ivPercentile,
          daysToExpiry: row.daysToExpiry,
          expirationDate: row.expirationDate,
          strikesManuallySelected: row.strikesManuallySelected,
          customCallStrike: row.customCallStrike,
          customPutStrike: row.customPutStrike,
          expirationCycleForCustomStrikes: row.expirationCycleForCustomStrikes
        }
      }));

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      logger.error('Optimized ticker query failed', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime
      });
      
      throw error;
    }
  }

  /**
   * Batch update multiple tickers efficiently
   */
  static async batchUpdateTickers(updates: Array<{ id: string; data: any }>) {
    const startTime = Date.now();
    
    try {
      // Use transaction for atomicity
      await db.transaction(async (tx) => {
        for (const update of updates) {
          await tx
            .update(tickers)
            .set(update.data)
            .where(eq(tickers.id, update.id));
        }
      });

      const responseTime = Date.now() - startTime;
      
      logger.debug('Batch ticker update completed', {
        updateCount: updates.length,
        responseTime
      });

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      logger.error('Batch ticker update failed', {
        updateCount: updates.length,
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime
      });
      
      throw error;
    }
  }

  /**
   * Batch update multiple positions efficiently
   */
  static async batchUpdatePositions(updates: Array<{ id: string; data: any }>) {
    const startTime = Date.now();
    
    try {
      // Use transaction for atomicity
      await db.transaction(async (tx) => {
        for (const update of updates) {
          await tx
            .update(longStranglePositions)
            .set({ ...update.data, updatedAt: new Date() })
            .where(eq(longStranglePositions.id, update.id));
        }
      });

      const responseTime = Date.now() - startTime;
      
      logger.debug('Batch position update completed', {
        updateCount: updates.length,
        responseTime
      });

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      logger.error('Batch position update failed', {
        updateCount: updates.length,
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime
      });
      
      throw error;
    }
  }

  /**
   * Get portfolio summary with single aggregated query
   */
  static async getPortfolioSummary(userId: string) {
    const startTime = Date.now();
    
    try {
      const result = await db
        .select({
          totalPremiumPaid: sql<number>`SUM(${longStranglePositions.longPutPremium} + ${longStranglePositions.longCallPremium})`,
          activePositions: sql<number>`COUNT(*)`,
          avgDaysToExpiry: sql<number>`AVG(${longStranglePositions.daysToExpiry})`,
          totalMaxLoss: sql<number>`SUM(${longStranglePositions.maxLoss})`,
          avgImpliedVolatility: sql<number>`AVG(${longStranglePositions.impliedVolatility})`
        })
        .from(tickers)
        .innerJoin(longStranglePositions, eq(tickers.id, longStranglePositions.tickerId))
        .where(and(
          eq(tickers.userId, userId),
          eq(tickers.isActive, true)
        ));

      const responseTime = Date.now() - startTime;
      
      logger.debug('Portfolio summary query completed', {
        userId,
        responseTime
      });

      const summary = result[0];
      
      return {
        totalPremiumPaid: Math.round((summary?.totalPremiumPaid || 0) * 100), // Convert to cents then back
        activePositions: summary?.activePositions || 0,
        avgDaysToExpiry: Math.round((summary?.avgDaysToExpiry || 0) * 10) / 10,
        totalMaxLoss: Math.round(summary?.totalMaxLoss || 0),
        avgImpliedVolatility: Math.round((summary?.avgImpliedVolatility || 0) * 10) / 10
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      logger.error('Portfolio summary query failed', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime
      });
      
      throw error;
    }
  }

  /**
   * Get positions by multiple ticker IDs efficiently
   */
  static async getPositionsByTickerIds(tickerIds: string[]) {
    const startTime = Date.now();
    
    try {
      if (tickerIds.length === 0) return [];

      const result = await db
        .select()
        .from(longStranglePositions)
        .where(inArray(longStranglePositions.tickerId, tickerIds));

      const responseTime = Date.now() - startTime;
      
      logger.debug('Batch positions query completed', {
        tickerIdCount: tickerIds.length,
        resultCount: result.length,
        responseTime
      });

      return result;

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      logger.error('Batch positions query failed', {
        tickerIdCount: tickerIds.length,
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime
      });
      
      throw error;
    }
  }

  /**
   * Prepare database for optimal performance
   */
  static async optimizeDatabase() {
    try {
      logger.info('Starting database optimization...');

      // Create indexes for common queries if they don't exist
      await db.execute(sql`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tickers_user_active 
        ON tickers(user_id, is_active) 
        WHERE is_active = true
      `);

      await db.execute(sql`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_positions_ticker 
        ON long_strangle_positions(ticker_id)
      `);

      await db.execute(sql`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_positions_expiration 
        ON long_strangle_positions(expiration_date)
      `);

      // Update table statistics
      await db.execute(sql`ANALYZE tickers`);
      await db.execute(sql`ANALYZE long_strangle_positions`);

      logger.info('Database optimization completed');

    } catch (error) {
      logger.error('Database optimization failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Clean up old data periodically
   */
  static async cleanupOldData() {
    try {
      logger.info('Starting database cleanup...');

      // Remove positions for expired options (older than 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const cutoffDate = thirtyDaysAgo.toISOString().split('T')[0];

      const deletedPositions = await db
        .delete(longStranglePositions)
        .where(sql`expiration_date < ${cutoffDate}`)
        .returning({ id: longStranglePositions.id });

      // Remove inactive tickers with no positions
      const deletedTickers = await db
        .delete(tickers)
        .where(and(
          eq(tickers.isActive, false),
          sql`NOT EXISTS (
            SELECT 1 FROM long_strangle_positions 
            WHERE ticker_id = tickers.id
          )`
        ))
        .returning({ id: tickers.id });

      logger.info('Database cleanup completed', {
        deletedPositions: deletedPositions.length,
        deletedTickers: deletedTickers.length
      });

    } catch (error) {
      logger.error('Database cleanup failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

// Schedule periodic cleanup (daily)
setInterval(() => {
  QueryOptimizer.cleanupOldData();
}, 24 * 60 * 60 * 1000); // 24 hours
