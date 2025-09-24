import { 
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

  tickers,
  longStranglePositions,
  users,
  optionsChains,
  priceAlerts,
  exitRecommendations
} from "@shared/schema";
import { randomUUID } from "crypto";
import { eq, and, isNotNull } from "drizzle-orm";
import { db } from "./db";
import { calculateExpectedMove } from "./utils/expectedMove";

export interface IStorage {
  // User operations for email/password auth
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Ticker operations
  getTicker(id: string): Promise<Ticker | undefined>;
  getTickerBySymbol(symbol: string, userId: string): Promise<Ticker | undefined>;
  createTicker(ticker: InsertTicker): Promise<Ticker>;
  updateTicker(id: string, updates: Partial<InsertTicker>): Promise<void>;
  getActiveTickersForUser(userId: string): Promise<Ticker[]>;
  setTickerActive(symbol: string, isActive: boolean, userId: string): Promise<void>;
  removeTickerForUser(symbol: string, userId: string): Promise<void>;
  
  // Long strangle position operations
  getPositionById(id: string): Promise<OptionsPosition | undefined>;
  getPositionByTickerId(tickerId: string): Promise<OptionsPosition | undefined>;
  createPosition(position: InsertLongStranglePosition): Promise<OptionsPosition>;
  updatePosition(id: string, userId: string, updates: Partial<Omit<InsertLongStranglePosition, 'tickerId'>>): Promise<OptionsPosition | undefined>;
  setCustomStrikes(positionId: string, userId: string, customCallStrike: number, customPutStrike: number, expirationDate: string): Promise<OptionsPosition | undefined>;
  clearCustomStrikes(positionId: string, userId: string): Promise<OptionsPosition | undefined>;
  getAllPositionsWithCustomStrikes(): Promise<OptionsPosition[]>;
  
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
  createExitRecommendation(recommendation: InsertExitRecommendation): Promise<ExitRecommendation>;
  getExitRecommendationsForUser(userId: string): Promise<ExitRecommendation[]>;
  getExitRecommendationsForPosition(positionId: string): Promise<ExitRecommendation[]>;
  updateExitRecommendation(id: string, updates: Partial<ExitRecommendation>): Promise<void>;
  dismissRecommendation(id: string): Promise<void>;
  
  // Combined operations
  getTickerWithPosition(tickerId: string): Promise<TickerWithPosition | undefined>;
  getActiveTickersWithPositionsForUser(userId: string): Promise<TickerWithPosition[]>;
  getActiveTickersWithAlertsAndRecsForUser(userId: string): Promise<TickerWithAlertsAndRecs[]>;
  getPortfolioSummaryForUser(userId: string): Promise<PortfolioSummary>;
}

export class DatabaseStorage implements IStorage {
  // Database storage using db instance
  private stockApiStatus: ApiStatus = {
    configured: true,
    status: "connected"
  };

  constructor() {
    // Initialize real user data in Supabase
    this.initializeRealUserData();
    
    // Run expected move migration for existing positions (async)
    this.runExpectedMoveMigration().catch(error => {
      console.error('❌ Expected move migration failed:', error);
    });
    
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

  // User operations for email/password auth
  async getUser(id: string): Promise<User | undefined> {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, id));
      return user;
    } catch (error) {
      console.warn('Database error in getUser, using fallback:', error);
      const { mockDb } = await import('./mockDatabase');
      const user = await mockDb.getUserById(id);
      return user || undefined;
    }
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    try {
      const [user] = await db.select().from(users).where(eq(users.email, email));
      return user;
    } catch (error) {
      console.warn('Database error in getUserByEmail, using fallback:', error);
      const { mockDb } = await import('./mockDatabase');
      const user = await mockDb.getUserByEmail(email);
      return user || undefined;
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
      console.warn('Database error in createUser, using fallback:', error);
      const { mockDb } = await import('./mockDatabase');
      const bcrypt = await import('bcryptjs');
      
      // Hash password before storing in mock database
      const hashedPassword = await bcrypt.default.hash(userData.password, 10);
      const user = await mockDb.createUser({
        ...userData,
        password: hashedPassword
      });
      return user as any;
    }
  }

  private async initializeTestUser() {
    // Create test user for development with hashed password
    const { hashPassword } = await import('./auth');
    const hashedPassword = await hashPassword('Option#123');
    
    const testUserData: InsertUser = {
      id: "test-user-id",
      email: "test@options.com",
      password: hashedPassword,
      firstName: "Test",
      lastName: "User",
      profileImageUrl: null,
    };
    
    // Check if user already exists to avoid duplicates
    const existingUser = await this.getUser("test-user-id");
    if (!existingUser) {
      await db.insert(users).values(testUserData).onConflictDoNothing();
    }
  }

  private async initializeRealUserData() {
    try {
      if (!db) {
        console.log('⚠️ Database not available - skipping real user initialization');
        return;
      }

      // Check if real user already exists
      const existingUser = await this.getUserByEmail('ljohns1119@gmail.com');
      if (existingUser) {
        console.log('✅ Real user ljohns1119@gmail.com already exists in Supabase');
        return;
      }

      // Create real user in Supabase
      const hashedPassword = await import('bcryptjs').then(bcrypt => bcrypt.hash('password123', 10));
      const realUser = await this.createUser({
        email: 'ljohns1119@gmail.com',
        firstName: 'Luke',
        lastName: 'Johnson',
        password: hashedPassword
      });

      console.log('✅ Created real user in Supabase:', realUser.email);

      // Create sample tickers for real user
      const sampleTickers = [
        {
          userId: realUser.id,
          symbol: 'AAPL',
          companyName: 'Apple Inc.',
          currentPrice: 175.50,
          priceChange: 2.30,
          priceChangePercent: 1.33,
          earningsDate: null,
          isActive: true,
        },
        {
          userId: realUser.id,
          symbol: 'NVDA',
          companyName: 'NVIDIA Corporation',
          currentPrice: 875.28,
          priceChange: 15.75,
          priceChangePercent: 1.83,
          earningsDate: null,
          isActive: true,
        },
        {
          userId: realUser.id,
          symbol: 'QQQ',
          companyName: 'Invesco QQQ Trust',
          currentPrice: 485.32,
          priceChange: 8.25,
          priceChangePercent: 1.73,
          earningsDate: null,
          isActive: true,
        }
      ];

      for (const tickerData of sampleTickers) {
        const ticker = await this.createTicker(tickerData);
        
        // Create long strangle position
        const position: InsertLongStranglePosition = {
          tickerId: ticker.id,
          userId: realUser.id,
          strategyType: 'long_strangle',
          longPutStrike: tickerData.currentPrice * 0.95,
          longCallStrike: tickerData.currentPrice * 1.05,
          longPutPremium: 3.85,
          longCallPremium: 3.90,
          shortPutStrike: null,
          shortCallStrike: null,
          shortPutPremium: null,
          shortCallPremium: null,
          longExpiration: null,
          shortExpiration: null,
          lowerBreakeven: (tickerData.currentPrice * 0.95) - 7.75,
          upperBreakeven: (tickerData.currentPrice * 1.05) + 7.75,
          maxLoss: 7.75,
          maxProfit: null,
          atmValue: tickerData.currentPrice,
          impliedVolatility: 0.25,
          ivPercentile: 50,
          daysToExpiry: 30,
          expirationDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          strikesManuallySelected: false,
          customCallStrike: null,
          customPutStrike: null,
          expirationCycleForCustomStrikes: null,
        };

        await this.createPosition(position);
      }

      console.log('✅ Real user data initialized in Supabase with 3 tickers and positions');
    } catch (error) {
      console.error('❌ Failed to initialize real user data:', error);
    }
  }

  private async initializeMockData() {
    try {
      // Initialize with test user for development
      await this.initializeTestUser();
      
      // Check if we already have test data to avoid duplicates
      const existingTickers = await this.getActiveTickersForUser("test-user-id");
      if (existingTickers.length > 0) {
        return; // Data already exists
      }
      
      // Initialize with popular tickers and their long strangle positions for test user
      const testUserId = "test-user-id";
      const mockTickers: InsertTicker[] = [
      {
        userId: testUserId,
        symbol: "AAPL",
        companyName: "Apple Inc.",
        currentPrice: 228.87,
        priceChange: 2.85,
        priceChangePercent: 1.26,
        earningsDate: "2025-01-30",
        isActive: true,
      },
      {
        userId: testUserId,
        symbol: "TSLA",
        companyName: "Tesla, Inc.",
        currentPrice: 410.73,
        priceChange: -8.92,
        priceChangePercent: -2.13,
        earningsDate: "2025-01-25",
        isActive: true,
      },
      {
        userId: testUserId,
        symbol: "SPY",
        companyName: "SPDR S&P 500 ETF",
        currentPrice: 602.45,
        priceChange: 1.80,
        priceChangePercent: 0.30,
        isActive: true,
      },
      {
        userId: testUserId,
        symbol: "QQQ",
        companyName: "Invesco QQQ Trust",
        currentPrice: 515.23,
        priceChange: 3.91,
        priceChangePercent: 0.76,
        isActive: true,
      },
      {
        userId: testUserId,
        symbol: "NVDA",
        companyName: "NVIDIA Corporation",
        currentPrice: 178.26,
        priceChange: 2.45,
        priceChangePercent: 1.39,
        earningsDate: "2025-02-19",
        isActive: false,
      },
    ];

    const mockPositions: { tickerSymbol: string; position: Omit<InsertLongStranglePosition, 'tickerId'> }[] = [
      {
        tickerSymbol: "AAPL",
        position: {
          strategyType: 'short_strangle',
          longPutStrike: 220,
          longCallStrike: 240,
          longPutPremium: 4.59,
          longCallPremium: 4.59,
          lowerBreakeven: 210.82,
          upperBreakeven: 249.18,
          maxLoss: 918,
          atmValue: 228.87,
          impliedVolatility: 28.5,
          ivPercentile: 55,
          daysToExpiry: 2,
          expirationDate: "2025-09-05", // Next Friday
        },
      },
      {
        tickerSymbol: "TSLA",
        position: {
          longPutStrike: 385,
          longCallStrike: 440,
          longPutPremium: 5.60,
          longCallPremium: 5.60,
          lowerBreakeven: 374.80,
          upperBreakeven: 451.20,
          maxLoss: 1120,
          atmValue: 410.73,
          impliedVolatility: 45.2,
          ivPercentile: 30,
          daysToExpiry: 2,
          expirationDate: "2025-09-05", // Next Friday
        },
      },
      {
        tickerSymbol: "SPY",
        position: {
          longPutStrike: 585,
          longCallStrike: 620,
          longPutPremium: 2.15,
          longCallPremium: 2.15,
          lowerBreakeven: 580.70,
          upperBreakeven: 624.30,
          maxLoss: 430,
          atmValue: 602.45,
          impliedVolatility: 18.7,
          ivPercentile: 35,
          daysToExpiry: 2,
          expirationDate: "2025-09-05", // Next Friday
        },
      },
      {
        tickerSymbol: "QQQ",
        position: {
          longPutStrike: 490,
          longCallStrike: 540,
          longPutPremium: 3.65,
          longCallPremium: 3.65,
          lowerBreakeven: 482.70,
          upperBreakeven: 547.30,
          maxLoss: 730,
          atmValue: 515.23,
          impliedVolatility: 22.1,
          ivPercentile: 45,
          daysToExpiry: 2,
          expirationDate: "2025-09-05", // Next Friday
        },
      },
      {
        tickerSymbol: "NVDA",
        position: {
          strategyType: 'iron_condor',
          longPutStrike: 165,
          longCallStrike: 195,
          longPutPremium: 3.25,
          longCallPremium: 3.25,
          lowerBreakeven: 158.50,
          upperBreakeven: 201.50,
          maxLoss: 650,
          atmValue: 178.26,
          impliedVolatility: 52.8,
          ivPercentile: 78,
          daysToExpiry: 2,
          expirationDate: "2025-09-05", // Next Friday
        },
      },
    ];

      // Create tickers in database
      for (const tickerData of mockTickers) {
        const ticker = await this.createTicker(tickerData);
        
        // Create associated position if it exists
        const positionData = mockPositions.find(p => p.tickerSymbol === tickerData.symbol);
        if (positionData) {
          await this.createPosition({
            ...positionData.position,
            tickerId: ticker.id,
          });
        }
      }
    } catch (error) {
      console.error('Error initializing mock data:', error);
    }
  }

  // Ticker operations
  async getTicker(id: string): Promise<Ticker | undefined> {
    try {
      if (!db) {
        console.warn('Database not available, using fallback storage for getTicker');
        const { mockDb } = await import('./mockDatabase');
        return await mockDb.getTickerById(id);
      }
      const [ticker] = await db.select().from(tickers).where(eq(tickers.id, id));
      return ticker;
    } catch (error) {
      console.warn('Database error in getTicker, using fallback:', error);
      const { mockDb } = await import('./mockDatabase');
      return await mockDb.getTickerById(id);
    }
  }

  async getTickerBySymbol(symbol: string, userId: string): Promise<Ticker | undefined> {
    try {
      if (!db) {
        console.warn('Database not available, using fallback storage for getTickerBySymbol');
        const { mockDb } = await import('./mockDatabase');
        return await mockDb.getTickerBySymbol(symbol, userId);
      }
      const [ticker] = await db.select().from(tickers).where(
        and(eq(tickers.symbol, symbol), eq(tickers.userId, userId))
      );
      return ticker;
    } catch (error) {
      console.warn('Database error in getTickerBySymbol, using fallback:', error);
      const { mockDb } = await import('./mockDatabase');
      return await mockDb.getTickerBySymbol(symbol, userId);
    }
  }

  async createTicker(tickerData: InsertTicker): Promise<Ticker> {
    try {
      if (!db) {
        console.warn('Database not available, using fallback storage for createTicker');
        const { mockDb } = await import('./mockDatabase');
        return await mockDb.createTicker(tickerData);
      }
      const [ticker] = await db
        .insert(tickers)
        .values(tickerData)
        .returning();
      return ticker;
    } catch (error) {
      console.warn('Database error in createTicker, using fallback:', error);
      const { mockDb } = await import('./mockDatabase');
      return await mockDb.createTicker(tickerData);
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
      if (!db) {
        console.warn('Database not available, using fallback storage for getActiveTickersForUser');
        const { mockDb } = await import('./mockDatabase');
        return await mockDb.getActiveTickersForUser(userId);
      }
      return await db.select().from(tickers).where(
        and(eq(tickers.userId, userId), eq(tickers.isActive, true))
      );
    } catch (error) {
      console.warn('Database error in getActiveTickersForUser, using fallback:', error);
      const { mockDb } = await import('./mockDatabase');
      return await mockDb.getActiveTickersForUser(userId);
    }
  }

  async setTickerActive(symbol: string, isActive: boolean, userId: string): Promise<void> {
    await db
      .update(tickers)
      .set({ isActive })
      .where(and(eq(tickers.symbol, symbol), eq(tickers.userId, userId)));
  }

  async removeTickerForUser(symbol: string, userId: string): Promise<void> {
    // First get the ticker to get its ID
    const ticker = await this.getTickerBySymbol(symbol, userId);
    if (ticker) {
      // Remove associated position first
      await db.delete(longStranglePositions).where(eq(longStranglePositions.tickerId, ticker.id));
      // Then remove ticker
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
      if (!db) {
        console.warn('Database not available, using fallback storage for getPositionByTickerId');
        const { mockDb } = await import('./mockDatabase');
        return await mockDb.getPositionByTickerId(tickerId);
      }
      const [position] = await db.select().from(longStranglePositions).where(eq(longStranglePositions.tickerId, tickerId));
      return position;
    } catch (error) {
      console.warn('Database error in getPositionByTickerId, using fallback:', error);
      const { mockDb } = await import('./mockDatabase');
      return await mockDb.getPositionByTickerId(tickerId);
    }
  }

  async createPosition(positionData: InsertLongStranglePosition): Promise<OptionsPosition> {
    try {
      if (!db) {
        console.warn('Database not available, using fallback storage for createPosition');
        const { mockDb } = await import('./mockDatabase');
        return await mockDb.createPosition(positionData);
      }

      // Calculate expected move data
      const expectedMove = calculateExpectedMove(
        positionData.atmValue, // Use ATM value as current price
        positionData.impliedVolatility,
        positionData.daysToExpiry
      );

      // Add expected move data to position
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
      console.warn('Database error in createPosition, using fallback:', error);
      const { mockDb } = await import('./mockDatabase');
      return await mockDb.createPosition(positionData);
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
