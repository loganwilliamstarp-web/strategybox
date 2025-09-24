// Mock database for development when PostgreSQL is not available
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import type { 
  User, 
  Ticker, 
  OptionsPosition, 
  InsertTicker, 
  InsertLongStranglePosition,
  InsertUser 
} from '@shared/schema';
import { calculateExpectedMove } from './utils/expectedMove';

// Mock ticker with proper schema structure
interface MockTicker extends Ticker {
  currentPrice: number;
  priceChange: number;
  priceChangePercent: number;
  earningsDate: string | null;
  isActive: boolean;
}

class MockDatabase {
  private users: Map<string, User> = new Map();
  private usersByEmail: Map<string, User> = new Map();
  private tickers: Map<string, MockTicker> = new Map();
  private positions: Map<string, OptionsPosition> = new Map();

  constructor() {
    // Create default test users
    this.createTestUsers();
    // Create sample data for testing
    this.createSampleData();
  }

  private async createTestUsers() {
    const hashedPassword = await bcrypt.hash('password123', 10);
    
    // Original test user
    const testUser: User = {
      id: 'test-user-1',
      email: 'test@options.com',
      firstName: 'Test',
      lastName: 'User',
      password: hashedPassword,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Demo user for real-time testing
    const demoUser: User = {
      id: 'demo-user-12345',
      email: 'demo@options.com',
      firstName: 'Demo',
      lastName: 'User',
      password: hashedPassword,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Real user from the system
    const realUser: User = {
      id: 'ljohns1119-user-id',
      email: 'ljohns1119@gmail.com',
      firstName: 'Luke',
      lastName: 'Johnson',
      password: hashedPassword,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    this.users.set(testUser.id, testUser);
    this.usersByEmail.set(testUser.email, testUser);
    
    this.users.set(demoUser.id, demoUser);
    this.usersByEmail.set(demoUser.email, demoUser);

    this.users.set(realUser.id, realUser);
    this.usersByEmail.set(realUser.email, realUser);
    
    console.log('✅ Mock database initialized with test users:');
    console.log('   - test@options.com / password123');
    console.log('   - demo@options.com / password123');
    console.log('   - ljohns1119@gmail.com / password123');
  }

  private async createSampleData() {
    // Create sample tickers for demo user
    const demoUserId = 'demo-user-12345';
    // Also create for real user
    const realUserId = 'ljohns1119-user-id';
    
    const sampleTickers = [
      {
        userId: demoUserId,
        symbol: 'AAPL',
        companyName: 'Apple Inc.',
        currentPrice: 175.50,
        priceChange: 2.30,
        priceChangePercent: 1.33,
        earningsDate: null,
        isActive: true,
      },
      {
        userId: demoUserId,
        symbol: 'MSFT',
        companyName: 'Microsoft Corporation',
        currentPrice: 378.85,
        priceChange: -1.45,
        priceChangePercent: -0.38,
        earningsDate: null,
        isActive: true,
      },
      {
        userId: demoUserId,
        symbol: 'NVDA',
        companyName: 'NVIDIA Corporation',
        currentPrice: 875.28,
        priceChange: 15.75,
        priceChangePercent: 1.83,
        earningsDate: null,
        isActive: true,
      },
      // Real user tickers (same data for testing)
      {
        userId: realUserId,
        symbol: 'AAPL',
        companyName: 'Apple Inc.',
        currentPrice: 175.50,
        priceChange: 2.30,
        priceChangePercent: 1.33,
        earningsDate: null,
        isActive: true,
      },
      {
        userId: realUserId,
        symbol: 'NVDA',
        companyName: 'NVIDIA Corporation',
        currentPrice: 875.28,
        priceChange: 15.75,
        priceChangePercent: 1.83,
        earningsDate: null,
        isActive: true,
      },
      {
        userId: realUserId,
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
      
      // Create a sample position for each ticker - FORCE LONG STRANGLE
      // Calculate realistic strikes - one strike above/below current price
      let strikeIncrement: number;
      if (tickerData.currentPrice < 50) {
        strikeIncrement = 1; // $1 increments for low-priced stocks
      } else if (tickerData.currentPrice < 200) {
        strikeIncrement = 2.5; // $2.50 increments for mid-priced stocks
      } else {
        strikeIncrement = 5; // $5 increments for high-priced stocks
      }
      
      // Find the nearest strikes above and below current price
      const putStrike = Math.floor(tickerData.currentPrice / strikeIncrement) * strikeIncrement;
      const callStrike = Math.ceil(tickerData.currentPrice / strikeIncrement) * strikeIncrement;
      
      // Ensure call is at least $1 above current price and put is at least $1 below
      let finalPutStrike = putStrike >= tickerData.currentPrice - 1 ? putStrike - strikeIncrement : putStrike;
      let finalCallStrike = callStrike <= tickerData.currentPrice + 1 ? callStrike + strikeIncrement : callStrike;
      
      // Double-check minimum $1 separation
      while (finalPutStrike >= tickerData.currentPrice - 1) {
        finalPutStrike -= strikeIncrement;
      }
      while (finalCallStrike <= tickerData.currentPrice + 1) {
        finalCallStrike += strikeIncrement;
      }

      const position: InsertLongStranglePosition = {
        tickerId: ticker.id,
        strategyType: 'long_strangle', // EXPLICITLY SET TO LONG STRANGLE
        longPutStrike: finalPutStrike, // One strike below current price
        longCallStrike: finalCallStrike, // One strike above current price
        longPutPremium: 3.50,
        longCallPremium: 4.25,
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

    console.log('✅ Mock database initialized with sample tickers and positions');
  }

  // User methods
  async createUser(userData: Omit<User, 'id' | 'createdAt' | 'updatedAt'>) {
    const id = randomUUID();
    const now = new Date();
    const user: User = {
      ...userData,
      id,
      createdAt: now,
      updatedAt: now
    };
    
    this.users.set(id, user);
    this.usersByEmail.set(userData.email, user);
    return user;
  }

  async getUserById(id: string): Promise<User | null> {
    return this.users.get(id) || null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    return this.usersByEmail.get(email) || null;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | null> {
    const user = this.users.get(id);
    if (!user) return null;

    const updatedUser = { ...user, ...updates, updatedAt: new Date() };
    this.users.set(id, updatedUser);
    
    // Update email index if email changed
    if (updates.email && updates.email !== user.email) {
      this.usersByEmail.delete(user.email);
      this.usersByEmail.set(updates.email, updatedUser);
    }
    
    return updatedUser;
  }

  // Ticker methods that match the storage interface
  async createTicker(tickerData: InsertTicker): Promise<MockTicker> {
    const id = randomUUID();
    const ticker: MockTicker = {
      id,
      userId: tickerData.userId,
      symbol: tickerData.symbol.toUpperCase(),
      companyName: tickerData.companyName,
      currentPrice: tickerData.currentPrice,
      priceChange: tickerData.priceChange,
      priceChangePercent: tickerData.priceChangePercent,
      earningsDate: tickerData.earningsDate,
      isActive: tickerData.isActive ?? true,
    };
    
    this.tickers.set(id, ticker);
    return ticker;
  }

  async getTickerById(id: string): Promise<MockTicker | null> {
    return this.tickers.get(id) || null;
  }

  async getTickerBySymbol(symbol: string, userId: string): Promise<MockTicker | null> {
    return Array.from(this.tickers.values()).find(t => 
      t.symbol === symbol.toUpperCase() && t.userId === userId
    ) || null;
  }

  async getActiveTickersForUser(userId: string): Promise<MockTicker[]> {
    return Array.from(this.tickers.values()).filter(t => 
      t.userId === userId && t.isActive
    );
  }

  async getTickersForUser(userId: string): Promise<MockTicker[]> {
    return Array.from(this.tickers.values()).filter(t => t.userId === userId);
  }

  async getActiveTickersWithPositionsForUser(userId: string): Promise<any[]> {
    const activeTickers = await this.getActiveTickersForUser(userId);
    const result: any[] = [];

    for (const ticker of activeTickers) {
      const position = await this.getPositionByTickerId(ticker.id);
      if (position) {
        result.push({ ...ticker, position });
      }
    }

    console.log(`🔍 Mock DB: Found ${result.length} tickers with positions for user ${userId}`);
    return result;
  }

  async deleteTicker(id: string): Promise<boolean> {
    return this.tickers.delete(id);
  }

  // Position methods that match the storage interface
  async createPosition(positionData: InsertLongStranglePosition): Promise<OptionsPosition> {
    const id = randomUUID();
    
    // Calculate expected move data
    const expectedMove = calculateExpectedMove(
      positionData.atmValue, // Use ATM value as current price
      positionData.impliedVolatility,
      positionData.daysToExpiry
    );
    
    const position: OptionsPosition = {
      id,
      tickerId: positionData.tickerId,
      strategyType: positionData.strategyType,
      longPutStrike: positionData.longPutStrike,
      longCallStrike: positionData.longCallStrike,
      longPutPremium: positionData.longPutPremium,
      longCallPremium: positionData.longCallPremium,
      shortPutStrike: positionData.shortPutStrike || null,
      shortCallStrike: positionData.shortCallStrike || null,
      shortPutPremium: positionData.shortPutPremium || null,
      shortCallPremium: positionData.shortCallPremium || null,
      longExpiration: positionData.longExpiration || null,
      shortExpiration: positionData.shortExpiration || null,
      lowerBreakeven: positionData.lowerBreakeven,
      upperBreakeven: positionData.upperBreakeven,
      maxLoss: positionData.maxLoss,
      maxProfit: positionData.maxProfit || null,
      atmValue: positionData.atmValue,
      impliedVolatility: positionData.impliedVolatility,
      ivPercentile: positionData.ivPercentile,
      daysToExpiry: positionData.daysToExpiry,
      expirationDate: positionData.expirationDate,
      strikesManuallySelected: positionData.strikesManuallySelected,
      customCallStrike: positionData.customCallStrike || null,
      customPutStrike: positionData.customPutStrike || null,
      expirationCycleForCustomStrikes: positionData.expirationCycleForCustomStrikes || null,
      // Expected move fields
      callIV: null,
      putIV: null,
      expectedMoveWeeklyLow: expectedMove.weeklyLow,
      expectedMoveWeeklyHigh: expectedMove.weeklyHigh,
      expectedMoveDailyMove: expectedMove.dailyMove,
      expectedMoveWeeklyMove: expectedMove.weeklyMove,
      expectedMoveMovePercentage: expectedMove.movePercentage,
    };
    
    this.positions.set(id, position);
    return position;
  }

  async getPositionByTickerId(tickerId: string): Promise<OptionsPosition | null> {
    return Array.from(this.positions.values()).find(p => p.tickerId === tickerId) || null;
  }

  async getPositionsForUser(userId: string): Promise<OptionsPosition[]> {
    // Note: In the real schema, positions don't have userId directly, they're linked through tickers
    const userTickers = Array.from(this.tickers.values()).filter(t => t.userId === userId);
    const tickerIds = new Set(userTickers.map(t => t.id));
    return Array.from(this.positions.values()).filter(p => tickerIds.has(p.tickerId));
  }

  async updatePosition(id: string, updates: Partial<OptionsPosition>): Promise<OptionsPosition | null> {
    const position = this.positions.get(id);
    if (!position) return null;

    const updatedPosition = { ...position, ...updates };
    this.positions.set(id, updatedPosition);
    return updatedPosition;
  }

  async deletePosition(id: string): Promise<boolean> {
    return this.positions.delete(id);
  }

  // Health check
  async healthCheck(): Promise<{ status: string; details: any }> {
    return {
      status: 'healthy',
      details: {
        users: this.users.size,
        tickers: this.tickers.size,
        positions: this.positions.size,
        type: 'mock_database'
      }
    };
  }
}

export const mockDb = new MockDatabase();
