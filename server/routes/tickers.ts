import type { Express } from "express";
import { requireAuth } from "../auth";
import { requireTokenAuth } from "../tokenAuth";
import { storage } from "../storage";
import { addTickerSchema, StrategyType } from "@shared/schema";
import { z } from "zod";
import { marketDataApiService } from "../marketDataApi";
import { OptionsStrategyCalculator } from "../positionCalculator";
import { rateLimitRules } from "../middleware/rateLimiter";

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
    // Don't set hours - keep it at midnight to ensure we stay on the correct Friday date
    targetDate.setHours(0, 0, 0, 0); // Set to midnight to avoid timezone issues
    
    // Skip if it's today or in the past (compare dates only, not times)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (targetDate <= today) continue;
    
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

// Stock quote service using MarketData.app for real-time pricing
async function getStockQuote(symbol: string): Promise<{ currentPrice: number; change: number; changePercent: number } | null> {
  try {
    const marketDataQuote = await marketDataApiService.getStockQuote(symbol);
    if (marketDataQuote) {
      console.log(`✅ MARKETDATA.APP: Retrieved real-time quote for ${symbol}: $${marketDataQuote.currentPrice}`);
      return {
        currentPrice: marketDataQuote.currentPrice,
        change: 0, // MarketData doesn't provide change directly, but price is current
        changePercent: 0
      };
    }
  } catch (error) {
    console.error(`❌ MarketData.app failed for ${symbol}:`, error);
    return null;
  }
  
  return null;
}

/**
 * Register ticker-related routes
 */
export function registerTickerRoutes(app: Express): void {
  
  // Get active tickers with their positions
  app.get("/api/tickers", requireAuth, rateLimitRules.general, async (req: any, res) => {
    console.log(`🚨 /api/tickers CALLED! User ID: ${req.user?.id}, Auth status: ${!!req.user}`);
    
    try {
      const userId = req.user.id;
      const tickers = await storage.getActiveTickersWithPositionsForUser(userId);
      
      // Check for query parameters to force updates
      const shouldRecalculate = req.query.recalculate === 'true';
      const forceIvUpdate = req.query.updateiv === 'true';
      
      console.log(`🔍 /api/tickers DEBUG: userId=${userId}, marketDataApiService.isConfigured()=${marketDataApiService.isConfigured()}, tickers.length=${tickers.length}, shouldRecalculate=${shouldRecalculate}, forceIvUpdate=${forceIvUpdate}`);
      
      // Force IV update if requested
      if (forceIvUpdate && marketDataApiService.isConfigured() && tickers.length > 0) {
        console.log("🔄 FORCE UPDATING IV DATA FROM MARKETDATA.APP...");
        
        for (const ticker of tickers) {
          if (!ticker.position) continue;
          
          try {
            console.log(`🔄 Updating IV for ${ticker.symbol}...`);
            
            // Import the calculator
            const { LongStrangleCalculator } = await import('../positionCalculator');
            
            // Get fresh market data with new IV extraction
            const marketData = await LongStrangleCalculator.getOptimalStrikesFromChain(
              ticker.symbol,
              ticker.currentPrice,
              storage,
              ticker.position?.expirationDate
            );
            
            if (marketData) {
              console.log(`✅ NEW IV DATA for ${ticker.symbol}: ${marketData.impliedVolatility.toFixed(1)}% (${marketData.ivPercentile}th percentile)`);
              
              // Update position with new IV data (preserve ATM baseline)
              await storage.updatePosition(ticker.position.id, userId, {
                impliedVolatility: marketData.impliedVolatility,
                ivPercentile: marketData.ivPercentile,
                // ATM value preserved - only updated on Fridays via WebSocket
                longPutStrike: marketData.putStrike,
                longCallStrike: marketData.callStrike,
                longPutPremium: marketData.putPremium,
                longCallPremium: marketData.callPremium,
                maxLoss: Math.round((marketData.putPremium + marketData.callPremium) * 100),
              });
              
              console.log(`✅ Updated ${ticker.symbol} IV from old value to ${marketData.impliedVolatility.toFixed(1)}%`);
            }
          } catch (error) {
            console.error(`❌ Error updating IV for ${ticker.symbol}:`, error);
          }
        }
        
        // Refetch updated tickers
        const updatedTickers = await storage.getActiveTickersWithPositionsForUser(userId);
        res.json(updatedTickers);
        return;
      }
      
      if (marketDataApiService.isConfigured() && tickers.length > 0 && shouldRecalculate) {
        console.log("🔄 Periodically updating positions with real market data...");
        
        for (const ticker of tickers) {
          try {
            console.log(`🎯 Recalculating ${ticker.symbol} with REAL-TIME data...`);
            
            // Try to get real-time price from API
            let realTimePrice = ticker.currentPrice;
            if (!realTimePrice) {
              try {
                const stockQuote = await marketDataApiService.getStockQuote(ticker.symbol);
                realTimePrice = stockQuote?.currentPrice;
                console.log(`📡 Using live API price for ${ticker.symbol}: $${realTimePrice}`);
              } catch (error) {
                console.log(`⚠️ Skipping ${ticker.symbol}: no real-time price available - ${error instanceof Error ? error.message : 'Unknown error'}`);
                continue;
              }
            } else {
              console.log(`💰 Using current price: ${ticker.symbol} = $${realTimePrice}`);
            }
            
            // Recalculate position with real-time market price
            if (ticker.position && realTimePrice) {
              try {
                console.log(`🔄 Recalculating ${ticker.symbol} position with price ${realTimePrice}`);
                
                // Use current next Friday for automatic updates
                const nextExpiration = getNextOptionsExpiration();
                const targetExpirationDate = nextExpiration.date;
                const targetDaysToExpiry = Math.ceil((new Date(targetExpirationDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                
                console.log(`🔄 Using expiration: ${targetExpirationDate} (${targetDaysToExpiry}d)`);
                
                const earningsAwareIV = 25; // Default fallback - will be overridden by real market data
                
                const updatedPosition = await OptionsStrategyCalculator.calculatePosition({
                  strategyType: ticker.position.strategyType as StrategyType,
                  currentPrice: realTimePrice,
                  symbol: ticker.symbol,
                  daysToExpiry: targetDaysToExpiry,
                  expirationDate: targetExpirationDate,
                  impliedVolatility: earningsAwareIV
                });
                
                await storage.updatePosition(ticker.position.id, ticker.userId, updatedPosition);
                console.log(`✅ Updated ${ticker.symbol} with current market data`);
              } catch (error) {
                console.log(`❌ Failed to recalculate ${ticker.symbol}:`, error instanceof Error ? error.message : String(error));
              }
            }
          } catch (error) {
            console.warn(`Failed to update ${ticker.symbol}:`, error instanceof Error ? error.message : String(error));
          }
        }
        
        // Return updated data with no-cache headers to ensure frontend updates
        const updatedTickers = await storage.getActiveTickersWithPositionsForUser(userId);
        res.set({
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
          'ETag': `"${Date.now()}-${Math.random()}"` // Force cache invalidation
        });
        res.json(updatedTickers);
        return;
      }
      
      // Always add no-cache headers to ensure frontend updates
      res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'ETag': `"${Date.now()}-${Math.random()}"` // Force cache invalidation
      });
      res.json(tickers);
    } catch (error) {
      console.error('Error in /api/tickers:', error);
      res.status(500).json({ 
        message: "Failed to fetch tickers",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Add a new ticker (no rate limiting for normal user operations)
  app.post("/api/tickers", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { symbol } = addTickerSchema.parse(req.body);
      
      // Get strategy parameters from request body
      const { strategyType = 'long_strangle', expirationDate = null } = req.body;
      
      // Check if ticker already exists for this user
      const existingTicker = await storage.getTickerBySymbol(symbol, userId);
      if (existingTicker) {
        // If exists but inactive, activate it
        if (!existingTicker.isActive) {
          await storage.setTickerActive(symbol, true, userId);
          const updatedTicker = await storage.getTickerBySymbol(symbol, userId);
          const position = await storage.getPositionByTickerId(updatedTicker!.id);
          res.json({ ...updatedTicker, position });
        } else {
          res.status(400).json({ message: "Ticker is already active" });
        }
        return;
      }

      // Try to get live data if API is configured
      if (marketDataApiService.isConfigured()) {
        try {
          // Use MarketData.app for stock quotes only
          const quote = await getStockQuote(symbol);
          
          if (!quote) {
            throw new Error(`Failed to get stock quote for ${symbol}`);
          }

          const tickerData = {
            userId: userId,
            symbol: symbol.toUpperCase(),
            companyName: symbol.toUpperCase(),
            currentPrice: quote.currentPrice,
            priceChange: quote.change,
            priceChangePercent: quote.changePercent,
            earningsDate: null,
            isActive: true,
          };

          // Use unified options strategy calculator with Market Data API for real premiums
          const { OptionsStrategyCalculator } = await import('../positionCalculator');
          
          // Calculate position using the unified calculator with real market data
          const nextExpiration = getNextOptionsExpiration();
          
          const positionData = await OptionsStrategyCalculator.calculatePosition({
            strategyType: strategyType as StrategyType,
            currentPrice: quote.currentPrice,
            symbol: symbol,
            daysToExpiry: nextExpiration.days,
            expirationDate: expirationDate || nextExpiration.date
          });

          // Create the ticker
          const ticker = await storage.createTicker(tickerData);
          
          // Create the options position
          const position = await storage.createPosition({
            ...positionData,
            strategyType: strategyType as StrategyType,
            longExpiration: expirationDate || positionData.expirationDate,
            tickerId: ticker.id,
          });

          res.json({ ...ticker, position });
          return;
        } catch (apiError) {
          console.error(`Live API failed for ${symbol}:`, apiError);
          res.status(503).json({ 
            message: "Market data temporarily unavailable. Please check your API configuration and try again.",
            error: "live_data_required" 
          });
          return;
        }
      }

      // No fallback - require live data only
      res.status(503).json({ 
        message: "Market data API not configured. Live data is required for all operations.",
        error: "api_not_configured" 
      });
    } catch (error) {
      console.error('Error in POST /api/tickers:', error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ 
          message: "Invalid ticker symbol",
          details: error.errors
        });
      } else {
        res.status(500).json({ 
          message: "Failed to add ticker",
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  });

  // Remove a ticker completely for a user (no rate limiting)
  app.delete("/api/tickers/:symbol", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const symbol = req.params.symbol.toUpperCase();
      console.log(`Attempting to remove ticker ${symbol} for user ${userId}`);
      
      const ticker = await storage.getTickerBySymbol(symbol, userId);
      
      if (!ticker) {
        console.log(`Ticker ${symbol} not found for user ${userId}`);
        res.status(404).json({ message: "Ticker not found" });
        return;
      }

      console.log(`Found ticker ${symbol}, proceeding with removal`);
      await storage.removeTickerForUser(symbol, userId);
      console.log(`Successfully removed ticker ${symbol}`);
      
      res.status(200).json({ message: "Ticker removed successfully", symbol });
    } catch (error) {
      console.error(`Error removing ticker ${req.params.symbol}:`, error);
      res.status(500).json({ 
        message: "Failed to remove ticker", 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  // Force reset all positions to long_strangle (SIMPLE VERSION)
  app.post("/api/tickers/force-long-strangle", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const tickers = await storage.getActiveTickersWithPositionsForUser(userId);
      
      let updateCount = 0;
      for (const ticker of tickers) {
        if (ticker.position) {
          console.log(`🔄 FORCE updating ${ticker.symbol} from ${ticker.position.strategyType} to long_strangle`);
          
          // Calculate proper long strangle strikes based on current price
          const currentPrice = ticker.currentPrice;
          const putStrike = Math.round(currentPrice * 0.95); // 5% OTM put
          const callStrike = Math.round(currentPrice * 1.05); // 5% OTM call
          const putPremium = 3.50;
          const callPremium = 4.25;
          const totalPremium = putPremium + callPremium;
          
          console.log(`🔄 Setting proper long strangle strikes for ${ticker.symbol}: Put ${putStrike}, Call ${callStrike}`);
          
          await storage.updatePosition(ticker.position.id, userId, {
            strategyType: 'long_strangle' as StrategyType,
            // Proper long strangle strikes
            longPutStrike: putStrike,
            longCallStrike: callStrike,
            longPutPremium: putPremium,
            longCallPremium: callPremium,
            // Clear short strikes (long strangle has no short positions)
            shortPutStrike: null,
            shortCallStrike: null,
            shortPutPremium: null,
            shortCallPremium: null,
            // Proper long strangle calculations
            lowerBreakeven: putStrike - totalPremium,
            upperBreakeven: callStrike + totalPremium,
            maxLoss: totalPremium, // Total premium paid
            maxProfit: null, // Unlimited for long strangle
            atmValue: currentPrice,
            strikesManuallySelected: false,
          });
          
          updateCount++;
          console.log(`✅ FORCE updated ${ticker.symbol} to long_strangle`);
        }
      }
      
      // Get the updated data to return
      const updatedTickers = await storage.getActiveTickersWithPositionsForUser(userId);
      
      res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Force-Refresh': 'true'
      });
      
      res.json({ 
        message: `Force updated ${updateCount} positions to long_strangle`,
        updated: updateCount,
        timestamp: new Date().toISOString(),
        tickers: updatedTickers // Return the actual updated data
      });
    } catch (error) {
      console.error('Error forcing long_strangle:', error);
      res.status(500).json({ 
        message: "Failed to update positions",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Refresh stock data for existing tickers
  app.post("/api/tickers/refresh", rateLimitRules.marketData, async (req, res) => {
    try {
      if (!marketDataApiService.isConfigured()) {
        res.status(400).json({ message: "Stock API not configured" });
        return;
      }

      const tickers = await storage.getActiveTickersWithPositionsForUser("test-user-id");
      const symbols = tickers.map((t: any) => t.symbol);
      
      // Get quotes individually since marketdata.app doesn't have bulk quotes
      const quotes = [];
      for (const symbol of symbols) {
        try {
          const quote = await marketDataApiService.getStockQuote(symbol);
          if (quote) {
            quotes.push({
              symbol: symbol,
              currentPrice: quote.currentPrice,
              change: 0,
              changePercent: 0
            });
          }
        } catch (error) {
          console.log(`Failed to get quote for ${symbol}:`, error);
        }
      }
      
      const updates = [];
      for (const quote of quotes) {
        const ticker = await storage.getTickerBySymbol(quote.symbol, "test-user-id");
        if (ticker) {
          // Update ticker with live price data
          await storage.updateTicker(ticker.id, {
            currentPrice: quote.currentPrice,
            priceChange: quote.change,
            priceChangePercent: quote.changePercent,
          });
          
          // Recalculate position data based on new live price
          const position = await storage.getPositionByTickerId(ticker.id);
          if (position) {
            try {
              // Use the current next expiration date
              const nextExpiration = getNextOptionsExpiration();
              
              const updatedPosition = await OptionsStrategyCalculator.calculatePosition({
                strategyType: ticker.position.strategyType as StrategyType,
                currentPrice: quote.currentPrice,
                symbol: ticker.symbol,
                daysToExpiry: nextExpiration.days,
                expirationDate: nextExpiration.date
              });
              
              await storage.updatePosition(position.id, "test-user-id", updatedPosition);
            } catch (error) {
              console.log(`❌ Failed to update position for ${ticker.symbol}:`, error instanceof Error ? error.message : String(error));
              continue;
            }
          }
          
          updates.push(quote.symbol);
        }
      }
      
      res.json({ 
        message: `Updated ${updates.length} tickers`, 
        updated: updates,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error refreshing stock data:", error);
      res.status(500).json({ 
        message: "Failed to refresh stock data",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}
