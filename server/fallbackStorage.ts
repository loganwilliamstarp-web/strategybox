// Fallback storage implementation using mock database
import { mockDb } from './mockDatabase';
import type { IStorage } from './storage';
import type {
  Ticker,
  InsertTicker,
  OptionsPosition,
  InsertLongStranglePosition,
  TickerWithPosition,
  TickerWithAlertsAndRecs,
  PortfolioSummary,
  User,
  InsertUser,
  OptionsChainData,
  InsertOptionsChain,
  PriceAlert,
  InsertPriceAlert,
  CreatePriceAlertRequest,
  ExitRecommendation,
  InsertExitRecommendation
} from "@shared/schema";
import bcrypt from 'bcryptjs';

export class FallbackStorage implements IStorage {
  constructor() {
    console.log('🔄 Using fallback storage (mock database)');
  }

  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const user = await mockDb.getUserById(id);
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const user = await mockDb.getUserByEmail(email);
    return user || undefined;
  }

  async createUser(userData: InsertUser): Promise<User> {
    // Hash password before storing
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    
    return await mockDb.createUser({
      ...userData,
      password: hashedPassword
    });
  }

  // Ticker operations
  async getTicker(id: string): Promise<Ticker | undefined> {
    // Mock implementation - return undefined for now
    return undefined;
  }

  async getTickerBySymbol(symbol: string, userId: string): Promise<Ticker | undefined> {
    const tickers = await mockDb.getTickersForUser(userId);
    return tickers.find(t => t.symbol === symbol.toUpperCase()) as any;
  }

  async createTicker(ticker: InsertTicker): Promise<Ticker> {
    return await mockDb.createTicker(ticker.userId, ticker.symbol) as any;
  }

  async updateTicker(id: string, updates: Partial<InsertTicker>): Promise<void> {
    // Mock implementation
  }

  async getActiveTickersForUser(userId: string): Promise<Ticker[]> {
    return await mockDb.getTickersForUser(userId) as any[];
  }

  async setTickerActive(symbol: string, isActive: boolean, userId: string): Promise<void> {
    // Mock implementation
  }

  async removeTickerForUser(symbol: string, userId: string): Promise<void> {
    const tickers = await mockDb.getTickersForUser(userId);
    const ticker = tickers.find(t => t.symbol === symbol.toUpperCase());
    if (ticker) {
      await mockDb.deleteTicker(ticker.id);
    }
  }

  // Position operations (simplified mock implementations)
  async getPositionById(id: string): Promise<OptionsPosition | undefined> {
    return undefined;
  }

  async getPositionByTickerId(tickerId: string): Promise<OptionsPosition | undefined> {
    return undefined;
  }

  async createPosition(position: InsertLongStranglePosition): Promise<OptionsPosition> {
    // Mock implementation - return a basic position
    return {
      id: 'mock-position-' + Date.now(),
      tickerId: position.tickerId,
      userId: position.userId,
      strategy: position.strategy || 'long_strangle',
      callStrike: position.callStrike || 0,
      putStrike: position.putStrike || 0,
      expirationDate: position.expirationDate || new Date(),
      premium: position.premium || 0,
      quantity: position.quantity || 1,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    } as any;
  }

  async updatePosition(id: string, userId: string, updates: Partial<Omit<InsertLongStranglePosition, 'tickerId'>>): Promise<OptionsPosition | undefined> {
    return undefined;
  }

  async setCustomStrikes(positionId: string, userId: string, customCallStrike: number, customPutStrike: number, expirationDate: string): Promise<OptionsPosition | undefined> {
    return undefined;
  }

  async clearCustomStrikes(positionId: string, userId: string): Promise<OptionsPosition | undefined> {
    return undefined;
  }

  async getAllPositionsWithCustomStrikes(): Promise<OptionsPosition[]> {
    return [];
  }

  // Options chain operations
  async getOptionsChain(symbol: string): Promise<OptionsChainData> {
    return { symbol, chains: [] };
  }

  async updateOptionsChain(symbol: string, chains: InsertOptionsChain[]): Promise<void> {
    // Mock implementation
  }

  // Price alert operations
  async createPriceAlert(userId: string, alert: CreatePriceAlertRequest): Promise<PriceAlert> {
    return {
      id: 'mock-alert-' + Date.now(),
      userId,
      tickerId: alert.tickerId,
      targetPrice: alert.targetPrice,
      condition: alert.condition,
      message: alert.message || '',
      isTriggered: false,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    } as any;
  }

  async getPriceAlertsForUser(userId: string): Promise<PriceAlert[]> {
    return [];
  }

  async getPriceAlertsForTicker(tickerId: string): Promise<PriceAlert[]> {
    return [];
  }

  async updatePriceAlert(id: string, updates: Partial<PriceAlert>): Promise<void> {
    // Mock implementation
  }

  async deletePriceAlert(id: string): Promise<void> {
    // Mock implementation
  }

  async triggerAlert(id: string): Promise<void> {
    // Mock implementation
  }

  // Exit recommendation operations
  async createExitRecommendation(recommendation: InsertExitRecommendation): Promise<ExitRecommendation> {
    return {
      id: 'mock-rec-' + Date.now(),
      positionId: recommendation.positionId,
      userId: recommendation.userId,
      recommendationType: recommendation.recommendationType,
      reason: recommendation.reason,
      targetPrice: recommendation.targetPrice,
      confidence: recommendation.confidence,
      isDismissed: false,
      createdAt: new Date(),
      updatedAt: new Date()
    } as any;
  }

  async getExitRecommendationsForUser(userId: string): Promise<ExitRecommendation[]> {
    return [];
  }

  async getExitRecommendationsForPosition(positionId: string): Promise<ExitRecommendation[]> {
    return [];
  }

  async updateExitRecommendation(id: string, updates: Partial<ExitRecommendation>): Promise<void> {
    // Mock implementation
  }

  async dismissRecommendation(id: string): Promise<void> {
    // Mock implementation
  }

  // Combined operations
  async getTickerWithPosition(tickerId: string): Promise<TickerWithPosition | undefined> {
    return undefined;
  }

  async getActiveTickersWithPositionsForUser(userId: string): Promise<TickerWithPosition[]> {
    return [];
  }

  async getActiveTickersWithAlertsAndRecsForUser(userId: string): Promise<TickerWithAlertsAndRecs[]> {
    return [];
  }

  async getPortfolioSummaryForUser(userId: string): Promise<PortfolioSummary> {
    return {
      totalValue: 0,
      totalPnL: 0,
      totalPnLPercent: 0,
      totalPositions: 0,
      activeAlerts: 0,
      pendingRecommendations: 0
    };
  }

  // Initialize test data
  async initializeTestUser(): Promise<void> {
    // Test user is already created in mockDb constructor
    console.log('✅ Test user initialized in fallback storage');
  }

  async initializeMockData(): Promise<void> {
    // Mock data is already initialized in mockDb constructor
    console.log('✅ Mock data initialized in fallback storage');
  }
}
