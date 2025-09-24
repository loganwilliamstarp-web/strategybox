import type { Express } from "express";
import { requireSupabaseAuth } from "../supabaseAuth";
import { storage } from "../storage";
import { StrategyType } from "@shared/schema";
import { OptionsStrategyCalculator, LongStrangleCalculator } from "../positionCalculator";
import { marketDataApiService } from "../marketDataApi";
import { rateLimitRules } from "../middleware/rateLimiter";

/**
 * Register position-related routes
 */
export function registerPositionRoutes(app: Express): void {

  // Update position strikes
  app.patch("/api/positions/:id", requireSupabaseAuth, rateLimitRules.positions, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const { 
        longPutStrike, 
        longCallStrike, 
        strategyType, 
        longExpiration,
        expirationDate,
        recalculateWithNewStrategy 
      } = req.body;
      
      console.log("Request body:", req.body);
      
      // Handle strategy type update
      if (strategyType && (longExpiration || expirationDate) && recalculateWithNewStrategy) {
        // First get the position to find the ticker ID
        const position = await storage.getPositionById(id);
        if (!position) {
          res.status(404).json({ message: "Position not found" });
          return;
        }
        
        // Then get the ticker data
        const ticker = await storage.getTicker(position.tickerId);
        if (!ticker) {
          res.status(404).json({ message: "Ticker not found for position" });
          return;
        }
        
        // Recalculate position with new strategy using existing price data
        let stockPrice = ticker.currentPrice || 100;
        
        // Try to get fresh data, but don't fail if API is down
        try {
          const stockData = await marketDataApiService.getStockQuote(ticker.symbol);
          if (stockData?.currentPrice) {
            stockPrice = stockData.currentPrice;
          }
        } catch (error) {
          console.log(`Using existing price for ${ticker.symbol}: ${stockPrice} (API unavailable)`);
        }
        
        // Calculate days to expiry using the corrected logic
        const targetExpirationDate = expirationDate || longExpiration;
        const expiryDate = new Date(targetExpirationDate);
        const now = new Date();
        const msPerDay = 24 * 60 * 60 * 1000;
        const calculatedDaysToExpiry = Math.max(0, Math.round((expiryDate.getTime() - now.getTime()) / msPerDay));

        const newPosition = await OptionsStrategyCalculator.calculatePosition({
          strategyType: strategyType as StrategyType,
          currentPrice: stockPrice,
          expirationDate: targetExpirationDate,
          daysToExpiry: calculatedDaysToExpiry,
          symbol: ticker.symbol,
        });
        
        const updatedPosition = await storage.updatePosition(id, userId, {
          ...newPosition,
          strategyType: strategyType as StrategyType,
          expirationDate: targetExpirationDate,
          strikesManuallySelected: false,
        });
        
        console.log("Updated position with new strategy:", updatedPosition);
        res.json(updatedPosition);
        return;
      }
      
      // Handle regular strike updates
      if (!longPutStrike || !longCallStrike) {
        res.status(400).json({ message: "Both put and call strikes are required" });
        return;
      }
      
      const putStrike = parseFloat(longPutStrike);
      const callStrike = parseFloat(longCallStrike);
      
      console.log("Received strikes:", { putStrike, callStrike });
      
      if (isNaN(putStrike) || isNaN(callStrike)) {
        res.status(400).json({ message: "Strike prices must be valid numbers" });
        return;
      }
      
      if (putStrike >= callStrike) {
        res.status(400).json({ message: "Put strike must be lower than call strike" });
        return;
      }
      
      const updatedPosition = await storage.updatePosition(id, userId, {
        longPutStrike: putStrike,
        longCallStrike: callStrike,
        strikesManuallySelected: true,
      });
      
      console.log("Updated position:", updatedPosition);
      
      if (!updatedPosition) {
        res.status(404).json({ message: "Position not found" });
        return;
      }
      
      res.json(updatedPosition);
    } catch (error) {
      console.error("Error updating position:", error);
      res.status(500).json({ 
        message: "Failed to update position",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Set custom strikes for a position
  app.post("/api/positions/:id/custom-strikes", requireSupabaseAuth, rateLimitRules.positions, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const { customCallStrike, customPutStrike, expirationDate } = req.body;
      
      // Validate required fields
      if (!customCallStrike || !customPutStrike || !expirationDate) {
        res.status(400).json({ message: "Custom call strike, put strike, and expiration date are required" });
        return;
      }
      
      const callStrike = parseFloat(customCallStrike);
      const putStrike = parseFloat(customPutStrike);
      
      if (isNaN(putStrike) || isNaN(callStrike)) {
        res.status(400).json({ message: "Strike prices must be valid numbers" });
        return;
      }
      
      if (putStrike >= callStrike) {
        res.status(400).json({ message: "Put strike must be lower than call strike" });
        return;
      }
      
      console.log(`Setting custom strikes for position ${id}: Put ${putStrike}, Call ${callStrike}, Expiration ${expirationDate}`);
      
      const updatedPosition = await storage.setCustomStrikes(id, userId, callStrike, putStrike, expirationDate);
      
      if (!updatedPosition) {
        res.status(404).json({ message: "Position not found or unauthorized" });
        return;
      }
      
      // Recalculate position with custom strikes using real market data
      try {
        const position = await storage.getPositionById(id);
        const ticker = await storage.getTicker(position!.tickerId);
        
        if (ticker) {
          console.log(`Recalculating position for ${ticker.symbol} with custom strikes...`);
          
          const updatedCalculation = await LongStrangleCalculator.calculatePositionWithRealPremiums({
            strategyType: position!.strategyType as StrategyType,
            currentPrice: ticker.currentPrice,
            symbol: ticker.symbol,
            expirationDate: expirationDate,
            useRealMarketPremiums: true
          }, storage, updatedPosition);
          
          // Update position with new calculations
          const finalPosition = await storage.updatePosition(id, userId, {
            longPutStrike: updatedCalculation.longPutStrike,
            longCallStrike: updatedCalculation.longCallStrike,
            longPutPremium: updatedCalculation.longPutPremium,
            longCallPremium: updatedCalculation.longCallPremium,
            lowerBreakeven: updatedCalculation.lowerBreakeven,
            upperBreakeven: updatedCalculation.upperBreakeven,
            maxLoss: updatedCalculation.maxLoss,
            atmValue: updatedCalculation.atmValue,
            impliedVolatility: updatedCalculation.impliedVolatility,
            ivPercentile: updatedCalculation.ivPercentile,
            daysToExpiry: updatedCalculation.daysToExpiry,
            expirationDate: updatedCalculation.expirationDate,
          });
          
          res.json(finalPosition);
        } else {
          res.json(updatedPosition);
        }
      } catch (calcError) {
        console.error("Error recalculating with custom strikes:", calcError);
        res.json(updatedPosition);
      }
    } catch (error) {
      console.error("Error setting custom strikes:", error);
      res.status(500).json({ 
        message: "Failed to set custom strikes",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Clear custom strikes for a position (revert to automatic calculation)
  app.delete("/api/positions/:id/custom-strikes", requireSupabaseAuth, rateLimitRules.positions, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      
      console.log(`Clearing custom strikes for position ${id}`);
      
      const updatedPosition = await storage.clearCustomStrikes(id, userId);
      
      if (!updatedPosition) {
        res.status(404).json({ message: "Position not found or unauthorized" });
        return;
      }
      
      // Recalculate position with automatic strike selection
      try {
        const position = await storage.getPositionById(id);
        const ticker = await storage.getTicker(position!.tickerId);
        
        if (ticker) {
          console.log(`Recalculating position for ${ticker.symbol} with automatic strikes...`);
          
          const updatedCalculation = await LongStrangleCalculator.calculatePositionWithRealPremiums({
            strategyType: position!.strategyType as StrategyType,
            currentPrice: ticker.currentPrice,
            symbol: ticker.symbol,
            expirationDate: position!.expirationDate,
            useRealMarketPremiums: true
          }, storage);
          
          // Update position with new calculations
          const finalPosition = await storage.updatePosition(id, userId, {
            longPutStrike: updatedCalculation.longPutStrike,
            longCallStrike: updatedCalculation.longCallStrike,
            longPutPremium: updatedCalculation.longPutPremium,
            longCallPremium: updatedCalculation.longCallPremium,
            lowerBreakeven: updatedCalculation.lowerBreakeven,
            upperBreakeven: updatedCalculation.upperBreakeven,
            maxLoss: updatedCalculation.maxLoss,
            atmValue: updatedCalculation.atmValue,
            impliedVolatility: updatedCalculation.impliedVolatility,
            ivPercentile: updatedCalculation.ivPercentile,
            daysToExpiry: updatedCalculation.daysToExpiry,
            expirationDate: updatedCalculation.expirationDate,
          });
          
          res.json(finalPosition);
        } else {
          res.json(updatedPosition);
        }
      } catch (calcError) {
        console.error("Error recalculating with automatic strikes:", calcError);
        res.json(updatedPosition);
      }
    } catch (error) {
      console.error("Error clearing custom strikes:", error);
      res.status(500).json({ 
        message: "Failed to clear custom strikes",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Calculate position with real market premiums
  app.post("/api/position/calculate-with-real-premiums", requireSupabaseAuth, rateLimitRules.marketData, async (req: any, res) => {
    try {
      const { symbol, currentPrice, putStrike, callStrike } = req.body;
      
      if (!symbol || !currentPrice || !putStrike || !callStrike) {
        return res.status(400).json({ 
          message: "Missing required fields: symbol, currentPrice, putStrike, callStrike" 
        });
      }
      
      // Calculate position using real market premiums
      const { strategyType = 'long_strangle' } = req.body;
      const result = await LongStrangleCalculator.calculatePositionWithRealPremiums({
        strategyType: strategyType as StrategyType,
        symbol: symbol.toUpperCase(),
        currentPrice,
        putStrike,
        callStrike,
        useRealMarketPremiums: true
      }, storage);
      
      res.json(result);
    } catch (error) {
      console.error("Error calculating position with real premiums:", error);
      res.status(500).json({ 
        message: "Failed to calculate position with real premiums",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}
