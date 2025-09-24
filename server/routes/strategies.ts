import type { Express } from "express";
import { requireSupabaseAuth } from "../supabaseAuth";
import { strategyFactory } from "../strategies/StrategyFactory";
import { StrategyCalculatorAdapter } from "../strategies/StrategyCalculatorAdapter";
import { rateLimitRules } from "../middleware/rateLimiter";
import { logger } from "../middleware/logger";
import { StrategyType, strategyTypes } from "@shared/schema";

/**
 * Register strategy-related routes
 */
export function registerStrategyRoutes(app: Express): void {

  // Get all available strategies with metadata
  app.get("/api/strategies", requireSupabaseAuth, rateLimitRules.general, async (req: any, res) => {
    try {
      const strategies = strategyFactory.getAvailableStrategies();
      
      res.json({
        strategies,
        totalCount: strategies.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error fetching strategies', { error: error instanceof Error ? error.message : 'Unknown error' });
      res.status(500).json({
        error: "Failed to fetch available strategies",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get specific strategy information and trading rules
  app.get("/api/strategies/:strategyType", requireSupabaseAuth, rateLimitRules.general, async (req: any, res) => {
    try {
      const strategyType = req.params.strategyType as StrategyType;
      
      // Validate strategy type
      if (!Object.values(strategyTypes).includes(strategyType)) {
        return res.status(400).json({
          error: "Invalid strategy type",
          availableStrategies: Object.values(strategyTypes)
        });
      }

      const strategyInfo = strategyFactory.getStrategyInfo(strategyType);
      const parameters = strategyFactory.getStrategyParameters(strategyType);
      
      res.json({
        strategyType,
        ...strategyInfo,
        parameters,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error fetching strategy info', { 
        strategyType: req.params.strategyType,
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      
      res.status(500).json({
        error: "Failed to fetch strategy information",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Calculate strategy position with real market data
  app.post("/api/strategies/:strategyType/calculate", requireSupabaseAuth, rateLimitRules.marketData, async (req: any, res) => {
    const startTime = Date.now();
    
    try {
      const strategyType = req.params.strategyType as StrategyType;
      const { symbol, currentPrice, expirationDate, daysToExpiry } = req.body;
      
      // Validate required inputs
      if (!symbol || !currentPrice) {
        return res.status(400).json({
          error: "Missing required fields",
          required: ["symbol", "currentPrice"],
          provided: Object.keys(req.body)
        });
      }

      // Validate strategy type
      if (!Object.values(strategyTypes).includes(strategyType)) {
        return res.status(400).json({
          error: "Invalid strategy type",
          availableStrategies: Object.values(strategyTypes)
        });
      }

      // Prepare calculation inputs
      const calculationInputs = {
        strategyType,
        symbol: symbol.toUpperCase(),
        currentPrice: parseFloat(currentPrice),
        expirationDate: expirationDate || StrategyCalculatorAdapter['getNextOptionsExpiration'](),
        daysToExpiry: daysToExpiry || StrategyCalculatorAdapter['calculateDaysToExpiry'](expirationDate),
        impliedVolatility: req.body.impliedVolatility,
        ivPercentile: req.body.ivPercentile
      };

      console.log(`🎯 Calculating ${strategyType} for ${symbol} via API`);
      
      // Calculate position using new strategy system
      const result = await StrategyCalculatorAdapter.calculatePosition(calculationInputs);
      
      const responseTime = Date.now() - startTime;
      
      logger.info('Strategy calculation completed', {
        strategyType,
        symbol,
        responseTime,
        userId: req.user.id
      });

      res.json({
        ...result,
        calculationTime: `${responseTime}ms`,
        timestamp: new Date().toISOString(),
        calculatedBy: 'new_strategy_system'
      });
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      logger.error('Strategy calculation failed', {
        strategyType: req.params.strategyType,
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime,
        userId: req.user.id
      });
      
      res.status(500).json({
        error: "Failed to calculate strategy",
        strategyType: req.params.strategyType,
        details: error instanceof Error ? error.message : 'Unknown error',
        calculationTime: `${responseTime}ms`,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Get P&L curve data for charting
  app.post("/api/strategies/:strategyType/pl-curve", requireSupabaseAuth, rateLimitRules.general, async (req: any, res) => {
    try {
      const strategyType = req.params.strategyType as StrategyType;
      const { result, currentPrice, priceRange } = req.body;
      
      if (!result || !currentPrice) {
        return res.status(400).json({
          error: "Missing required fields",
          required: ["result", "currentPrice"]
        });
      }

      // Calculate P&L curve
      const plCurve = StrategyCalculatorAdapter.calculatePLCurve(
        strategyType,
        result,
        currentPrice
      );
      
      res.json({
        strategyType,
        plCurve,
        dataPoints: plCurve.length,
        priceRange: {
          min: Math.min(...plCurve.map(p => p.price)),
          max: Math.max(...plCurve.map(p => p.price))
        },
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('P&L curve calculation failed', {
        strategyType: req.params.strategyType,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      res.status(500).json({
        error: "Failed to calculate P&L curve",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get recommended position sizing
  app.post("/api/strategies/:strategyType/position-sizing", requireSupabaseAuth, rateLimitRules.general, async (req: any, res) => {
    try {
      const strategyType = req.params.strategyType as StrategyType;
      const { portfolioValue } = req.body;
      
      if (!portfolioValue || portfolioValue <= 0) {
        return res.status(400).json({
          error: "Valid portfolio value required",
          provided: portfolioValue
        });
      }

      const sizing = StrategyCalculatorAdapter.getRecommendedPositionSize(
        strategyType,
        parseFloat(portfolioValue)
      );
      
      res.json({
        strategyType,
        portfolioValue: parseFloat(portfolioValue),
        ...sizing,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Position sizing calculation failed', {
        strategyType: req.params.strategyType,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      res.status(500).json({
        error: "Failed to calculate position sizing",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Validate strategy can be calculated with available market data
  app.post("/api/strategies/:strategyType/validate", requireSupabaseAuth, rateLimitRules.general, async (req: any, res) => {
    try {
      const strategyType = req.params.strategyType as StrategyType;
      const { symbol, currentPrice, expirationDate } = req.body;
      
      if (!symbol || !currentPrice) {
        return res.status(400).json({
          error: "Missing required fields",
          required: ["symbol", "currentPrice"]
        });
      }

      // Get market data for validation
      const { optionsApiService } = await import('../optionsApiService');
      const optionsChain = await optionsApiService.getOptionsChain(symbol.toUpperCase(), currentPrice);
      
      const marketData = {
        symbol: symbol.toUpperCase(),
        currentPrice: parseFloat(currentPrice),
        optionsChain,
        expirationDate
      };

      // Validate strategy can be calculated
      const validation = StrategyCalculatorAdapter.validateStrategyData(strategyType, marketData);
      
      res.json({
        strategyType,
        symbol: symbol.toUpperCase(),
        ...validation,
        marketDataAvailable: !!optionsChain,
        optionsCount: optionsChain?.options?.length || 0,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Strategy validation failed', {
        strategyType: req.params.strategyType,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      res.status(500).json({
        error: "Failed to validate strategy",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Compare multiple strategies for the same underlying
  app.post("/api/strategies/compare", requireSupabaseAuth, rateLimitRules.marketData, async (req: any, res) => {
    try {
      const { symbol, currentPrice, expirationDate, strategies } = req.body;
      
      if (!symbol || !currentPrice || !strategies || !Array.isArray(strategies)) {
        return res.status(400).json({
          error: "Missing required fields",
          required: ["symbol", "currentPrice", "strategies (array)"]
        });
      }

      const results = [];
      
      for (const strategyType of strategies) {
        try {
          const calculationInputs = {
            strategyType,
            symbol: symbol.toUpperCase(),
            currentPrice: parseFloat(currentPrice),
            expirationDate: expirationDate || StrategyCalculatorAdapter['getNextOptionsExpiration'](),
            daysToExpiry: StrategyCalculatorAdapter['calculateDaysToExpiry'](expirationDate)
          };

          const result = await StrategyCalculatorAdapter.calculatePosition(calculationInputs);
          
          results.push({
            strategyType,
            success: true,
            result,
            riskReward: {
              maxLoss: result.maxLoss,
              maxProfit: result.maxProfit || 'Unlimited',
              breakevens: [result.lowerBreakeven, result.upperBreakeven],
              riskProfile: strategyFactory.getStrategyParameters(strategyType).riskLevel
            }
          });
          
        } catch (error) {
          results.push({
            strategyType,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      res.json({
        symbol: symbol.toUpperCase(),
        currentPrice: parseFloat(currentPrice),
        expirationDate,
        comparison: results,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Strategy comparison failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      res.status(500).json({
        error: "Failed to compare strategies",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}
