import {
  // Table definitions
  tickers,
  users,
  longStranglePositions,
  optionsChains,
  historicalOptionsChains,
  priceAlerts,
  exitRecommendations,
  sessions,
  // Type definitions
  type Ticker,
  type InsertTicker,
  type OptionsPosition,
  type InsertLongStranglePosition,
  type TickerWithPosition,
  type TickerWithAlertsAndRecs,
  type PortfolioSummary,
  type User,
  type InsertUser,
  type OptionsChain,
  type InsertOptionsChain,
  type HistoricalOptionsChain,
  type InsertHistoricalOptionsChain,
  type OptionsChainData,
  type PriceAlert,
  type InsertPriceAlert,
  type CreatePriceAlertRequest,
  type ExitRecommendation,
  type InsertExitRecommendation,
} from "@shared/schema";
import { eq, and, isNotNull, sql } from "drizzle-orm";
import { db } from "./db";
import { calculateExpectedMove } from "./utils/expectedMove";
import { handleDbError } from "./plugins/dbFallbackGuard";

export interface CreateOrUpdateUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
}

export interface IStorage {
  // User operations for email/password auth
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  createOrUpdateUser(user: CreateOrUpdateUser): Promise<User>;
  
  // Ticker operations
  getTicker(id: string): Promise<Ticker | undefined>;
  getTickerBySymbol(symbol: string, userId: string): Promise<Ticker | undefined>;
  createTicker(tickerData: InsertTicker): Promise<Ticker>;
  updateTicker(id: string, updates: Partial<InsertTicker>): Promise<void>;
  getActiveTickersForUser(userId: string): Promise<Ticker[]>;
  setTickerActive(symbol: string, isActive: boolean, userId: string): Promise<void>;
  removeTickerForUser(symbol: string, userId: string): Promise<void>;

  // Long strangle position operations
  getPositionById(id: string): Promise<OptionsPosition | undefined>;
  getPositionByTickerId(tickerId: string): Promise<OptionsPosition | undefined>;
  createPosition(positionData: InsertLongStranglePosition): Promise<OptionsPosition>;
  updatePosition(id: string, userId: string, updates: Partial<Omit<InsertLongStranglePosition, 'tickerId'>>): Promise<OptionsPosition | undefined>;
  setCustomStrikes(positionId: string, userId: string, customCallStrike: number, customPutStrike: number, expirationDate: string): Promise<OptionsPosition | undefined>;
  clearCustomStrikes(positionId: string, userId: string): Promise<OptionsPosition | undefined>;
  getAllPositionsWithCustomStrikes(): Promise<OptionsPosition[]>;

  // Get single ticker with position
  getTickerWithPosition(tickerId: string): Promise<TickerWithPosition | undefined>;
  getActiveTickersWithPositionsForUser(userId: string): Promise<TickerWithPosition[]>;
  getPortfolioSummaryForUser(userId: string): Promise<PortfolioSummary>;

  // Options chain operations
  getOptionsChain(symbol: string): Promise<OptionsChainData>;
  updateOptionsChain(symbol: string, chains: InsertOptionsChain[]): Promise<void>;
  
  // Database-based options chain operations (single source of truth)
  getOptionsChainFromDB(symbol: string, expirationDate?: string): Promise<OptionsChain[]>;
  clearOptionsChainData(symbol: string): Promise<void>;
  updateOptionsChainData(symbol: string, optionsData: any[]): Promise<void>;
  
  // Get all active tickers across all users (for optimized API calls)
  getAllActiveTickersAcrossAllUsers(): Promise<Ticker[]>;
  saveOptionsChain(symbol: string, chainData: OptionsChainData): Promise<void>;
  
  // Get available expiration dates from database
  getAvailableExpirationDates(): Promise<string[]>;

  // Price alert operations
  createPriceAlert(userId: string, alert: CreatePriceAlertRequest): Promise<PriceAlert>;
  getPriceAlertsForUser(userId: string): Promise<PriceAlert[]>;
  getPriceAlertsForTicker(tickerId: string): Promise<PriceAlert[]>;
  updatePriceAlert(id: string, updates: Partial<PriceAlert>): Promise<void>;
  deletePriceAlert(id: string): Promise<void>;
  triggerAlert(id: string): Promise<void>;

  // Exit recommendation operations
  createExitRecommendation(recommendationData: InsertExitRecommendation): Promise<ExitRecommendation>;
  getExitRecommendationsForUser(userId: string): Promise<ExitRecommendation[]>;
  getExitRecommendationsForPosition(positionId: string): Promise<ExitRecommendation[]>;
  updateExitRecommendation(id: string, updates: Partial<ExitRecommendation>): Promise<void>;
  dismissRecommendation(id: string): Promise<void>;

  // Get active tickers with alerts and recommendations
  getActiveTickersWithAlertsAndRecsForUser(userId: string): Promise<TickerWithAlertsAndRecs[]>;
}

export class DatabaseStorage implements IStorage {
  // Database storage using db instance
  private stockApiStatus: ApiStatus = {
    configured: true,
    status: "connected"
  };

  constructor() {
    if (!db) {
      throw new Error('Database connection is unavailable. Supabase must be configured.');
    }
    console.log('🔧 DatabaseStorage initialized - using real Supabase database');
  }

        private async runExpectedMoveMigration() {
          try {
            // Import and run the migration
            const { migrateExpectedMoveData } = await import('./utils/migrateExpectedMove');
            await migrateExpectedMoveData();
          } catch (error) {
            console.error('❌ Expected move migration failed:', error);
          }
        }

        private async runExpirationDateMigration() {
          try {
            // Import and run the expiration date migration
            const { migrateExpirationDates } = await import('./utils/migrateExpirationDates');
            await migrateExpirationDates();
          } catch (error) {
            console.error('❌ Expiration date migration failed:', error);
          }
        }

        private async debugExpirationDates() {
          try {
            // Import and run the debug utility
            const { debugExpirationDates } = await import('./utils/debugExpirationDates');
            await debugExpirationDates();
          } catch (error) {
            console.error('❌ Debug expiration dates failed:', error);
          }
        }

  // User operations for email/password auth
  async getUser(id: string): Promise<User | undefined> {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, id));
      return user;
    } catch (error) {
      handleDbError('getUser', error);
    }
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    try {
      const [user] = await db.select().from(users).where(eq(users.email, email));
      return user;
    } catch (error) {
      handleDbError('getUserByEmail', error);
    }
  }

  async createUser(userData: InsertUser): Promise<User> {
    try {
      const [user] = await db
        .insert(users)
        .values(userData)
        .returning();
      return user;
    } catch (error) {
      handleDbError('createUser', error);
    }
  }

  async createOrUpdateUser(userData: CreateOrUpdateUser): Promise<User> {
    try {
      console.log(`🔧 Creating/updating user: ${userData.id} (${userData.email})`);
      
      const payload: InsertUser = {
        id: userData.id,
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        profileImageUrl: userData.profileImageUrl,
      };

      // First try to find existing user by email
      const existingUser = await db.select().from(users).where(eq(users.email, userData.email));
      
      if (existingUser.length > 0) {
        // Check if the existing user has the same ID - if so, just return it
        if (existingUser[0].id === userData.id) {
          console.log(`✅ User already exists with same ID: ${userData.id}`);
          return existingUser[0];
        }
        
        // User exists with different ID, need to migrate all references atomically
        console.log(`🔄 Migrating user ID from ${existingUser[0].id} to ${userData.id} with atomic transaction`);
        
        // CRITICAL: Use transaction to ensure atomicity across all related tables
        const migratedUser = await db.transaction(async (tx) => {
          // 1. Update all tickers to reference the new user ID
          await tx
            .update(tickers)
            .set({ userId: userData.id })
            .where(eq(tickers.userId, existingUser[0].id));
          
          console.log(`🔄 TX: Updated tickers to reference new user ID: ${userData.id}`);
          
          // 2. Update all price alerts to reference the new user ID
          await tx
            .update(priceAlerts)
            .set({ userId: userData.id })
            .where(eq(priceAlerts.userId, existingUser[0].id));
          
          console.log(`🔄 TX: Updated price alerts to reference new user ID: ${userData.id}`);
          
          // 3. Update all positions to reference the new user ID (via tickers)
          // Note: positions reference tickers, so they're updated indirectly
          
          // 4. Update sessions to reference the new user ID if they exist
          // Note: sessions are handled separately via session store, but check if needed
          
          // 5. Insert the new user record with the new ID
          const [newUser] = await tx
            .insert(users)
            .values(payload)
            .returning();
          
          console.log(`🔄 TX: Inserted new user record: ${userData.id}`);
          
          // 6. Delete the old user record (this must be last to avoid FK violations)
          await tx
            .delete(users)
            .where(eq(users.id, existingUser[0].id));
          
          console.log(`🔄 TX: Deleted old user record: ${existingUser[0].id}`);
          
          return newUser;
        });
        
        console.log(`✅ ATOMIC MIGRATION COMPLETE: Successfully migrated user from ${existingUser[0].id} to ${userData.id}`);
        return migratedUser;
      } else {
        // No existing user, create new one
        const [user] = await db
          .insert(users)
          .values(payload)
          .returning();
        return user;
      }
    } catch (error) {
      console.error(`❌ Failed to create/update user ${userData.id}:`, error);
      handleDbError('createOrUpdateUser', error);
    }
  }

  // Ticker operations
  async getTicker(id: string): Promise<Ticker | undefined> {
    try {
      const [ticker] = await db.select().from(tickers).where(eq(tickers.id, id));
      return ticker;
    } catch (error) {
      handleDbError('getTicker', error);
    }
  }

  async getTickerBySymbol(symbol: string, userId: string): Promise<Ticker | undefined> {
    try {
      const [ticker] = await db.select().from(tickers).where(
        and(eq(tickers.symbol, symbol), eq(tickers.userId, userId))
      );
      return ticker;
    } catch (error) {
      handleDbError('getTickerBySymbol', error);
    }
  }

  async createTicker(tickerData: InsertTicker): Promise<Ticker> {
    try {
      console.log(`🔧 Creating ticker for user: ${tickerData.userId}, symbol: ${tickerData.symbol}`);
      
      // First, verify the user exists
      const user = await db.select().from(users).where(eq(users.id, tickerData.userId));
      if (user.length === 0) {
        throw new Error(`User ${tickerData.userId} does not exist in database`);
      }
      console.log(`✅ User ${tickerData.userId} exists in database`);
      
      const [ticker] = await db
        .insert(tickers)
        .values(tickerData)
        .returning();
      
      console.log(`✅ Ticker created successfully: ${ticker.id}`);
      return ticker;
    } catch (error) {
      console.error(`❌ Failed to create ticker for user ${tickerData.userId}:`, error);
      handleDbError('createTicker', error);
    }
  }

  async updateTicker(id: string, updates: Partial<InsertTicker>): Promise<void> {
    try {
      console.log(`🔧 DATABASE UPDATE: Updating ticker ${id} with:`, updates);
      
      if (!db) {
        console.error('❌ DATABASE UPDATE FAILED: db is null/undefined!');
        return;
      }
      
      const result = await db
        .update(tickers)
        .set(updates)
        .where(eq(tickers.id, id))
        .returning();
        
      console.log(`✅ DATABASE UPDATE SUCCESS: Updated ticker ${id}`, result);
    } catch (error) {
      console.error(`❌ DATABASE UPDATE ERROR for ticker ${id}:`, error);
      throw error;
    }
  }

  async getActiveTickersForUser(userId: string): Promise<Ticker[]> {
    try {
      return await db.select().from(tickers).where(
        and(eq(tickers.userId, userId), eq(tickers.isActive, true))
      );
    } catch (error) {
      handleDbError('getActiveTickersForUser', error);
    }
  }

  async setTickerActive(symbol: string, isActive: boolean, userId: string): Promise<void> {
    await db
      .update(tickers)
      .set({ isActive })
      .where(and(eq(tickers.symbol, symbol), eq(tickers.userId, userId)));
  }

  async removeTickerForUser(symbol: string, userId: string): Promise<void> {
    const ticker = await this.getTickerBySymbol(symbol, userId);
    if (ticker) {
      await db.delete(longStranglePositions).where(eq(longStranglePositions.tickerId, ticker.id));
      await db.delete(tickers).where(eq(tickers.id, ticker.id));
    }
  }

  // Long strangle position operations
  async getPositionById(id: string): Promise<OptionsPosition | undefined> {
    const [position] = await db.select().from(longStranglePositions).where(eq(longStranglePositions.id, id));
    return position;
  }

  async getPositionByTickerId(tickerId: string): Promise<OptionsPosition | undefined> {
    try {
      const [position] = await db.select().from(longStranglePositions).where(eq(longStranglePositions.tickerId, tickerId));
      return position;
    } catch (error) {
      handleDbError('getPositionByTickerId', error);
    }
  }

  async createPosition(positionData: InsertLongStranglePosition): Promise<OptionsPosition> {
    try {
      const expectedMove = calculateExpectedMove(
        positionData.atmValue,
        positionData.impliedVolatility,
        positionData.daysToExpiry
      );

      const positionWithExpectedMove = {
        ...positionData,
        expectedMoveWeeklyLow: expectedMove.weeklyLow,
        expectedMoveWeeklyHigh: expectedMove.weeklyHigh,
        expectedMoveDailyMove: expectedMove.dailyMove,
        expectedMoveWeeklyMove: expectedMove.weeklyMove,
        expectedMoveMovePercentage: expectedMove.movePercentage,
      };

      const [position] = await db
        .insert(longStranglePositions)
        .values(positionWithExpectedMove)
        .returning();
      return position;
    } catch (error) {
      handleDbError('createPosition', error);
    }
  }

  async updatePosition(id: string, userId: string, updates: Partial<Omit<InsertLongStranglePosition, 'tickerId'>>): Promise<OptionsPosition | undefined> {
    // First verify the position belongs to a ticker owned by this user
    const [position] = await db.select().from(longStranglePositions).where(eq(longStranglePositions.id, id));
    if (!position) return undefined;
    
    const [ticker] = await db.select().from(tickers).where(and(eq(tickers.id, position.tickerId), eq(tickers.userId, userId)));
    if (!ticker) return undefined;
    
    // Check if we need to recalculate expected move data
    const needsExpectedMoveRecalc = updates.atmValue !== undefined || 
                                   updates.impliedVolatility !== undefined || 
                                   updates.daysToExpiry !== undefined;
    
    let finalUpdates = { ...updates, updatedAt: new Date() };
    
    if (needsExpectedMoveRecalc) {
      const currentPrice = updates.atmValue ?? position.atmValue;
      const impliedVol = updates.impliedVolatility ?? position.impliedVolatility;
      const daysToExpiry = updates.daysToExpiry ?? position.daysToExpiry;
      
      const expectedMove = calculateExpectedMove(currentPrice, impliedVol, daysToExpiry);
      
      finalUpdates = {
        ...finalUpdates,
        expectedMoveWeeklyLow: expectedMove.weeklyLow,
        expectedMoveWeeklyHigh: expectedMove.weeklyHigh,
        expectedMoveDailyMove: expectedMove.dailyMove,
        expectedMoveWeeklyMove: expectedMove.weeklyMove,
        expectedMoveMovePercentage: expectedMove.movePercentage,
      };
    }
    
    // Skip duplicate calculations - let the main calculation path handle all position updates
    console.log(`Updating position for ${ticker.symbol} with provided data`);
    
    const [updatedPosition] = await db
      .update(longStranglePositions)
      .set(finalUpdates)
      .where(eq(longStranglePositions.id, id))
      .returning();
    
    return updatedPosition;
  }

  async setCustomStrikes(positionId: string, userId: string, customCallStrike: number, customPutStrike: number, expirationDate: string): Promise<OptionsPosition | undefined> {
    // First verify the position belongs to a ticker owned by this user
    const [position] = await db.select().from(longStranglePositions).where(eq(longStranglePositions.id, positionId));
    if (!position) return undefined;
    
    const [ticker] = await db.select().from(tickers).where(and(eq(tickers.id, position.tickerId), eq(tickers.userId, userId)));
    if (!ticker) return undefined;
    
    console.log(`Setting custom strikes for ${ticker.symbol}: Put ${customPutStrike}, Call ${customCallStrike}`);
    
    const [updatedPosition] = await db
      .update(longStranglePositions)
      .set({ 
        customCallStrike,
        customPutStrike,
        expirationCycleForCustomStrikes: expirationDate,
        strikesManuallySelected: true,
        updatedAt: new Date()
      })
      .where(eq(longStranglePositions.id, positionId))
      .returning();
    
    return updatedPosition;
  }

  async clearCustomStrikes(positionId: string, userId: string): Promise<OptionsPosition | undefined> {
    // First verify the position belongs to a ticker owned by this user
    const [position] = await db.select().from(longStranglePositions).where(eq(longStranglePositions.id, positionId));
    if (!position) return undefined;
    
    const [ticker] = await db.select().from(tickers).where(and(eq(tickers.id, position.tickerId), eq(tickers.userId, userId)));
    if (!ticker) return undefined;
    
    console.log(`Clearing custom strikes for ${ticker.symbol}`);
    
    const [updatedPosition] = await db
      .update(longStranglePositions)
      .set({ 
        customCallStrike: null,
        customPutStrike: null,
        expirationCycleForCustomStrikes: null,
        strikesManuallySelected: false,
        updatedAt: new Date()
      })
      .where(eq(longStranglePositions.id, positionId))
      .returning();
    
    return updatedPosition;
  }

  async getAllPositionsWithCustomStrikes(): Promise<OptionsPosition[]> {
    // Get all positions that have custom strikes set (non-null values)
    const positions = await db
      .select()
      .from(longStranglePositions)
      .where(
        and(
          isNotNull(longStranglePositions.customCallStrike),
          isNotNull(longStranglePositions.customPutStrike),
          isNotNull(longStranglePositions.expirationCycleForCustomStrikes)
        )
      );
    
    return positions;
  }

  // Get single ticker with position
  async getTickerWithPosition(tickerId: string): Promise<TickerWithPosition | undefined> {
    const ticker = await this.getTicker(tickerId);
    if (!ticker) return undefined;
    
    const position = await this.getPositionByTickerId(tickerId);
    if (!position) return undefined;
    
    // Transform database fields to expectedMove object structure
    const positionWithExpectedMove = {
      ...position,
      expectedMove: position.expectedMoveWeeklyLow !== null && position.expectedMoveWeeklyHigh !== null ? {
        weeklyLow: position.expectedMoveWeeklyLow,
        weeklyHigh: position.expectedMoveWeeklyHigh,
        dailyMove: position.expectedMoveDailyMove || 0,
        weeklyMove: position.expectedMoveWeeklyMove || 0,
        movePercentage: position.expectedMoveMovePercentage || 0,
      } : undefined
    };
    
    return { ...ticker, position: positionWithExpectedMove };
  }

  async getActiveTickersWithPositionsForUser(userId: string): Promise<TickerWithPosition[]> {
    const activeTickers = await this.getActiveTickersForUser(userId);
    const result: TickerWithPosition[] = [];

    for (const ticker of activeTickers) {
      const position = await this.getPositionByTickerId(ticker.id);
      if (position) {
        // Transform database fields to expectedMove object structure
        const positionWithExpectedMove = {
          ...position,
          expectedMove: position.expectedMoveWeeklyLow !== null && position.expectedMoveWeeklyHigh !== null ? {
            weeklyLow: position.expectedMoveWeeklyLow,
            weeklyHigh: position.expectedMoveWeeklyHigh,
            dailyMove: position.expectedMoveDailyMove || 0,
            weeklyMove: position.expectedMoveWeeklyMove || 0,
            movePercentage: position.expectedMoveMovePercentage || 0,
          } : undefined
        };
        
        result.push({ ...ticker, position: positionWithExpectedMove });
      }
    }

    return result;
  }

  async getPortfolioSummaryForUser(userId: string): Promise<PortfolioSummary> {
    const activeTickersWithPositions = await this.getActiveTickersWithPositionsForUser(userId);
    
    const totalPremiumPaid = activeTickersWithPositions.reduce(
      (sum, { position }) => sum + position.longPutPremium + position.longCallPremium,
      0
    );
    
    const activePositions = activeTickersWithPositions.length;
    
    const avgDaysToExpiry = activePositions > 0 
      ? activeTickersWithPositions.reduce((sum, { position }) => sum + position.daysToExpiry, 0) / activePositions
      : 0;
    
    const totalMaxLoss = activeTickersWithPositions.reduce(
      (sum, { position }) => sum + position.maxLoss,
      0
    );

    const avgImpliedVolatility = activePositions > 0
      ? activeTickersWithPositions.reduce((sum, { position }) => sum + position.impliedVolatility, 0) / activePositions
      : 0;

    return {
      totalPremiumPaid: Math.round(totalPremiumPaid * 100), // Convert to cents then back to dollars
      activePositions,
      avgDaysToExpiry: Math.round(avgDaysToExpiry * 10) / 10,
      totalMaxLoss: Math.round(totalMaxLoss),
      avgImpliedVolatility: Math.round(avgImpliedVolatility * 10) / 10,
    };
  }

  // Options chain operations
  async getOptionsChain(symbol: string): Promise<OptionsChainData> {
    const chains = await db.select().from(optionsChains).where(eq(optionsChains.symbol, symbol));
    
    // DISABLED: Mock data generation - only use real market data from marketdata.app
    // if (chains.length === 0) {
    //   return await this.generateMockOptionsChain(symbol);
    // }
    
    // Return null if no real data available - force system to use marketdata.app
    if (chains.length === 0) {
      console.log(`❌ No real options chain data available for ${symbol} - returning null to force marketdata.app usage`);
      return null;
    }

    // Group by expiration date
    const expirationDates = [...new Set(chains.map(chain => chain.expirationDate))].sort();
    const chainsByExpiration: { [key: string]: { calls: OptionsChain[]; puts: OptionsChain[] } } = {};

    expirationDates.forEach(expDate => {
      const expirationChains = chains.filter(chain => chain.expirationDate === expDate);
      chainsByExpiration[expDate] = {
        calls: expirationChains.filter(chain => chain.optionType === 'call').sort((a, b) => a.strike - b.strike),
        puts: expirationChains.filter(chain => chain.optionType === 'put').sort((a, b) => a.strike - b.strike)
      };
    });

    return {
      symbol,
      expirationDates,
      chains: chainsByExpiration
    };
  }

  // REMOVED: Mock data generation function - system now exclusively uses real market data from marketdata.app

  async updateOptionsChain(symbol: string, chains: InsertOptionsChain[]): Promise<void> {
    return this.updateOptionsChainWithRetry(symbol, chains, 0);
  }

  private async updateOptionsChainWithRetry(symbol: string, chains: InsertOptionsChain[], retryCount: number): Promise<void> {
    const maxRetries = 3;
    const baseDelayMs = 100; // Base delay for exponential backoff
    
    try {
      await this.doUpdateOptionsChain(symbol, chains);
    } catch (error) {
      // Handle deadlock retries with exponential backoff
      if (error instanceof Error && error.message.startsWith('DEADLOCK_RETRY_') && retryCount < maxRetries) {
        const delayMs = baseDelayMs * Math.pow(2, retryCount) + Math.random() * 100; // Add jitter
        console.log(`🔄 DEADLOCK RETRY ${retryCount + 1}/${maxRetries} for ${symbol} after ${delayMs}ms delay`);
        
        await new Promise(resolve => setTimeout(resolve, delayMs));
        return this.updateOptionsChainWithRetry(symbol, chains, retryCount + 1);
      }
      
      // Re-throw non-deadlock errors or exhausted retries
      if (retryCount >= maxRetries) {
        console.error(`❌ DEADLOCK RETRY EXHAUSTED: Failed to update ${symbol} after ${maxRetries} attempts`);
      }
      throw error;
    }
  }

  private async doUpdateOptionsChain(symbol: string, chains: InsertOptionsChain[]): Promise<void> {
    console.log(`🔄 ROBUST UPSERT: updateOptionsChain called for ${symbol} with ${chains.length} chains`);
    
    if (chains.length === 0) {
      console.log(`⚠️ No chains to update for ${symbol}`);
      return;
    }

    // Dynamic batch sizing based on data volume for optimal performance
    const baseBatchSize = 500;
    const maxBatchSize = 1000;
    const minBatchSize = 100;
    
    // Scale batch size based on total volume - larger batches for massive datasets
    let batchSize = baseBatchSize;
    if (chains.length > 10000) {
      batchSize = maxBatchSize; // Larger batches for massive datasets
    } else if (chains.length < 1000) {
      batchSize = minBatchSize; // Smaller batches for small datasets
    }
    
    const totalBatches = Math.ceil(chains.length / batchSize);
    
    console.log(`🚀 PERFORMANCE: Processing ${chains.length} options in ${totalBatches} batches of up to ${batchSize} records (optimized batch size)`);

    // Group chains by expiration date for proper scoping with memory optimization
    const chainsByExpiration = new Map<string, InsertOptionsChain[]>();
    
    // Memory-efficient grouping - process in streaming fashion for large datasets
    if (chains.length > 5000) {
      console.log(`🧠 MEMORY: Using streaming grouping for ${chains.length} large dataset`);
    }
    
    for (const chain of chains) {
      if (!chainsByExpiration.has(chain.expirationDate)) {
        chainsByExpiration.set(chain.expirationDate, []);
      }
      chainsByExpiration.get(chain.expirationDate)!.push(chain);
    }
    
    console.log(`📊 GROUPED: ${chainsByExpiration.size} expiration dates with data distribution:`, 
      Array.from(chainsByExpiration.entries()).map(([exp, chains]) => `${exp}:${chains.length}`).join(', '));

    let totalProcessed = 0;
    
    // Process each expiration separately to avoid cross-contamination
    for (const [expirationDate, expirationChains] of chainsByExpiration) {
      console.log(`📅 Processing ${expirationChains.length} chains for ${symbol} expiring ${expirationDate}`);
      
      // Generate deterministic lock ID for this symbol+expiration combination
      // Use simple hash to create consistent integer for advisory lock
      const lockString = `${symbol}_${expirationDate}`;
      const lockId = this.hashStringToInt(lockString);
      
      console.log(`🔒 Acquiring advisory lock for ${symbol}:${expirationDate} (ID: ${lockId})`);
      
      // Use database transaction with advisory lock for concurrency control
      // CRITICAL: Advisory lock must be within the same transaction/connection as upserts
      await db.transaction(async (tx) => {
        // Acquire transaction-scoped advisory lock - automatically released when transaction ends
        // Using pg_advisory_xact_lock ensures lock is held for entire transaction on same connection
        try {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockId})`);
          console.log(`🔒 Transaction-scoped advisory lock acquired for ${symbol}:${expirationDate} (lockId: ${lockId})`);
        } catch (lockError) {
          console.error(`❌ Failed to acquire advisory lock for ${symbol}:${expirationDate} (lockId: ${lockId}):`, lockError);
          
          // Check if it's a deadlock - retry with exponential backoff
          if (lockError instanceof Error && lockError.message.includes('deadlock')) {
            console.log(`🔄 Deadlock detected for ${symbol}:${expirationDate}, will retry after delay`);
            throw new Error(`DEADLOCK_RETRY_${symbol}_${expirationDate}`);
          }
          throw lockError;
        }
        
        // Process in batches within the transaction
        for (let i = 0; i < expirationChains.length; i += batchSize) {
          const batch = expirationChains.slice(i, i + batchSize);
          const batchNum = Math.floor(i / batchSize) + 1;
          const totalBatchesForExp = Math.ceil(expirationChains.length / batchSize);
          
          console.log(`  📦 Batch ${batchNum}/${totalBatchesForExp}: Processing ${batch.length} records...`);
          
          try {
            // Use bulk insert with ON CONFLICT DO UPDATE for efficient upserts
            await tx
              .insert(optionsChains)
              .values(batch.map(chain => ({
                ...chain,
                updatedAt: new Date() // Ensure fresh timestamp
              })))
              .onConflictDoUpdate({
                target: [optionsChains.symbol, optionsChains.expirationDate, optionsChains.strike, optionsChains.optionType],
                set: {
                  bid: sql.raw('excluded.bid'),
                  ask: sql.raw('excluded.ask'),
                  lastPrice: sql.raw('excluded.last_price'),
                  volume: sql.raw('excluded.volume'),
                  openInterest: sql.raw('excluded.open_interest'),
                  impliedVolatility: sql.raw('excluded.implied_volatility'),
                  delta: sql.raw('excluded.delta'),
                  gamma: sql.raw('excluded.gamma'),
                  theta: sql.raw('excluded.theta'),
                  vega: sql.raw('excluded.vega'),
                  updatedAt: sql.raw('excluded.updated_at')
                }
              });
              
            totalProcessed += batch.length;
            console.log(`  ✅ Batch ${batchNum}/${totalBatchesForExp}: Successfully upserted ${batch.length} records`);
          } catch (batchError) {
            console.error(`  ❌ Batch ${batchNum}/${totalBatchesForExp}: Failed to upsert:`, batchError);
            throw batchError; // This will rollback the entire transaction
          }
        }
        
        console.log(`✅ Transaction completed for ${symbol} expiration ${expirationDate}: ${expirationChains.length} records`);
        // Advisory lock is automatically released when transaction ends
      });
      
      console.log(`🔓 Advisory lock released for ${symbol}:${expirationDate}`);
    }
    
    console.log(`🎯 ROBUST UPSERT COMPLETE: Successfully processed ${totalProcessed}/${chains.length} chains for ${symbol}`);
  }

  // Helper method to generate deterministic integer hash for advisory locks
  private hashStringToInt(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    // Ensure positive integer for PostgreSQL advisory lock
    return Math.abs(hash);
  }

  // Archive expired options and cleanup stale data to maintain database performance
  async archiveExpiredOptionsAndCleanup(): Promise<void> {
    console.log(`📦 ARCHIVE & CLEANUP: Starting expired options archival and stale data cleanup...`);
    
    try {
      // Define archival and cleanup thresholds
      const expiredThresholdDays = 7; // Archive options expired more than 7 days ago
      const staleDataThresholdDays = 30; // Remove very old price updates (30+ days)
      
      const expiredCutoff = new Date();
      expiredCutoff.setDate(expiredCutoff.getDate() - expiredThresholdDays);
      
      const staleCutoff = new Date();
      staleCutoff.setDate(staleCutoff.getDate() - staleDataThresholdDays);
      
      console.log(`🧹 Cleanup thresholds: expired cutoff=${expiredCutoff.toISOString()}, stale cutoff=${staleCutoff.toISOString()}`);
      
      // Use global cleanup lock to prevent conflicts with active updates
      const cleanupLockId = this.hashStringToInt('global_cleanup_lock');
      
      await db.transaction(async (tx) => {
        // Acquire global cleanup lock
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${cleanupLockId})`);
        console.log(`🔒 Global cleanup lock acquired`);
        
        // 1. Archive expired options contracts to historical table
        console.log(`📦 ARCHIVE: Moving expired options contracts to historical table...`);
        
        // First, get expired options that need to be archived
        const expiredOptions = await tx
          .select()
          .from(optionsChains)
          .where(sql`expiration_date < ${expiredCutoff.toISOString().split('T')[0]}`);
        
        if (expiredOptions.length > 0) {
          console.log(`📦 Found ${expiredOptions.length} expired contracts to archive`);
          
          // Move expired data to historical table
          const historicalData: InsertHistoricalOptionsChain[] = expiredOptions.map(option => ({
            originalId: option.id,
            symbol: option.symbol,
            expirationDate: option.expirationDate,
            strike: option.strike,
            optionType: option.optionType,
            bid: option.bid,
            ask: option.ask,
            lastPrice: option.lastPrice,
            volume: option.volume,
            openInterest: option.openInterest,
            impliedVolatility: option.impliedVolatility,
            delta: option.delta,
            gamma: option.gamma,
            theta: option.theta,
            vega: option.vega,
            updatedAt: option.updatedAt || new Date(),
          }));
          
          await tx.insert(historicalOptionsChains).values(historicalData);
          console.log(`✅ Archived ${historicalData.length} expired contracts to historical table`);
          
          // Now delete the original expired options
          const expiredDeleteResult = await tx
            .delete(optionsChains)
            .where(sql`expiration_date < ${expiredCutoff.toISOString().split('T')[0]}`);
          
          console.log(`🗑️ Removed ${expiredDeleteResult.rowCount} expired options from main table after archiving`);
        } else {
          console.log(`ℹ️ No expired contracts found to archive`);
        }
        
        // 2. Remove very old price data (keep recent data for historical reference)
        const staleDeleteResult = await tx
          .delete(optionsChains)
          .where(
            and(
              sql`expiration_date >= ${expiredCutoff.toISOString().split('T')[0]}`, // Not expired yet
              sql`updated_at < ${staleCutoff.toISOString()}` // But very old price data
            )
          );
        
        console.log(`🗑️ Removed stale price data: ${staleDeleteResult.rowCount} records`);
        
        // 3. Get cleanup statistics
        const remainingCount = await tx
          .select({ count: sql<number>`count(*)` })
          .from(optionsChains);
        
        const activeSymbols = await tx
          .selectDistinct({ symbol: optionsChains.symbol })
          .from(optionsChains);
        
        console.log(`📊 Cleanup complete: ${remainingCount[0].count} options records remain across ${activeSymbols.length} symbols`);
      });
      
      console.log(`✅ ARCHIVE & CLEANUP COMPLETE: Expired options archived and stale data cleanup finished successfully`);
      
    } catch (cleanupError) {
      console.error(`❌ CLEANUP FAILED: Error during stale data cleanup:`, cleanupError);
      throw cleanupError;
    }
  }

  // Daily stale data cleanup scheduler
  async scheduleStaleDataCleanup(): Promise<void> {
    console.log(`⏰ DAILY SCHEDULER: Checking if cleanup is needed...`);
    
    try {
      // Check if daily cleanup is needed (run once per day max)
      const now = Date.now();
      const oneDayMs = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
      
      // For simplicity, use a simple in-memory check (in production, store this in DB)
      if (!this.lastCleanupTime || (now - this.lastCleanupTime) >= oneDayMs) {
        console.log(`⏰ Running scheduled daily cleanup - last cleanup was ${this.lastCleanupTime ? new Date(this.lastCleanupTime).toISOString() : 'never'}`);
        
        await this.archiveExpiredOptionsAndCleanup();
        this.lastCleanupTime = now;
        
        console.log(`⏰ Scheduled daily cleanup completed, next cleanup after ${new Date(now + oneDayMs).toISOString()}`);
      } else {
        const nextCleanup = new Date(this.lastCleanupTime + oneDayMs);
        console.log(`⏰ Daily cleanup not needed yet, next cleanup scheduled for ${nextCleanup.toISOString()}`);
      }
    } catch (schedulerError) {
      console.error(`❌ DAILY SCHEDULER ERROR: Failed to run scheduled cleanup:`, schedulerError);
      // Don't throw - cleanup failures shouldn't break normal operations
    }
  }

  // Saturday 8am archival scheduler - runs historical data archival every Saturday at 8am
  async scheduleSaturdayArchival(): Promise<void> {
    console.log(`📅 SATURDAY SCHEDULER: Checking if Saturday 8am archival is needed...`);
    
    try {
      const now = new Date();
      const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday
      const hour = now.getHours();
      const minutes = now.getMinutes();
      
      // Check if it's Saturday (day 6) and between 8:00-8:59am
      const isSaturday = dayOfWeek === 6;
      const isEightAM = hour === 8;
      
      console.log(`📅 Current time: ${now.toISOString()}, Day: ${dayOfWeek} (${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dayOfWeek]}), Hour: ${hour}:${minutes.toString().padStart(2, '0')}`);
      console.log(`📅 Is Saturday: ${isSaturday}, Is 8am hour: ${isEightAM}`);
      
      if (!isSaturday || !isEightAM) {
        // Calculate next Saturday 8am
        const nextSaturday = new Date(now);
        const daysUntilSaturday = (6 - dayOfWeek + 7) % 7 || 7; // Days until next Saturday
        nextSaturday.setDate(now.getDate() + daysUntilSaturday);
        nextSaturday.setHours(8, 0, 0, 0); // Set to 8:00:00 AM
        
        if (isSaturday && hour < 8) {
          // It's Saturday but before 8am - wait until 8am today
          nextSaturday.setDate(now.getDate());
        }
        
        console.log(`📅 Not Saturday 8am yet. Next scheduled archival: ${nextSaturday.toISOString()}`);
        return;
      }
      
      // Check if we already ran this week (prevent multiple runs within the same hour)
      const weekKey = `${now.getFullYear()}-W${Math.ceil(now.getDate() / 7)}-${now.getMonth()}`;
      if (this.lastArchivalWeek === weekKey) {
        console.log(`📅 Archival already completed this week (${weekKey}), skipping`);
        return;
      }
      
      console.log(`📅 🎯 SATURDAY 8AM ARCHIVAL TRIGGER: Running historical data archival...`);
      console.log(`📅 Week key: ${weekKey}, Last run week: ${this.lastArchivalWeek || 'never'}`);
      
      // Use database-based global lock to prevent concurrent archival processes
      const archivalLockId = this.hashStringToInt('saturday_archival_lock');
      
      await db.transaction(async (tx) => {
        try {
          // Try to acquire archival lock (will wait up to 1 second)
          await tx.execute(sql`SELECT pg_advisory_xact_lock(${archivalLockId})`);
          console.log(`🔒 Saturday archival lock acquired`);
          
          // Run the historical data archival
          await this.archiveExpiredOptionsAndCleanup();
          
          // Mark this week as completed
          this.lastArchivalWeek = weekKey;
          
          console.log(`✅ Saturday 8am archival completed successfully for week ${weekKey}`);
          
        } catch (archivalError) {
          console.error(`❌ Saturday archival failed:`, archivalError);
          throw archivalError;
        }
        // Lock automatically released when transaction ends
      });
      
      console.log(`🔓 Saturday archival lock released`);
      
    } catch (schedulerError) {
      console.error(`❌ SATURDAY SCHEDULER ERROR: Failed to run scheduled archival:`, schedulerError);
      // Don't throw - archival failures shouldn't break normal operations
    }
  }

  private lastCleanupTime: number | null = null;
  private lastArchivalWeek: string | null = null;

  async saveOptionsChain(symbol: string, chainData: OptionsChainData): Promise<void> {
    try {
      console.log(`💾 UPSERT METHOD CALLED: Saving options chain for ${symbol} to database using UPSERT strategy...`);
      console.log(`💾 UPSERT INPUT DATA:`, {
        symbol,
        hasOptions: !!chainData.options,
        optionsCount: chainData.options?.length || 0,
        hasChains: !!chainData.chains,
        expirationDates: chainData.expirationDates || [],
        dataSource: chainData.dataSource,
        timestamp: chainData.timestamp
      });
      
      if (!db) {
        console.error('❌ DATABASE SAVE FAILED: db is null/undefined!');
        return;
      }
      
      // Test database connection
      try {
        console.log(`🔍 Testing database connection for ${symbol}...`);
        const testQuery = await db.select().from(optionsChains).where(eq(optionsChains.symbol, symbol)).limit(1);
        console.log(`✅ Database connection test successful - found ${testQuery.length} existing records`);
      } catch (dbTestError) {
        console.error(`❌ Database connection test failed:`, dbTestError);
        throw dbTestError;
      }

      // Convert OptionsChainData to database format
      const chainRecords: InsertOptionsChain[] = [];
      
      // Handle both old format (chains) and new format (options array)
      if (chainData.options && Array.isArray(chainData.options)) {
        // New format: direct array of options
        for (const option of chainData.options) {
          if (!option.strike || !option.expiration_date || !option.contract_type) {
            console.warn(`⚠️ Skipping invalid option:`, option);
            continue;
          }
          
          // Convert expiration_date from timestamp to YYYY-MM-DD format if needed
          let expirationDate = option.expiration_date;
          if (typeof expirationDate === 'number') {
            expirationDate = new Date(expirationDate * 1000).toISOString().split('T')[0];
          } else if (typeof expirationDate === 'string' && expirationDate.includes('/')) {
            const date = new Date(expirationDate);
            expirationDate = date.toISOString().split('T')[0];
          }
          
          chainRecords.push({
            symbol,
            expirationDate: expirationDate,
            strike: option.strike,
            optionType: option.contract_type, // 'call' or 'put'
            bid: option.bid || 0,
            ask: option.ask || 0,
            lastPrice: option.last || 0,
            volume: option.volume || 0,
            openInterest: option.open_interest || 0,
            impliedVolatility: option.implied_volatility || 0,
            delta: option.delta || 0,
            gamma: option.gamma || 0,
            theta: option.theta || 0,
            vega: option.vega || 0,
          });
        }
      } else if (chainData.chains) {
        // Old format: grouped by expiration
        for (const [expirationDate, chain] of Object.entries(chainData.chains)) {
          // Save calls
          for (const call of chain.calls) {
            chainRecords.push({
              symbol,
              expirationDate,
              optionType: 'call',
              strike: call.strike,
              bid: call.bid,
              ask: call.ask,
              lastPrice: call.last || 0,
              volume: call.volume || 0,
              openInterest: call.openInterest || 0,
              impliedVolatility: call.impliedVolatility || 0,
              delta: call.delta || 0,
              gamma: call.gamma || 0,
              theta: call.theta || 0,
              vega: call.vega || 0,
            });
          }
          
          // Save puts
          for (const put of chain.puts) {
            chainRecords.push({
              symbol,
              expirationDate,
              optionType: 'put',
              strike: put.strike,
              bid: put.bid,
              ask: put.ask,
              lastPrice: put.last || 0,
              volume: put.volume || 0,
              openInterest: put.openInterest || 0,
              impliedVolatility: put.impliedVolatility || 0,
              delta: put.delta || 0,
              gamma: put.gamma || 0,
              theta: put.theta || 0,
              vega: put.vega || 0,
            });
          }
        }
      }
      
      // SIMPLE APPROACH: Delete existing and insert new
      if (chainRecords.length > 0) {
        console.log(`🔄 SIMPLE SAVE: Processing ${chainRecords.length} options contracts for ${symbol}...`);
        console.log(`🔍 Sample record structure:`, chainRecords[0]);
        
        // Step 1: Delete existing data for this symbol
        console.log(`🗑️ Deleting existing data for ${symbol}...`);
        const deleteResult = await db.delete(optionsChains).where(eq(optionsChains.symbol, symbol));
        console.log(`✅ Deleted existing data for ${symbol}`);
        
        // Step 2: Insert new data in batches
        console.log(`📥 Inserting ${chainRecords.length} new records for ${symbol}...`);
        const batchSize = 100;
        let totalInserted = 0;
        
        for (let i = 0; i < chainRecords.length; i += batchSize) {
          const batch = chainRecords.slice(i, i + batchSize);
          console.log(`📥 Inserting batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(chainRecords.length/batchSize)} (${batch.length} records)...`);
          
          try {
            await db.insert(optionsChains).values(batch);
            totalInserted += batch.length;
            console.log(`✅ Batch ${Math.floor(i/batchSize) + 1} inserted successfully`);
          } catch (batchError) {
            console.error(`❌ Batch ${Math.floor(i/batchSize) + 1} failed:`, batchError);
            throw batchError;
          }
        }
        
        console.log(`✅ SIMPLE SAVE completed for ${symbol}: ${totalInserted} records inserted`);
        
        // Log unique expiration dates
        const uniqueExpirations = [...new Set(chainRecords.map(r => r.expirationDate))].sort();
        console.log(`📅 Unique expiration dates saved: ${uniqueExpirations.join(', ')}`);
        
        // Verify what was actually saved to database
        try {
          const verificationData = await db.select().from(optionsChains).where(eq(optionsChains.symbol, symbol));
          console.log(`🔍 DATABASE VERIFICATION: ${verificationData.length} records found in database for ${symbol} after save`);
          if (verificationData.length > 0) {
            const dbExpirations = [...new Set(verificationData.map(r => r.expirationDate))].sort();
            console.log(`🔍 DATABASE EXPIRATIONS: ${dbExpirations.join(', ')}`);
          }
        } catch (verifyError) {
          console.error(`❌ Database verification failed:`, verifyError);
        }
      } else {
        console.warn(`⚠️ No options data to save for ${symbol}`);
      }
      
    } catch (error) {
      console.error(`❌ Failed to save options chain for ${symbol}:`, error);
      throw error;
    }
  }

  // Database-based options chain operations (single source of truth)
  async getOptionsChainFromDB(symbol: string, expirationDate?: string): Promise<OptionsChain[]> {
    try {
      console.log(`📊 Getting options chain from database for ${symbol}${expirationDate ? ` with expiration ${expirationDate}` : ''}`);
      
      let query = db.select().from(optionsChains).where(eq(optionsChains.symbol, symbol));
      
      if (expirationDate) {
        query = query.where(and(eq(optionsChains.symbol, symbol), eq(optionsChains.expirationDate, expirationDate)));
      }
      
      const results = await query;
      console.log(`✅ Retrieved ${results.length} options from database for ${symbol}`);
      return results;
    } catch (error) {
      console.error(`❌ Failed to get options chain from database for ${symbol}:`, error);
      handleDbError('getOptionsChainFromDB', error);
      return [];
    }
  }

  async clearOptionsChainData(symbol: string): Promise<void> {
    try {
      console.log(`🗑️ Clearing options chain data from database for ${symbol}`);
      await db.delete(optionsChains).where(eq(optionsChains.symbol, symbol));
      console.log(`✅ Cleared options chain data for ${symbol}`);
    } catch (error) {
      console.error(`❌ Failed to clear options chain data for ${symbol}:`, error);
      handleDbError('clearOptionsChainData', error);
    }
  }

  async updateOptionsChainData(symbol: string, optionsData: any[]): Promise<void> {
    try {
      console.log(`🔄 Updating options chain data in database for ${symbol} with ${optionsData.length} options`);
      
      const chainRecords: InsertOptionsChain[] = [];
      
      // MarketData.app API returns individual option contracts, not grouped data
      for (const option of optionsData) {
        const strikeValue = option?.strike ?? option?.strikePrice ?? option?.strike_price;
        const expirationRaw = option?.expiration_date ?? option?.expirationDate ?? option?.expiration ?? option?.expirationTimestamp;
        const contractTypeRaw = option?.contract_type ?? option?.optionType ?? option?.type;

        if (strikeValue === undefined || strikeValue === null || !expirationRaw || !contractTypeRaw) {
          console.warn(`[optionsChain] Skipping option missing required fields`, option);
          continue;
        }

        let expirationDate = expirationRaw;
        if (expirationRaw instanceof Date) {
          expirationDate = expirationRaw.toISOString().split('T')[0];
        } else if (typeof expirationRaw === 'number') {
          expirationDate = new Date(expirationRaw * 1000).toISOString().split('T')[0];
        } else if (typeof expirationRaw === 'string') {
          const normalized = expirationRaw.includes('T') ? expirationRaw.split('T')[0] : expirationRaw;
          if (normalized.includes('/')) {
            const parsedDate = new Date(normalized);
            expirationDate = Number.isNaN(parsedDate.getTime()) ? normalized : parsedDate.toISOString().split('T')[0];
          } else {
            expirationDate = normalized;
          }
        } else {
          expirationDate = String(expirationRaw);
        }

        if (typeof expirationDate === 'string' && expirationDate.includes('T')) {
          expirationDate = expirationDate.split('T')[0];
        }

        const contractType = String(contractTypeRaw).toLowerCase();
        if (contractType !== 'call' && contractType !== 'put') {
          console.warn(`[optionsChain] Skipping option with unsupported contract type: ${contractTypeRaw}`);
          continue;
        }

        const numericStrike = typeof strikeValue === 'string' ? Number.parseFloat(strikeValue) : Number(strikeValue);
        if (!Number.isFinite(numericStrike)) {
          console.warn(`[optionsChain] Skipping option with non-numeric strike`, strikeValue);
          continue;
        }

        const bid = option?.bid ?? option?.marketBid ?? option?.bestBid ?? 0;
        const ask = option?.ask ?? option?.marketAsk ?? option?.bestAsk ?? 0;
        const lastPrice = option?.last ?? option?.lastPrice ?? option?.mid ?? option?.midPrice ?? 0;
        const volume = option?.volume ?? option?.totalVolume ?? 0;
        const openInterest = option?.open_interest ?? option?.openInterest ?? option?.openinterest ?? 0;
        const impliedVolatility = option?.implied_volatility ?? option?.impliedVolatility ?? 0;

        console.log(`[optionsChain] Processing ${symbol} ${contractType} strike ${numericStrike} expiration ${expirationDate}`);

        chainRecords.push({
          symbol,
          expirationDate: typeof expirationDate === 'string' ? expirationDate : String(expirationDate),
          strike: numericStrike,
          optionType: contractType,
          bid,
          ask,
          lastPrice,
          volume,
          openInterest,
          impliedVolatility,
          delta: option?.delta ?? 0,
          gamma: option?.gamma ?? 0,
          theta: option?.theta ?? 0,
          vega: option?.vega ?? 0,
        });
      }
      
      if (chainRecords.length > 0) {
        // Insert in batches to avoid query limits
        const batchSize = 100;
        for (let i = 0; i < chainRecords.length; i += batchSize) {
          const batch = chainRecords.slice(i, i + batchSize);
          await db.insert(optionsChains).values(batch);
        }
        console.log(`✅ Inserted ${chainRecords.length} options records into database for ${symbol}`);
        
        // Log unique expiration dates
        const uniqueExpirations = [...new Set(chainRecords.map(r => r.expirationDate))].sort();
        console.log(`📅 Unique expiration dates stored: ${uniqueExpirations.join(', ')}`);
      } else {
        console.warn(`⚠️ No options data to insert for ${symbol}`);
      }
      
    } catch (error) {
      console.error(`❌ Failed to update options chain data for ${symbol}:`, error);
      handleDbError('updateOptionsChainData', error);
    }
  }

  async getAvailableExpirationDates(): Promise<string[]> {
    try {
      console.log('📅 Getting available expiration dates from database...');
      
      // Query for distinct expiration dates from options_chains table
      const results = await db
        .selectDistinct({ expirationDate: optionsChains.expirationDate })
        .from(optionsChains)
        .orderBy(optionsChains.expirationDate);
      
      const expirationDates = results.map(r => r.expirationDate).filter(Boolean);
      console.log(`✅ Found ${expirationDates.length} available expiration dates:`, expirationDates);
      
      return expirationDates;
    } catch (error) {
      console.error('❌ Failed to get available expiration dates:', error);
      handleDbError('getAvailableExpirationDates', error);
      return [];
    }
  }

  async getAllActiveTickersAcrossAllUsers(): Promise<Ticker[]> {
    try {
      console.log('📊 Getting all active tickers across all users for optimized API calls...');
      
      const results = await db
        .select()
        .from(tickers)
        .where(eq(tickers.isActive, true));
      
      console.log(`✅ Retrieved ${results.length} active tickers across all users`);
      return results;
    } catch (error) {
      console.error('❌ Failed to get all active tickers across all users:', error);
      handleDbError('getAllActiveTickersAcrossAllUsers', error);
    }
  }

  // Price alert operations
  async createPriceAlert(userId: string, alert: CreatePriceAlertRequest): Promise<PriceAlert> {
    const ticker = await this.getTicker(alert.tickerId);
    if (!ticker) {
      throw new Error('Ticker not found');
    }

    const alertData: InsertPriceAlert = {
      userId,
      tickerId: alert.tickerId,
      alertType: alert.alertType,
      targetValue: alert.targetValue,
      currentValue: ticker.currentPrice,
      isTriggered: false,
      isActive: true,
      notificationMethod: alert.notificationMethod,
      message: alert.message || `${alert.alertType} alert for ${ticker.symbol} at $${alert.targetValue}`,
      triggeredAt: null
    };

    const [priceAlert] = await db.insert(priceAlerts).values(alertData).returning();
    return priceAlert;
  }

  async getPriceAlertsForUser(userId: string): Promise<PriceAlert[]> {
    return await db.select().from(priceAlerts).where(
      and(eq(priceAlerts.userId, userId), eq(priceAlerts.isActive, true))
    );
  }

  async getPriceAlertsForTicker(tickerId: string): Promise<PriceAlert[]> {
    return await db.select().from(priceAlerts).where(
      and(eq(priceAlerts.tickerId, tickerId), eq(priceAlerts.isActive, true))
    );
  }

  async updatePriceAlert(id: string, updates: Partial<PriceAlert>): Promise<void> {
    await db.update(priceAlerts).set(updates).where(eq(priceAlerts.id, id));
  }

  async deletePriceAlert(id: string): Promise<void> {
    await db.delete(priceAlerts).where(eq(priceAlerts.id, id));
  }

  async triggerAlert(id: string): Promise<void> {
    await db.update(priceAlerts)
      .set({ 
        isTriggered: true, 
        triggeredAt: new Date() 
      })
      .where(eq(priceAlerts.id, id));
  }

  // Exit recommendation operations
  async createExitRecommendation(recommendationData: InsertExitRecommendation): Promise<ExitRecommendation> {
    const [recommendation] = await db
      .insert(exitRecommendations)
      .values({
        ...recommendationData,
        isActive: true,
        isDismissed: false
      })
      .returning();
    return recommendation;
  }

  async getExitRecommendationsForUser(userId: string): Promise<ExitRecommendation[]> {
    return await db.select().from(exitRecommendations).where(
      and(
        eq(exitRecommendations.userId, userId), 
        eq(exitRecommendations.isActive, true),
        eq(exitRecommendations.isDismissed, false)
      )
    );
  }

  async getExitRecommendationsForPosition(positionId: string): Promise<ExitRecommendation[]> {
    return await db.select().from(exitRecommendations).where(
      and(
        eq(exitRecommendations.positionId, positionId), 
        eq(exitRecommendations.isActive, true),
        eq(exitRecommendations.isDismissed, false)
      )
    );
  }

  async updateExitRecommendation(id: string, updates: Partial<ExitRecommendation>): Promise<void> {
    await db.update(exitRecommendations)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(exitRecommendations.id, id));
  }

  async dismissRecommendation(id: string): Promise<void> {
    await db.update(exitRecommendations)
      .set({ 
        isDismissed: true, 
        updatedAt: new Date() 
      })
      .where(eq(exitRecommendations.id, id));
  }

  async getActiveTickersWithAlertsAndRecsForUser(userId: string): Promise<TickerWithAlertsAndRecs[]> {
    const tickersWithPositions = await this.getActiveTickersWithPositionsForUser(userId);
    const result: TickerWithAlertsAndRecs[] = [];

    for (const tickerWithPos of tickersWithPositions) {
      const alerts = await this.getPriceAlertsForTicker(tickerWithPos.id);
      const recommendations = await this.getExitRecommendationsForPosition(tickerWithPos.position.id);
      
      result.push({
        ...tickerWithPos,
        alerts,
        recommendations
      });
    }

    return result;
  }
}

export const storage = new DatabaseStorage();
