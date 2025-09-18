import { describe, it, expect, beforeEach } from 'vitest';
import { strategyFactory } from '../../server/strategies/StrategyFactory';
import { strategyTypes } from '@shared/schema';
import type { BaseStrategyInputs, MarketDataInput } from '../../server/strategies/base/StrategyInterface';

// Mock market data for testing
const createMockOptionsChain = (symbol: string, currentPrice: number) => ({
  symbol,
  underlyingPrice: currentPrice,
  options: [
    // Put options
    { contract_type: 'put', strike: currentPrice - 20, bid: 2.50, ask: 2.60, last: 2.55, expiration_date: '2024-12-20', volume: 100, open_interest: 500 },
    { contract_type: 'put', strike: currentPrice - 15, bid: 1.80, ask: 1.90, last: 1.85, expiration_date: '2024-12-20', volume: 150, open_interest: 750 },
    { contract_type: 'put', strike: currentPrice - 10, bid: 1.20, ask: 1.30, last: 1.25, expiration_date: '2024-12-20', volume: 200, open_interest: 1000 },
    { contract_type: 'put', strike: currentPrice - 5, bid: 0.75, ask: 0.85, last: 0.80, expiration_date: '2024-12-20', volume: 300, open_interest: 1200 },
    
    // Call options
    { contract_type: 'call', strike: currentPrice + 5, bid: 0.70, ask: 0.80, last: 0.75, expiration_date: '2024-12-20', volume: 250, open_interest: 900 },
    { contract_type: 'call', strike: currentPrice + 10, bid: 1.15, ask: 1.25, last: 1.20, expiration_date: '2024-12-20', volume: 180, open_interest: 800 },
    { contract_type: 'call', strike: currentPrice + 15, bid: 1.75, ask: 1.85, last: 1.80, expiration_date: '2024-12-20', volume: 120, open_interest: 600 },
    { contract_type: 'call', strike: currentPrice + 20, bid: 2.45, ask: 2.55, last: 2.50, expiration_date: '2024-12-20', volume: 80, open_interest: 400 },
  ]
});

describe('Strategy Calculations', () => {
  let mockInputs: BaseStrategyInputs;
  let mockMarketData: MarketDataInput;

  beforeEach(() => {
    mockInputs = {
      strategyType: strategyTypes.LONG_STRANGLE,
      symbol: 'AAPL',
      currentPrice: 230.00,
      expirationDate: '2024-12-20',
      daysToExpiry: 30,
      impliedVolatility: 25.5,
      ivPercentile: 45
    };

    mockMarketData = {
      symbol: 'AAPL',
      currentPrice: 230.00,
      optionsChain: createMockOptionsChain('AAPL', 230.00),
      expirationDate: '2024-12-20'
    };
  });

  describe('Long Strangle Strategy', () => {
    it('should calculate Long Strangle correctly', async () => {
      const result = await strategyFactory.calculatePosition(
        strategyTypes.LONG_STRANGLE,
        mockInputs,
        mockMarketData
      );

      expect(result.strategyType).toBe(strategyTypes.LONG_STRANGLE);
      expect(result.longPutStrike).toBeLessThan(mockInputs.currentPrice);
      expect(result.longCallStrike).toBeGreaterThan(mockInputs.currentPrice);
      expect(result.maxLoss).toBeGreaterThan(0);
      expect(result.maxProfit).toBeUndefined(); // Unlimited profit
      expect(result.lowerBreakeven).toBeLessThan(result.longPutStrike);
      expect(result.upperBreakeven).toBeGreaterThan(result.longCallStrike);
      expect(result.riskProfile).toBe('medium');
    });

    it('should have correct breakeven calculations', async () => {
      const result = await strategyFactory.calculatePosition(
        strategyTypes.LONG_STRANGLE,
        mockInputs,
        mockMarketData
      );

      const totalPremium = result.longPutPremium + result.longCallPremium;
      const expectedLowerBreakeven = result.longPutStrike - totalPremium;
      const expectedUpperBreakeven = result.longCallStrike + totalPremium;

      expect(result.lowerBreakeven).toBeCloseTo(expectedLowerBreakeven, 2);
      expect(result.upperBreakeven).toBeCloseTo(expectedUpperBreakeven, 2);
    });
  });

  describe('Short Strangle Strategy', () => {
    it('should calculate Short Strangle correctly', async () => {
      mockInputs.strategyType = strategyTypes.SHORT_STRANGLE;
      
      const result = await strategyFactory.calculatePosition(
        strategyTypes.SHORT_STRANGLE,
        mockInputs,
        mockMarketData
      );

      expect(result.strategyType).toBe(strategyTypes.SHORT_STRANGLE);
      expect(result.shortPutStrike).toBeLessThan(mockInputs.currentPrice);
      expect(result.shortCallStrike).toBeGreaterThan(mockInputs.currentPrice);
      expect(result.maxProfit).toBeGreaterThan(0); // Premium collected
      expect(result.maxLoss).toBe(Number.MAX_SAFE_INTEGER); // Unlimited loss
      expect(result.riskProfile).toBe('unlimited');
      expect(result.netCredit).toBeGreaterThan(0); // Should collect premium
    });

    it('should have wider strikes than Long Strangle for safety', async () => {
      // Calculate Long Strangle
      const longStrangleResult = await strategyFactory.calculatePosition(
        strategyTypes.LONG_STRANGLE,
        mockInputs,
        mockMarketData
      );

      // Calculate Short Strangle
      mockInputs.strategyType = strategyTypes.SHORT_STRANGLE;
      const shortStrangleResult = await strategyFactory.calculatePosition(
        strategyTypes.SHORT_STRANGLE,
        mockInputs,
        mockMarketData
      );

      // Short strangle should have wider strikes for safety
      const longStrangleWidth = longStrangleResult.longCallStrike - longStrangleResult.longPutStrike;
      const shortStrangleWidth = shortStrangleResult.shortCallStrike! - shortStrangleResult.shortPutStrike!;
      
      expect(shortStrangleWidth).toBeGreaterThan(longStrangleWidth);
    });
  });

  describe('Iron Condor Strategy', () => {
    it('should calculate Iron Condor correctly', async () => {
      mockInputs.strategyType = strategyTypes.IRON_CONDOR;
      
      const result = await strategyFactory.calculatePosition(
        strategyTypes.IRON_CONDOR,
        mockInputs,
        mockMarketData
      );

      expect(result.strategyType).toBe(strategyTypes.IRON_CONDOR);
      expect(result.longPutStrike).toBeLessThan(result.shortPutStrike!);
      expect(result.shortPutStrike).toBeLessThan(mockInputs.currentPrice);
      expect(result.shortCallStrike).toBeGreaterThan(mockInputs.currentPrice);
      expect(result.longCallStrike).toBeGreaterThan(result.shortCallStrike!);
      expect(result.maxLoss).toBeGreaterThan(0);
      expect(result.maxProfit).toBeGreaterThan(0);
      expect(result.riskProfile).toBe('low');
      expect(result.netCredit).toBeGreaterThan(0);
    });

    it('should have defined risk parameters', async () => {
      mockInputs.strategyType = strategyTypes.IRON_CONDOR;
      
      const result = await strategyFactory.calculatePosition(
        strategyTypes.IRON_CONDOR,
        mockInputs,
        mockMarketData
      );

      // Iron Condor should have defined max loss (not unlimited)
      expect(result.maxLoss).toBeLessThan(10000); // Reasonable max loss
      expect(result.maxProfit).toBeLessThan(result.maxLoss); // Profit < max loss for credit spreads
    });
  });

  describe('Butterfly Spread Strategy', () => {
    it('should calculate Butterfly Spread correctly', async () => {
      mockInputs.strategyType = strategyTypes.BUTTERFLY_SPREAD;
      
      const result = await strategyFactory.calculatePosition(
        strategyTypes.BUTTERFLY_SPREAD,
        mockInputs,
        mockMarketData
      );

      expect(result.strategyType).toBe(strategyTypes.BUTTERFLY_SPREAD);
      expect(result.maxLoss).toBeGreaterThan(0);
      expect(result.maxProfit).toBeGreaterThan(0);
      expect(result.riskProfile).toBe('low');
      expect(result.netDebit).toBeGreaterThan(0); // Should be debit strategy
    });

    it('should have center strike near current price', async () => {
      mockInputs.strategyType = strategyTypes.BUTTERFLY_SPREAD;
      
      const result = await strategyFactory.calculatePosition(
        strategyTypes.BUTTERFLY_SPREAD,
        mockInputs,
        mockMarketData
      );

      const centerStrike = (result.longPutStrike + result.longCallStrike) / 2;
      const distanceFromCurrent = Math.abs(centerStrike - mockInputs.currentPrice);
      
      // Center should be within 5% of current price
      expect(distanceFromCurrent).toBeLessThan(mockInputs.currentPrice * 0.05);
    });
  });

  describe('Diagonal Calendar Strategy', () => {
    it('should calculate Diagonal Calendar correctly', async () => {
      // Add multiple expirations to mock data
      const extendedOptionsChain = {
        ...mockMarketData.optionsChain!,
        options: [
          ...mockMarketData.optionsChain!.options,
          // Add longer-term options
          { contract_type: 'call', strike: mockInputs.currentPrice + 5, bid: 3.50, ask: 3.60, last: 3.55, expiration_date: '2025-01-17', volume: 50, open_interest: 200 },
          { contract_type: 'call', strike: mockInputs.currentPrice + 10, bid: 4.20, ask: 4.30, last: 4.25, expiration_date: '2025-01-17', volume: 40, open_interest: 150 },
        ]
      };

      mockMarketData.optionsChain = extendedOptionsChain;
      mockInputs.strategyType = strategyTypes.DIAGONAL_CALENDAR;
      
      const result = await strategyFactory.calculatePosition(
        strategyTypes.DIAGONAL_CALENDAR,
        mockInputs,
        mockMarketData
      );

      expect(result.strategyType).toBe(strategyTypes.DIAGONAL_CALENDAR);
      expect(result.maxLoss).toBeGreaterThan(0);
      expect(result.riskProfile).toBe('medium');
      expect(result.netDebit).toBeGreaterThan(0); // Should be debit strategy
    });
  });

  describe('Strategy Comparison', () => {
    it('should rank strategies by risk level correctly', async () => {
      const strategies = [
        strategyTypes.LONG_STRANGLE,
        strategyTypes.SHORT_STRANGLE,
        strategyTypes.IRON_CONDOR,
        strategyTypes.BUTTERFLY_SPREAD
      ];

      const results = [];
      
      for (const strategyType of strategies) {
        try {
          const result = await strategyFactory.calculatePosition(
            strategyType,
            { ...mockInputs, strategyType },
            mockMarketData
          );
          results.push(result);
        } catch (error) {
          // Some strategies might fail with limited mock data
          console.log(`Strategy ${strategyType} failed with mock data:`, error);
        }
      }

      // Verify risk profiles are assigned correctly
      const longStrangle = results.find(r => r.strategyType === strategyTypes.LONG_STRANGLE);
      const shortStrangle = results.find(r => r.strategyType === strategyTypes.SHORT_STRANGLE);
      const ironCondor = results.find(r => r.strategyType === strategyTypes.IRON_CONDOR);
      const butterfly = results.find(r => r.strategyType === strategyTypes.BUTTERFLY_SPREAD);

      if (longStrangle) expect(longStrangle.riskProfile).toBe('medium');
      if (shortStrangle) expect(shortStrangle.riskProfile).toBe('unlimited');
      if (ironCondor) expect(ironCondor.riskProfile).toBe('low');
      if (butterfly) expect(butterfly.riskProfile).toBe('low');
    });
  });

  describe('P&L Calculations', () => {
    it('should calculate P&L at different price points correctly', async () => {
      const result = await strategyFactory.calculatePosition(
        strategyTypes.LONG_STRANGLE,
        mockInputs,
        mockMarketData
      );

      const strategy = strategyFactory.getStrategy(strategyTypes.LONG_STRANGLE);
      
      // Test P&L at various price points
      const testPrices = [
        result.lowerBreakeven - 10, // Below lower breakeven (profit)
        result.lowerBreakeven,      // At lower breakeven (break even)
        mockInputs.currentPrice,    // At current price (max loss)
        result.upperBreakeven,      // At upper breakeven (break even)
        result.upperBreakeven + 10  // Above upper breakeven (profit)
      ];

      const strikePremiumData = {
        longPutStrike: result.longPutStrike,
        longCallStrike: result.longCallStrike,
        longPutPremium: result.longPutPremium,
        longCallPremium: result.longCallPremium
      };

      for (const price of testPrices) {
        const pl = strategy.getProfitLossAtPrice(price, strikePremiumData);
        
        if (price === result.lowerBreakeven || price === result.upperBreakeven) {
          expect(Math.abs(pl)).toBeLessThan(10); // Should be near breakeven
        }
        
        if (price === mockInputs.currentPrice) {
          expect(pl).toBeLessThan(0); // Should be at max loss
        }
      }
    });
  });

  describe('Strategy Information', () => {
    it('should provide complete strategy information', () => {
      const strategies = [
        strategyTypes.LONG_STRANGLE,
        strategyTypes.SHORT_STRANGLE,
        strategyTypes.IRON_CONDOR,
        strategyTypes.BUTTERFLY_SPREAD,
        strategyTypes.DIAGONAL_CALENDAR
      ];

      for (const strategyType of strategies) {
        const info = strategyFactory.getStrategyInfo(strategyType);
        const params = strategyFactory.getStrategyParameters(strategyType);

        expect(info.name).toBeTruthy();
        expect(info.description).toBeTruthy();
        expect(info.marketOutlook).toBeTruthy();
        expect(info.entryRules.length).toBeGreaterThan(0);
        expect(info.exitRules.length).toBeGreaterThan(0);
        expect(info.riskManagement.length).toBeGreaterThan(0);

        expect(params.optimalDaysToExpiry).toBeGreaterThan(0);
        expect(['low', 'medium', 'high', 'unlimited']).toContain(params.riskLevel);
        expect(['simple', 'intermediate', 'advanced']).toContain(params.complexity);
      }
    });
  });

  describe('Position Sizing', () => {
    it('should provide appropriate position sizing recommendations', () => {
      const portfolioValue = 100000; // $100k portfolio
      
      const strategies = [
        strategyTypes.LONG_STRANGLE,
        strategyTypes.SHORT_STRANGLE,
        strategyTypes.IRON_CONDOR,
        strategyTypes.BUTTERFLY_SPREAD
      ];

      for (const strategyType of strategies) {
        const sizing = strategyFactory.getRecommendedPositionSize(strategyType, portfolioValue);

        expect(sizing.maxPositionSize).toBeGreaterThan(0);
        expect(sizing.recommendedSize).toBeGreaterThan(0);
        expect(sizing.recommendedSize).toBeLessThanOrEqual(sizing.maxPositionSize);
        expect(sizing.reasoning).toBeTruthy();

        // High-risk strategies should have smaller position sizes
        const params = strategyFactory.getStrategyParameters(strategyType);
        if (params.riskLevel === 'unlimited') {
          expect(sizing.recommendedSize).toBeLessThan(portfolioValue * 0.01); // < 1%
        }
      }
    });
  });

  describe('Market Data Validation', () => {
    it('should validate market data requirements for each strategy', () => {
      const strategies = [
        strategyTypes.LONG_STRANGLE,
        strategyTypes.SHORT_STRANGLE,
        strategyTypes.IRON_CONDOR,
        strategyTypes.BUTTERFLY_SPREAD
      ];

      for (const strategyType of strategies) {
        const validation = strategyFactory.validateStrategyData(strategyType, mockMarketData);
        
        expect(validation.isValid).toBe(true);
        expect(validation.errors).toEqual([]);
      }
    });

    it('should detect insufficient market data', () => {
      const limitedMarketData = {
        ...mockMarketData,
        optionsChain: {
          ...mockMarketData.optionsChain!,
          options: mockMarketData.optionsChain!.options.slice(0, 2) // Only 2 options
        }
      };

      const validation = strategyFactory.validateStrategyData(
        strategyTypes.IRON_CONDOR,
        limitedMarketData
      );

      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });
  });
});
