import {
  // Table definitions
  tickers,
  users,
  longStranglePositions,
  optionsChains,
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
  type OptionsChainData,
  type PriceAlert,
  type InsertPriceAlert,
  type CreatePriceAlertRequest,
  type ExitRecommendation,
  type InsertExitRecommendation,
  // Import the actual table definitions
  tickers,
  users,
  longStranglePositions,
  optionsChains,
  priceAlerts,
  exitRecommendations,
} from "@shared/schema";
import { eq, and, isNotNull } from "drizzle-orm";
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
  saveOptionsChain(symbol: string, chainData: OptionsChainData): Promise<void>;

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
        // User exists with different ID, need to update tickers first, then user ID
        console.log(`🔄 Updating existing user ID from ${existingUser[0].id} to ${userData.id}`);
        
        // First, update all tickers to reference the new user ID
        await db
          .update(tickers)
          .set({
            userId: userData.id,
          })
          .where(eq(tickers.userId, existingUser[0].id));
        
        console.log(`🔄 Updated tickers to reference new user ID: ${userData.id}`);
        
        // Now update the user ID
        const [updatedUser] = await db
          .update(users)
          .set({
            id: userData.id,
            firstName: userData.firstName,
            lastName: userData.lastName,
            profileImageUrl: userData.profileImageUrl,
            updatedAt: new Date(),
          })
          .where(eq(users.email, userData.email))
          .returning();
        
        console.log(`✅ Successfully updated user ID and migrated tickers`);
        return updatedUser;
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
    // Delete existing chains for this symbol
    await db.delete(optionsChains).where(eq(optionsChains.symbol, symbol));
    
    // Insert new chains
    if (chains.length > 0) {
      await db.insert(optionsChains).values(chains);
    }
  }

  async saveOptionsChain(symbol: string, chainData: OptionsChainData): Promise<void> {
    try {
      console.log(`💾 Saving options chain for ${symbol} to database...`);
      
      if (!db) {
        console.error('❌ DATABASE SAVE FAILED: db is null/undefined!');
        return;
      }

      // Delete existing chains for this symbol
      await db.delete(optionsChains).where(eq(optionsChains.symbol, symbol));
      console.log(`🗑️ Cleared existing options chains for ${symbol}`);
      
      // Convert OptionsChainData to database format
      const chainRecords: InsertOptionsChain[] = [];
      
      if (chainData.chains) {
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
              lastPrice: call.last || 0, // Fix: API uses 'last', DB expects 'lastPrice'
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
              lastPrice: put.last || 0, // Fix: API uses 'last', DB expects 'lastPrice'
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
      
      // Insert new chains in batches
      if (chainRecords.length > 0) {
        // Insert in batches of 100 to avoid query limits
        const batchSize = 100;
        for (let i = 0; i < chainRecords.length; i += batchSize) {
          const batch = chainRecords.slice(i, i + batchSize);
          await db.insert(optionsChains).values(batch);
        }
        
        console.log(`✅ Saved ${chainRecords.length} options contracts for ${symbol} to database`);
      } else {
        console.warn(`⚠️ No options data to save for ${symbol}`);
      }
      
    } catch (error) {
      console.error(`❌ Failed to save options chain for ${symbol}:`, error);
      throw error;
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
