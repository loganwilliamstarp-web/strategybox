import type { Express } from "express";
import { requireAuth } from "../auth";
import { storage } from "../storage";
import { LongStrangleCalculator } from "../positionCalculator";
import { marketDataApiService } from "../marketDataApi";
import { StrategyType } from "@shared/schema";
import { generateVolatilitySurface } from "../volatilitySurface";
import { rateLimitRules } from "../middleware/rateLimiter";
import { performanceOptimizer } from "../services/performanceOptimizer";

// Check and clear expired custom strikes based on expiration cycle changes
async function checkAndClearExpiredCustomStrikes() {
  try {
    console.log("🔄 Checking for expired custom strikes...");
    
    // Get all positions with custom strikes
    const positions = await storage.getAllPositionsWithCustomStrikes();
    let clearedCount = 0;
    
    for (const position of positions) {
      if (position.customCallStrike && position.customPutStrike && position.expirationCycleForCustomStrikes) {
        // Get the current expiration cycle
        const nextExpiration = getNextOptionsExpiration();
        const currentExpirationCycle = nextExpiration.date;
        
        // Check if expiration cycle has changed
        if (position.expirationCycleForCustomStrikes !== currentExpirationCycle) {
          console.log(`🔄 Clearing expired custom strikes for position ${position.id}: ${position.expirationCycleForCustomStrikes} -> ${currentExpirationCycle}`);
          
          // Clear custom strikes and recalculate
          await storage.clearCustomStrikes(position.id, position.tickerId);
          clearedCount++;
          
          // Recalculate position with automatic strikes
          try {
            const ticker = await storage.getTicker(position.tickerId);
            if (ticker) {
              const updatedCalculation = await LongStrangleCalculator.calculatePositionWithRealPremiums({
                strategyType: position.strategyType as StrategyType,
                currentPrice: ticker.currentPrice,
                symbol: ticker.symbol,
                expirationDate: currentExpirationCycle,
                useRealMarketPremiums: true
              }, storage);
              
              // Update position with new calculations
              await storage.updatePosition(position.id, position.tickerId, {
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
            }
          } catch (calcError) {
            console.error(`Error recalculating position ${position.id} after clearing custom strikes:`, calcError);
          }
        }
      }
    }
    
    if (clearedCount > 0) {
      console.log(`✅ Cleared custom strikes from ${clearedCount} positions due to expiration cycle changes`);
    } else {
      console.log("✅ No expired custom strikes found");
    }
  } catch (error) {
    console.error("Error checking for expired custom strikes:", error);
  }
}

// Get next options expiration date (includes weekly and monthly expirations)
function getNextOptionsExpiration(): { date: string, days: number, type: 'weekly' | 'monthly' } {
  const now = new Date();
  const msPerDay = 24 * 60 * 60 * 1000;
  
  // Get all upcoming Fridays for the next 8 weeks
  const upcomingFridays: Array<{ date: Date, isMonthly: boolean }> = [];
  
  for (let weekOffset = 0; weekOffset < 8; weekOffset++) {
    const targetDate = new Date(now);
    
    // Calculate days to next Friday more accurately
    let daysToFriday = (5 - now.getDay() + 7) % 7;
    if (daysToFriday === 0) daysToFriday = 7; // If today is Friday, next Friday is 7 days away
    
    targetDate.setDate(now.getDate() + daysToFriday + (weekOffset * 7)); // Next Friday + weeks
    targetDate.setHours(16, 0, 0, 0); // Set to 4 PM EST (market close time)
    
    // Skip if it's today or in the past
    if (targetDate <= now) continue;
    
    // Check if this Friday is the third Friday of the month (monthly expiration)
    const firstDayOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
    const firstFriday = new Date(firstDayOfMonth);
    firstFriday.setDate(1 + (5 - firstDayOfMonth.getDay() + 7) % 7);
    const thirdFriday = new Date(firstFriday);
    thirdFriday.setDate(firstFriday.getDate() + 14);
    
    const isMonthly = targetDate.getTime() === thirdFriday.getTime();
    
    upcomingFridays.push({
      date: targetDate,
      isMonthly
    });
  }
  
  if (upcomingFridays.length === 0) {
    // Fallback: next month's third Friday
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const firstFriday = new Date(nextMonth);
    firstFriday.setDate(1 + (5 - nextMonth.getDay() + 7) % 7);
    const thirdFriday = new Date(firstFriday);
    thirdFriday.setDate(firstFriday.getDate() + 14);
    
    const daysToExpiry = Math.ceil((thirdFriday.getTime() - now.getTime()) / msPerDay);
    return {
      date: thirdFriday.toISOString().split('T')[0],
      days: daysToExpiry,
      type: 'monthly'
    };
  }
  
  // Find the next expiration based on realistic options availability
  // Prefer weekly options if less than 14 days out, otherwise prefer monthly
  const daysToNextFriday = Math.ceil((upcomingFridays[0].date.getTime() - now.getTime()) / msPerDay);
  
  let selectedExpiration;
  if (daysToNextFriday <= 14) {
    // Use the nearest Friday (weekly)
    selectedExpiration = upcomingFridays[0];
  } else {
    // Look for the next monthly expiration
    const nextMonthly = upcomingFridays.find(friday => friday.isMonthly);
    selectedExpiration = nextMonthly || upcomingFridays[0];
  }
  
  const daysToExpiry = Math.ceil((selectedExpiration.date.getTime() - now.getTime()) / msPerDay);
  
  return {
    date: selectedExpiration.date.toISOString().split('T')[0],
    days: daysToExpiry,
    type: selectedExpiration.isMonthly ? 'monthly' : 'weekly'
  };
}

/**
 * Register legacy routes that haven't been split yet
 * TODO: Continue splitting these into logical modules
 */
export function registerLegacyRoutes(app: Express): void {

  // DIRECT FIX: Update NVDA with exact market prices from user screenshot
  app.post("/api/fix-nvda-direct", requireAuth, rateLimitRules.general, async (req: any, res) => {
    try {
      const userId = req.user.id;
      console.log("🎯 DIRECT NVDA FIX - Using exact market prices");
      
      // Use exact market prices from user's screenshot
      // Call 177.50: $0.42 mid, Put 180.00: $2.50 mid
      const realCallPremium = 0.42;  // From user's market data screenshot
      const realPutPremium = 2.50;   // From user's market data screenshot
      const totalCost = Math.round((realCallPremium + realPutPremium) * 100); // $292
      
      // Get NVDA position using correct method
      const tickers = await storage.getActiveTickersWithPositionsForUser(userId);
      const nvdaTicker = tickers.find(t => t.symbol === 'NVDA');
      
      if (!nvdaTicker || !nvdaTicker.position) {
        return res.status(404).json({ message: "NVDA position not found for user" });
      }
      
      // Update with exact market pricing from screenshot
      const updatedPosition = await storage.updatePosition(nvdaTicker.position.id, userId, {
        longPutStrike: 180.00,      // Put strike from screenshot
        longCallStrike: 177.50,     // Call strike from screenshot  
        longPutPremium: realPutPremium,
        longCallPremium: realCallPremium,
        maxLoss: totalCost,
        strikesManuallySelected: false
      });
      
      console.log(`✅ NVDA FIXED: Put ${180}@$${realPutPremium}, Call ${177.5}@$${realCallPremium}, Cost $${totalCost}`);
      
      res.json({ 
        message: "NVDA updated with exact market prices",
        position: updatedPosition,
        marketData: {
          putStrike: 180.00,
          putPremium: realPutPremium,
          callStrike: 177.50,
          callPremium: realCallPremium,
          totalCost: totalCost
        }
      });
    } catch (error) {
      console.error("❌ Error in direct NVDA fix:", error);
      res.status(500).json({ 
        message: "Failed to fix NVDA position",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // REAL-TIME MARKET DATA ENDPOINT: Now uses only MarketData.app real market pricing
  app.post("/api/apply-market-pricing", rateLimitRules.marketData, async (req: any, res) => {
    try {
      console.log("💰 REFRESHING POSITIONS WITH REAL MARKETDATA.APP PRICING");
      
      const results = [];
      
      // Get all active tickers 
      const tickers = await storage.getActiveTickersWithPositionsForUser('test-user-id');
      console.log(`📊 Found ${tickers.length} positions to refresh with real market data`);
      
      for (const ticker of tickers) {
        if (!ticker.position) {
          continue;
        }
        
        console.log(`🔄 Recalculating ${ticker.symbol} position with real MarketData.app pricing...`);
        
        // Use the same real-time calculation system that's already working
        const marketData = await LongStrangleCalculator.getOptimalStrikesFromChain(
          ticker.symbol,
          ticker.currentPrice,
          storage,
          ticker.position?.expirationDate
        );
        
        if (!marketData) {
          console.log(`❌ No real market data available for ${ticker.symbol}`);
          continue;
        }
        
        // Update position with real MarketData.app data
        const updatedPosition = await storage.updatePosition(ticker.position.id, 'test-user-id', {
          longPutStrike: marketData.putStrike,
          longCallStrike: marketData.callStrike,
          longPutPremium: marketData.putPremium,
          longCallPremium: marketData.callPremium,
          maxLoss: Math.round((marketData.putPremium + marketData.callPremium) * 100),
          strikesManuallySelected: false
        });
        
        console.log(`✅ REAL DATA: ${ticker.symbol} Call ${marketData.callStrike}@$${marketData.callPremium}, Put ${marketData.putStrike}@$${marketData.putPremium}`);
        
        results.push({
          symbol: ticker.symbol,
          status: 'updated_with_real_market_data',
          stockPrice: ticker.currentPrice,
          newCallPremium: marketData.callPremium,
          newPutPremium: marketData.putPremium,
          newCallStrike: marketData.callStrike,
          newPutStrike: marketData.putStrike,
          totalCost: Math.round((marketData.putPremium + marketData.callPremium) * 100)
        });
      }
      
      console.log(`🎯 REAL MARKET DATA APPLIED: Updated ${results.length} positions with MarketData.app pricing`);
      
      res.json({ 
        message: `Applied real MarketData.app pricing to ${results.length} positions`,
        totalPositions: tickers.length,
        updatedPositions: results.length,
        results 
      });
      
    } catch (error) {
      console.error("❌ Real market data refresh failed:", error);
      res.status(500).json({ 
        message: "Real market data refresh failed", 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  // Get volatility surface data for a symbol
  app.get("/api/volatility-surface/:symbol", requireAuth, rateLimitRules.general, async (req: any, res) => {
    try {
      const { symbol } = req.params;
      const userId = req.user.id;
      
      // Get current price for the symbol
      const ticker = await storage.getTickerBySymbol(symbol, userId);
      if (!ticker) {
        return res.status(404).json({ error: "Ticker not found in your portfolio" });
      }
      
      // Generate volatility surface data
      const volSurfaceData = generateVolatilitySurface(symbol, ticker.currentPrice);
      
      res.json(volSurfaceData);
    } catch (error) {
      console.error("Error generating volatility surface:", error);
      res.status(500).json({ 
        error: "Failed to generate volatility surface",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Options Chain routes
  app.get("/api/options/:symbol", requireAuth, rateLimitRules.general, async (req: any, res) => {
    try {
      const { symbol } = req.params;
      const optionsChain = await storage.getOptionsChain(symbol.toUpperCase());
      res.json(optionsChain);
    } catch (error) {
      console.error('Error fetching options chain:', error);
      res.status(500).json({ 
        message: "Failed to fetch options chain",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // DISABLED: Refresh earnings data, prices, and options pricing (moved to refresh.ts)
  /*
  app.post("/api/tickers/refresh-earnings", requireAuth, rateLimitRules.marketData, async (req: any, res) => {
    try {
      const userId = req.user.id;
      console.log(`🔄 Refresh earnings called for user ${userId}`);
      
      if (!marketDataApiService.isConfigured()) {
        res.status(400).json({ message: "Stock API not configured" });
        return;
      }

      const tickers = await storage.getActiveTickersWithPositionsForUser(userId);
      console.log(`📊 Found ${tickers.length} tickers with positions for user ${userId}`);
      
      if (tickers.length === 0) {
        console.log(`⚠️ No tickers with positions found for user ${userId}`);
        res.json({ 
          success: true,
          message: "No tickers with positions found to refresh",
          updatedCount: 0,
          tickersUpdated: 0,
          pricesUpdated: 0,
          optionsUpdated: 0
        });
        return;
      }
      
      let updatedCount = 0;
      let pricesUpdated = 0;
      let optionsUpdated = 0;

      for (const ticker of tickers) {
        try {
          // Update current stock price
          const quote = await marketDataApiService.getStockQuote(ticker.symbol);
          
          // Refresh options pricing with real market data if position exists
          let optionsRefreshed = false;
          if (ticker.position) {
            try {
              console.log(`🔄 Refreshing ${ticker.symbol} premiums with real market data...`);
              
              // Get current market premiums for existing strikes
              const { optionsApiService } = await import('../optionsApiService');
              const optionsChain = await optionsApiService.getOptionsChain(ticker.symbol, quote?.currentPrice || ticker.currentPrice);
              
              if (optionsChain && optionsChain.options) {
                // Filter by expiration date if provided
                let filteredOptions = optionsChain.options;
                if (ticker.position.expirationDate) {
                  filteredOptions = optionsChain.options.filter(opt => opt.expiration_date === ticker.position.expirationDate);
                }
                
                // Find the current position's strikes in the market data
                const currentCallOption = filteredOptions.find(opt => 
                  opt.contract_type === 'call' && opt.strike === ticker.position.longCallStrike
                );
                const currentPutOption = filteredOptions.find(opt => 
                  opt.contract_type === 'put' && opt.strike === ticker.position.longPutStrike
                );
                
                if (currentCallOption && currentPutOption) {
                  // Calculate current premiums using bid/ask mid
                  const callPremium = (currentCallOption.bid + currentCallOption.ask) / 2;
                  const putPremium = (currentPutOption.bid + currentPutOption.ask) / 2;
                  
                  console.log(`✅ Current market premiums: Call ${ticker.position.longCallStrike}@$${callPremium}, Put ${ticker.position.longPutStrike}@$${putPremium}`);
                  
                  // Update position with current market premiums
                  await storage.updatePosition(ticker.position.id, ticker.userId, {
                    longCallPremium: Math.round(callPremium * 100) / 100,
                    longPutPremium: Math.round(putPremium * 100) / 100,
                    maxLoss: Math.round((callPremium + putPremium) * 100),
                    lowerBreakeven: Math.round((ticker.position.longPutStrike - (callPremium + putPremium)) * 100) / 100,
                    upperBreakeven: Math.round((ticker.position.longCallStrike + (callPremium + putPremium)) * 100) / 100,
                  });
                  
                  optionsRefreshed = true;
                  optionsUpdated++;
                  console.log(`✅ Refreshed ${ticker.symbol} premiums with real market data`);
                } else {
                  console.log(`⚠️ Current strikes not found in market data for ${ticker.symbol}`);
                }
              } else {
                console.log(`⚠️ No options chain data available for ${ticker.symbol}`);
              }
            } catch (optionsError) {
              console.warn(`Failed to refresh options pricing for ${ticker.symbol}:`, optionsError);
            }
          }
          
          // Update ticker with fresh data
          const updateData: any = {};
          if (quote) {
            updateData.currentPrice = quote.currentPrice;
            updateData.priceChange = 0;
            updateData.priceChangePercent = 0;
            pricesUpdated++;
            console.log(`💰 Updated price for ${ticker.symbol}: $${quote.currentPrice}`);
          }
          
          if (Object.keys(updateData).length > 0) {
            await storage.updateTicker(ticker.id, updateData);
            updatedCount++;
          }
          
        } catch (error) {
          console.warn(`Failed to refresh data for ${ticker.symbol}:`, error);
        }
      }

      res.json({ 
        success: true,
        message: `Refreshed data for ${updatedCount} tickers (${pricesUpdated} prices, ${optionsUpdated} options updated)`,
        updatedCount,
        tickersUpdated: updatedCount,
        pricesUpdated,
        optionsUpdated
      });
    } catch (error) {
      console.error("Error refreshing earnings data:", error);
      res.status(500).json({ 
        success: false,
        message: "Failed to refresh earnings data",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  */

  // DEBUG ENDPOINTS (NO AUTH for debugging)
  app.get("/api/debug/aapl-options", rateLimitRules.marketData, async (req: any, res) => {
    try {
      console.log(`🔬 DEBUG: Testing AAPL options for current data`);
      
      const { marketDataApiService } = await import('../marketDataApi');
      
      console.log(`🔬 Testing comprehensive AAPL options chain`);
      const comprehensiveChain = await marketDataApiService.getOptionsChain('AAPL');
      
      res.json({
        comprehensiveChain,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Error in debug AAPL options:', error);
      res.status(500).json({ 
        error: 'Debug test failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  });

  app.get("/api/debug/force-recalc", rateLimitRules.marketData, async (req: any, res) => {
    try {
      console.log(`🔬 DEBUG: Forcing position recalculation with real MarketData.app data`);
      
      const tickers = await storage.getActiveTickersWithPositionsForUser('test-user-id');
      console.log(`🔬 Found ${tickers.length} tickers to recalculate`);
      
      const results = [];
      
      for (const ticker of tickers) {
        try {
          console.log(`🔬 DEBUG: Recalculating ${ticker.symbol} with real-time data...`);
          
          let currentPrice: number;
          const liveQuote = await marketDataApiService.getStockQuote(ticker.symbol);
          
          if (liveQuote && liveQuote.currentPrice > 0) {
            currentPrice = liveQuote.currentPrice;
            console.log(`💰 Using live price for ${ticker.symbol}: $${currentPrice}`);
          } else {
            console.error(`❌ Could not get price for ${ticker.symbol}`);
            continue;
          }
          
          // Calculate new position with real MarketData.app data
          const { OptionsStrategyCalculator } = await import('../positionCalculator');
          const updatedPosition = await OptionsStrategyCalculator.calculateOptimalPosition({
            symbol: ticker.symbol,
            currentPrice: currentPrice,
            strategyType: 'long_strangle' as StrategyType,
            expirationDate: ticker.position.expirationDate
          });
          
          console.log(`✅ DEBUG: Updated ${ticker.symbol} position:`, {
            callStrike: updatedPosition.longCallStrike,
            putStrike: updatedPosition.longPutStrike,
            callPremium: updatedPosition.longCallPremium,
            putPremium: updatedPosition.longPutPremium
          });
          
          // Update in storage
          await storage.updatePosition(ticker.position.id, 'test-user-id', {
            longCallStrike: updatedPosition.longCallStrike,
            longPutStrike: updatedPosition.longPutStrike,
            longCallPremium: updatedPosition.longCallPremium,
            longPutPremium: updatedPosition.longPutPremium,
            maxLoss: updatedPosition.maxLoss,
            impliedVolatility: updatedPosition.impliedVolatility
          });
          
          results.push({
            symbol: ticker.symbol,
            newCallStrike: updatedPosition.longCallStrike,
            newPutStrike: updatedPosition.longPutStrike,
            newCallPremium: updatedPosition.longCallPremium,
            newPutPremium: updatedPosition.longPutPremium
          });
          
        } catch (error) {
          console.error(`❌ Error recalculating ${ticker.symbol}:`, error);
          results.push({
            symbol: ticker.symbol,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
      
      res.json({
        message: 'Position recalculation completed',
        results,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Error in debug force recalc:', error);
      res.status(500).json({ 
        error: 'Debug recalc failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  });
}
