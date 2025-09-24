// Debug endpoint to see raw ticker data
import type { Express } from "express";
import { requireSupabaseAuth } from "../supabaseAuth";
import { storage } from "../storage";
import { marketDataApiService } from "../marketDataApi";

// Fetch historical closing price for a given date using Finnhub
async function getHistoricalClosingPrice(symbol: string, date: string): Promise<number | null> {
  try {
    const { supabaseSecrets } = await import('../config/supabaseSecrets');
    const finnhubKey = await supabaseSecrets.getSecret('FINNHUB_API_KEY');
    
    if (!finnhubKey) {
      console.error('❌ Finnhub API key not found');
      return null;
    }

    // Convert date to Unix timestamp (start and end of day)
    const targetDate = new Date(date);
    const fromTimestamp = Math.floor(targetDate.getTime() / 1000);
    const toTimestamp = fromTimestamp + 86400; // Add 24 hours

    const url = `https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=D&from=${fromTimestamp}&to=${toTimestamp}&token=${finnhubKey}`;
    
    console.log(`📡 Fetching historical data for ${symbol} on ${date}...`);
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.s === 'ok' && data.c && data.c.length > 0) {
      const closingPrice = data.c[0]; // First (and should be only) closing price
      console.log(`📊 Historical price for ${symbol} on ${date}: $${closingPrice.toFixed(2)}`);
      return closingPrice;
    } else {
      console.warn(`⚠️ No historical data found for ${symbol} on ${date}:`, data);
      return null;
    }
  } catch (error) {
    console.error(`❌ Error fetching historical price for ${symbol}:`, error);
    return null;
  }
}

export function setupDebugRoutes(app: Express) {
  // Debug endpoint to see raw data (no auth for testing)
  app.get("/api/debug/tickers", async (req: any, res) => {
    try {
      // Use known user ID for testing
      const userId = '5630d6b1-42b4-43bd-8669-d554281a5e1b';
      console.log('🔍 DEBUG ENDPOINT: userId =', userId);
      
      const tickers = await storage.getActiveTickersWithPositionsForUser(userId);
      console.log('🔍 DEBUG ENDPOINT: Raw tickers from storage =', JSON.stringify(tickers, null, 2));
      
      res.json({
        userId,
        tickerCount: tickers.length,
        tickers: tickers.map(ticker => ({
          id: ticker.id,
          symbol: ticker.symbol,
          currentPrice: ticker.currentPrice,
          priceChange: ticker.priceChange,
          priceChangePercent: ticker.priceChangePercent,
          position: {
            id: ticker.position?.id,
            strategyType: ticker.position?.strategyType,
            longPutStrike: ticker.position?.longPutStrike,
            longCallStrike: ticker.position?.longCallStrike,
            longPutPremium: ticker.position?.longPutPremium,
            longCallPremium: ticker.position?.longCallPremium,
            daysToExpiry: ticker.position?.daysToExpiry,
            expirationDate: ticker.position?.expirationDate
          }
        }))
      });
    } catch (error) {
      console.error('❌ DEBUG ENDPOINT ERROR:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Force recalculation of all positions with new IV data from MarketData.app
  app.post("/api/debug/recalculate-iv-data", async (req: any, res) => {
    try {
      console.log('🔄 RECALCULATING ALL POSITIONS WITH NEW IV DATA...');
      
      const userId = '5630d6b1-42b4-43bd-8669-d554281a5e1b';
      const tickers = await storage.getActiveTickersWithPositionsForUser(userId);
      console.log(`📊 Found ${tickers.length} positions to recalculate with new IV data`);
      
      const results = [];
      
      for (const ticker of tickers) {
        if (!ticker.position) {
          continue;
        }
        
        console.log(`🔄 Recalculating ${ticker.symbol} position with new IV data from MarketData.app...`);
        
        try {
          // Import the calculator
          const { LongStrangleCalculator } = await import('../positionCalculator');
          
          // Get fresh market data with new IV extraction
          const marketData = await LongStrangleCalculator.getOptimalStrikesFromChain(
            ticker.symbol,
            ticker.currentPrice,
            storage,
            ticker.position?.expirationDate
          );
          
          if (!marketData) {
            console.log(`❌ No market data available for ${ticker.symbol}`);
            continue;
          }
          
          console.log(`✅ NEW IV DATA for ${ticker.symbol}: ${marketData.impliedVolatility.toFixed(1)}% (${marketData.ivPercentile}th percentile)`);
          
          // Update position with new IV data and expected move (keep existing strikes/premiums but update IV)
          const updatedPosition = await storage.updatePosition(ticker.position.id, userId, {
            impliedVolatility: marketData.impliedVolatility,
            ivPercentile: marketData.ivPercentile,
            // Optionally update strikes/premiums too
            longPutStrike: marketData.putStrike,
            longCallStrike: marketData.callStrike,
            longPutPremium: marketData.putPremium,
            longCallPremium: marketData.callPremium,
            maxLoss: Math.round((marketData.putPremium + marketData.callPremium) * 100),
          });
          
          results.push({
            symbol: ticker.symbol,
            success: true,
            oldIV: ticker.position.impliedVolatility,
            newIV: marketData.impliedVolatility,
            oldIVPercentile: ticker.position.ivPercentile,
            newIVPercentile: marketData.ivPercentile,
            message: `Updated IV from ${ticker.position.impliedVolatility}% to ${marketData.impliedVolatility.toFixed(1)}%`
          });
          
        } catch (error) {
          console.error(`❌ Error recalculating ${ticker.symbol}:`, error);
          results.push({
            symbol: ticker.symbol,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
      
      console.log('✅ IV RECALCULATION COMPLETE');
      res.json({
        message: "IV recalculation completed",
        results,
        totalProcessed: results.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      });
      
    } catch (error) {
      console.error('❌ IV RECALCULATION ERROR:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        message: "Failed to recalculate IV data"
      });
    }
  });

  // Simple IV update endpoint that works without query params (no auth required)
  app.post("/api/debug/force-iv-update", async (req: any, res) => {
    try {
      console.log('🔄 FORCE IV UPDATE TRIGGERED!');
      
      const userId = '5630d6b1-42b4-43bd-8669-d554281a5e1b';
      const tickers = await storage.getActiveTickersWithPositionsForUser(userId);
      console.log(`📊 Found ${tickers.length} positions to update with real IV data`);
      
      const results = [];
      
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
            
            // Update position with new IV data
            await storage.updatePosition(ticker.position.id, userId, {
              impliedVolatility: marketData.impliedVolatility,
              ivPercentile: marketData.ivPercentile,
              longPutStrike: marketData.putStrike,
              longCallStrike: marketData.callStrike,
              longPutPremium: marketData.putPremium,
              longCallPremium: marketData.callPremium,
              maxLoss: Math.round((marketData.putPremium + marketData.callPremium) * 100),
            });
            
            results.push({
              symbol: ticker.symbol,
              success: true,
              oldIV: ticker.position.impliedVolatility,
              newIV: marketData.impliedVolatility,
              oldIVPercentile: ticker.position.ivPercentile,
              newIVPercentile: marketData.ivPercentile,
              message: `Updated IV from ${ticker.position.impliedVolatility}% to ${marketData.impliedVolatility.toFixed(1)}%`
            });
          }
        } catch (error) {
          console.error(`❌ Error updating IV for ${ticker.symbol}:`, error);
          results.push({
            symbol: ticker.symbol,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
      
      console.log('✅ FORCE IV UPDATE COMPLETE');
      res.json({
        message: "Force IV update completed",
        results,
        totalProcessed: results.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      });
      
    } catch (error) {
      console.error('❌ FORCE IV UPDATE ERROR:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        message: "Failed to force IV update"
      });
    }
  });

  // Fix ATM values and expiration dates for all positions
  app.post("/api/debug/fix-atm-and-dates", async (req: any, res) => {
    try {
      console.log('🔧 FIXING ATM VALUES AND EXPIRATION DATES...');
      
      const userId = '5630d6b1-42b4-43bd-8669-d554281a5e1b';
      const tickers = await storage.getActiveTickersWithPositionsForUser(userId);
      console.log(`📊 Found ${tickers.length} positions to fix`);
      
      const results = [];
      
      // Calculate correct expiration date (next Friday)
      const today = new Date();
      const daysUntilFriday = (5 - today.getDay() + 7) % 7;
      const nextFriday = new Date(today);
      nextFriday.setDate(today.getDate() + (daysUntilFriday === 0 ? 7 : daysUntilFriday));
      const correctExpirationDate = nextFriday.toISOString().split('T')[0];
      const correctDaysToExpiry = Math.ceil((nextFriday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      console.log(`📅 Today: ${today.toISOString().split('T')[0]} (${today.toLocaleDateString('en-US', {weekday: 'short'})})`);
      console.log(`📅 Next Friday: ${correctExpirationDate} (${nextFriday.toLocaleDateString('en-US', {weekday: 'short'})})`);
      console.log(`📅 Days to expiry: ${correctDaysToExpiry}d`);
      
      for (const ticker of tickers) {
        if (!ticker.position) continue;
        
        try {
          console.log(`🔧 Fixing ${ticker.symbol}...`);
          console.log(`  Current ATM: $${ticker.position.atmValue} → New ATM: $${ticker.currentPrice}`);
          console.log(`  Current Expiration: ${ticker.position.expirationDate} → New Expiration: ${correctExpirationDate}`);
          console.log(`  Current Days: ${ticker.position.daysToExpiry}d → New Days: ${correctDaysToExpiry}d`);
          
          // Update position with correct ATM value and expiration date
          await storage.updatePosition(ticker.position.id, userId, {
            atmValue: ticker.currentPrice,
            expirationDate: correctExpirationDate,
            daysToExpiry: correctDaysToExpiry,
          });
          
          results.push({
            symbol: ticker.symbol,
            success: true,
            oldATM: ticker.position.atmValue,
            newATM: ticker.currentPrice,
            oldExpiration: ticker.position.expirationDate,
            newExpiration: correctExpirationDate,
            oldDays: ticker.position.daysToExpiry,
            newDays: correctDaysToExpiry
          });
          
          console.log(`✅ Fixed ${ticker.symbol}: ATM=$${ticker.currentPrice}, Exp=${correctExpirationDate}, Days=${correctDaysToExpiry}d`);
          
        } catch (error) {
          console.error(`❌ Error fixing ${ticker.symbol}:`, error);
          results.push({
            symbol: ticker.symbol,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
      
      console.log('✅ ATM AND DATE FIX COMPLETE');
      res.json({
        message: "ATM values and expiration dates fixed",
        results,
        totalProcessed: results.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      });
      
    } catch (error) {
      console.error('❌ ATM/DATE FIX ERROR:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        message: "Failed to fix ATM values and dates"
      });
    }
  });

       // Update positions with closest real strikes from options chain
       app.post("/api/debug/update-strikes-from-live-data", async (req: any, res) => {
         try {
           console.log('🎯 UPDATING STRIKES FROM LIVE OPTIONS DATA...');
           
           const userId = '5630d6b1-42b4-43bd-8669-d554281a5e1b';
           const tickers = await storage.getActiveTickersForUser(userId);
           const results = [];
           
           for (const ticker of tickers) {
             try {
               console.log(`📊 Getting live options chain for ${ticker.symbol} at $${ticker.currentPrice}...`);
               
               // Get fresh options chain from MarketData.app
               const { marketDataApiService } = await import('../marketDataApi');
               const optionsChain = await marketDataApiService.getOptionsChain(ticker.symbol, ticker.currentPrice);
               
               if (optionsChain && optionsChain.chains) {
                 // Get the nearest expiration date
                 const expirationDates = Object.keys(optionsChain.chains).sort();
                 console.log(`📅 Available expirations for ${ticker.symbol}:`, expirationDates);
                 const nearestExpiration = expirationDates[0];
                 const chainData = optionsChain.chains[nearestExpiration];
                 console.log(`📊 Using expiration ${nearestExpiration} for ${ticker.symbol}`);
                 
                 if (chainData) {
                   console.log(`📈 Found ${chainData.calls.length} calls and ${chainData.puts.length} puts for ${ticker.symbol} exp ${nearestExpiration}`);
                   
                   // Find strikes with at least $1 separation from current price
                   console.log(`🔍 ${ticker.symbol} price $${ticker.currentPrice} - filtering calls >= $${ticker.currentPrice + 1}, puts <= $${ticker.currentPrice - 1}`);
                   const callsAbovePrice = chainData.calls.filter(call => call.strike >= ticker.currentPrice + 1).sort((a, b) => a.strike - b.strike);
                   const putsBelowPrice = chainData.puts.filter(put => put.strike <= ticker.currentPrice - 1).sort((a, b) => b.strike - a.strike);
                   
                   console.log(`🎯 ${ticker.symbol} filtered results: ${callsAbovePrice.length} calls, ${putsBelowPrice.length} puts`);
                   if (callsAbovePrice.length > 0) console.log(`   First 3 calls:`, callsAbovePrice.slice(0, 3).map(c => `$${c.strike}`));
                   if (putsBelowPrice.length > 0) console.log(`   First 3 puts:`, putsBelowPrice.slice(0, 3).map(p => `$${p.strike}`));
                   
                   if (callsAbovePrice.length > 0 && putsBelowPrice.length > 0) {
                     const closestCall = callsAbovePrice[0]; // First call at least $1 above current price
                     const closestPut = putsBelowPrice[0];   // First put at least $1 below current price
                     
                     const callPremium = (closestCall.bid + closestCall.ask) / 2;
                     const putPremium = (closestPut.bid + closestPut.ask) / 2;
                     
                     console.log(`🎯 CLOSEST STRIKES for ${ticker.symbol} ($${ticker.currentPrice}):`);
                     console.log(`   Call: $${closestCall.strike} premium $${callPremium}`);
                     console.log(`   Put:  $${closestPut.strike} premium $${putPremium}`);
                     
                     // Update the position with live strikes and premiums
                     const position = await storage.getPositionByTickerId(ticker.id);
                     if (position) {
                       await storage.updatePosition(position.id, userId, {
                         longCallStrike: closestCall.strike,
                         longPutStrike: closestPut.strike,
                         longCallPremium: callPremium,
                         longPutPremium: putPremium,
                         expirationDate: nearestExpiration,
                         lowerBreakeven: closestPut.strike - (putPremium + callPremium),
                         upperBreakeven: closestCall.strike + (putPremium + callPremium),
                         maxLoss: (putPremium + callPremium) * 100,
                         atmValue: ticker.currentPrice,
                       });
                       
                       console.log(`✅ Updated ${ticker.symbol} position with live strikes: Put $${closestPut.strike}, Call $${closestCall.strike}`);
                       
                       results.push({
                         symbol: ticker.symbol,
                         currentPrice: ticker.currentPrice,
                         oldPutStrike: position.longPutStrike,
                         oldCallStrike: position.longCallStrike,
                         newPutStrike: closestPut.strike,
                         newCallStrike: closestCall.strike,
                         putPremium: putPremium,
                         callPremium: callPremium,
                         expiration: nearestExpiration,
                         success: true
                       });
                     }
                   } else {
                     console.warn(`⚠️ No suitable strikes found for ${ticker.symbol}`);
                     results.push({
                       symbol: ticker.symbol,
                       error: 'No suitable strikes above/below current price',
                       success: false
                     });
                   }
                 } else {
                   console.warn(`⚠️ No options chain data for expiration ${nearestExpiration} for ${ticker.symbol}`);
                   results.push({
                     symbol: ticker.symbol,
                     error: `No options chain data for expiration ${nearestExpiration}`,
                     success: false
                   });
                 }
               } else {
                 console.warn(`⚠️ No options chain data available for ${ticker.symbol}`);
                 results.push({
                   symbol: ticker.symbol,
                   error: 'No options chain data available',
                   success: false
                 });
               }
             } catch (error) {
               console.error(`❌ Failed to update strikes for ${ticker.symbol}:`, error);
               results.push({
                 symbol: ticker.symbol,
                 error: error.message,
                 success: false
               });
             }
           }
           
           res.json({
             success: true,
             message: `Updated strikes for ${results.filter(r => r.success).length} symbols using live options data`,
             results,
             timestamp: new Date().toISOString()
           });
           
         } catch (error) {
           console.error('❌ UPDATE STRIKES FROM LIVE DATA ERROR:', error);
           res.status(500).json({ error: error.message });
         }
       });

       // Force database update endpoint (no auth for testing)
       app.post("/api/debug/force-price-update", async (req: any, res) => {
    try {
      // Use known user ID for testing
      const userId = '5630d6b1-42b4-43bd-8669-d554281a5e1b';
      console.log('🔥 FORCE PRICE UPDATE: Starting for user', userId);
      
      const tickers = await storage.getActiveTickersForUser(userId);
      const updates = [];
      
      for (const ticker of tickers) {
        try {
          console.log(`🔍 Getting fresh price for ${ticker.symbol}...`);
          const quote = await marketDataApiService.getStockQuote(ticker.symbol);
          
          if (quote) {
            console.log(`📊 Fresh API price for ${ticker.symbol}: $${quote.currentPrice} (${quote.change >= 0 ? '+' : ''}$${quote.change}, ${quote.changePercent >= 0 ? '+' : ''}${quote.changePercent}%) - database has $${ticker.currentPrice}`);
            
            await storage.updateTicker(ticker.id, {
              currentPrice: quote.currentPrice,
              priceChange: quote.change || 0,
              priceChangePercent: quote.changePercent || 0,
            });
            
            // Also update position calculations and options premiums with new price
            const position = await storage.getPositionByTickerId(ticker.id);
            if (position) {
              console.log(`🔄 Recalculating position for ${ticker.symbol} with new price $${quote.currentPrice}...`);
              
              // Get fresh options chain data to update premiums
              try {
                console.log(`📊 Fetching fresh options chain for ${ticker.symbol} to update premiums...`);
                const { marketDataApiService } = await import('../marketDataApi');
                const optionsChain = await marketDataApiService.getOptionsChain(ticker.symbol, quote.currentPrice);
                
                if (optionsChain && optionsChain.chains) {
                  const expirationDate = position.expirationDate;
                  const chainData = optionsChain.chains[expirationDate];
                  
                  if (chainData) {
                    // Find current strikes in the options chain
                    const putOption = chainData.puts.find(put => put.strike === position.longPutStrike);
                    const callOption = chainData.calls.find(call => call.strike === position.longCallStrike);
                    
                    if (putOption && callOption) {
                      const freshPutPremium = (putOption.bid + putOption.ask) / 2;
                      const freshCallPremium = (callOption.bid + callOption.ask) / 2;
                      
                      console.log(`📈 Fresh premiums for ${ticker.symbol}: Put $${position.longPutStrike} = $${freshPutPremium}, Call $${position.longCallStrike} = $${freshCallPremium}`);
                      
                      // Update position with fresh premiums and ATM value
                      await storage.updatePosition(position.id, userId, {
                        atmValue: quote.currentPrice,
                        longPutPremium: freshPutPremium,
                        longCallPremium: freshCallPremium,
                        // Recalculate breakevens with new premiums
                        lowerBreakeven: position.longPutStrike - (freshPutPremium + freshCallPremium),
                        upperBreakeven: position.longCallStrike + (freshPutPremium + freshCallPremium),
                        maxLoss: (freshPutPremium + freshCallPremium) * 100, // Per contract
                      });
                      
                      console.log(`✅ Position updated for ${ticker.symbol}: ATM=$${quote.currentPrice}, fresh premiums, new breakevens`);
                    } else {
                      console.warn(`⚠️ Could not find strikes in options chain for ${ticker.symbol}`);
                      // Just update ATM value
                      await storage.updatePosition(position.id, userId, {
                        atmValue: quote.currentPrice,
                      });
                    }
                  } else {
                    console.warn(`⚠️ No options chain data for expiration ${expirationDate} for ${ticker.symbol}`);
                    // Just update ATM value
                    await storage.updatePosition(position.id, userId, {
                      atmValue: quote.currentPrice,
                    });
                  }
                } else {
                  console.warn(`⚠️ No options chain available for ${ticker.symbol}`);
                  // Just update ATM value
                  await storage.updatePosition(position.id, userId, {
                    atmValue: quote.currentPrice,
                  });
                }
              } catch (optionsError) {
                console.error(`❌ Failed to update options for ${ticker.symbol}:`, optionsError);
                // Just update ATM value
                await storage.updatePosition(position.id, userId, {
                  atmValue: quote.currentPrice,
                });
              }
            }
            
            updates.push({
              symbol: ticker.symbol,
              oldPrice: ticker.currentPrice,
              newPrice: quote.currentPrice,
              change: quote.change,
              changePercent: quote.changePercent,
              updated: true
            });
          }
        } catch (error) {
          console.error(`❌ Failed to update ${ticker.symbol}:`, error);
          updates.push({
            symbol: ticker.symbol,
            error: error.message,
            updated: false
          });
        }
      }
      
      res.json({
        success: true,
        message: `Force updated ${updates.filter(u => u.updated).length} tickers`,
        updates,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('❌ FORCE PRICE UPDATE ERROR:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Populate options chain table with fresh market data
  app.post("/api/debug/populate-options-chains", async (req: any, res) => {
    try {
      console.log('🔥 POPULATING OPTIONS CHAINS: Starting...');
      
      const userId = '5630d6b1-42b4-43bd-8669-d554281a5e1b';
      const tickers = await storage.getActiveTickersForUser(userId);
      const results = [];
      
      for (const ticker of tickers) {
        try {
          console.log(`📊 Fetching options chain for ${ticker.symbol}...`);
          
          // Get fresh options chain from MarketData.app (use direct service)
          const { marketDataApiService } = await import('../marketDataApi');
          const optionsChain = await marketDataApiService.getOptionsChain(ticker.symbol, ticker.currentPrice);
          
          if (optionsChain && optionsChain.chains) {
            console.log(`✅ Got options chain for ${ticker.symbol}: ${Object.keys(optionsChain.chains).length} expirations`);
            
            // Save to database
            await storage.saveOptionsChain(ticker.symbol, optionsChain);
            console.log(`💾 Saved options chain for ${ticker.symbol} to database`);
            
            results.push({
              symbol: ticker.symbol,
              expirations: Object.keys(optionsChain.chains),
              totalOptions: Object.values(optionsChain.chains).reduce((sum: number, chain: any) => sum + chain.calls.length + chain.puts.length, 0),
              success: true
            });
          } else {
            console.warn(`⚠️ No options chain data available for ${ticker.symbol}`);
            results.push({
              symbol: ticker.symbol,
              error: 'No options chain data available',
              success: false
            });
          }
        } catch (error) {
          console.error(`❌ Failed to populate options chain for ${ticker.symbol}:`, error);
          results.push({
            symbol: ticker.symbol,
            error: error.message,
            success: false
          });
        }
      }
      
      res.json({
        success: true,
        message: `Populated options chains for ${results.filter(r => r.success).length} symbols`,
        results,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('❌ POPULATE OPTIONS CHAINS ERROR:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Simple test to check if options API is working at all
  app.get("/api/debug/test-options/:symbol", async (req: any, res) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      console.log(`🧪 TESTING OPTIONS API for ${symbol}...`);
      
      // Test direct MarketData.app API call
      const { marketDataApiService } = await import('../marketDataApi');
      console.log(`📡 Making direct MarketData.app options call for ${symbol}...`);
      
      const optionsChain = await marketDataApiService.getOptionsChain(symbol);
      
      if (optionsChain) {
        console.log(`✅ OPTIONS TEST SUCCESS for ${symbol}:`, {
          symbol: optionsChain.symbol,
          optionsCount: optionsChain.options?.length || 0,
          chainsCount: optionsChain.chains ? Object.keys(optionsChain.chains).length : 0,
          expirations: optionsChain.expirationDates || []
        });
        
        res.json({
          success: true,
          symbol,
          optionsCount: optionsChain.options?.length || 0,
          chainsCount: optionsChain.chains ? Object.keys(optionsChain.chains).length : 0,
          expirations: optionsChain.expirationDates || [],
          sampleOptions: optionsChain.options?.slice(0, 5) || [],
          dataSource: optionsChain.dataSource,
          timestamp: new Date().toISOString()
        });
      } else {
        console.log(`❌ OPTIONS TEST FAILED for ${symbol}: No data returned`);
        res.json({
          success: false,
          symbol,
          error: 'No options data returned from API',
          timestamp: new Date().toISOString()
        });
      }
      
    } catch (error) {
      console.error(`❌ OPTIONS TEST ERROR for ${req.params.symbol}:`, error);
      res.status(500).json({ 
        success: false,
        symbol: req.params.symbol,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Add individual IV columns to database
  app.post('/api/debug/add-iv-columns', async (req: any, res) => {
    try {
      console.log('🔧 Adding individual IV columns to database...');
      
      const { supabase } = await import('../config/supabase');
      
      const { data, error } = await supabase.rpc('exec_sql', {
        sql: 'ALTER TABLE long_strangle_positions ADD COLUMN IF NOT EXISTS call_iv REAL, ADD COLUMN IF NOT EXISTS put_iv REAL;'
      });
      
      if (error) {
        console.error('❌ SQL Error:', error);
        return res.status(500).json({ error: 'SQL execution failed', details: error });
      }
      
      console.log('✅ Individual IV columns added successfully');
      res.json({ 
        success: true, 
        message: 'Individual IV columns added to database',
        sql: 'ALTER TABLE long_strangle_positions ADD COLUMN IF NOT EXISTS call_iv REAL, ADD COLUMN IF NOT EXISTS put_iv REAL;'
      });
      
    } catch (error) {
      console.error('❌ Error adding IV columns:', error);
      res.status(500).json({ error: 'Failed to add IV columns', details: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Test endpoint to verify debug routes are working
  app.get('/api/debug/test-atm', requireSupabaseAuth, async (req: any, res) => {
    res.json({ 
      success: true, 
      message: 'Debug ATM endpoint is working',
      userId: req.user?.id,
      timestamp: new Date().toISOString()
    });
  });

  // Add missing database columns
  app.post('/api/debug/add-missing-columns', requireSupabaseAuth, async (req: any, res) => {
    try {
      console.log('🔧 Adding missing database columns...');
      
      const { supabase } = await import('../config/supabase');
      
      const sql = `
        ALTER TABLE long_strangle_positions 
        ADD COLUMN IF NOT EXISTS call_iv REAL,
        ADD COLUMN IF NOT EXISTS put_iv REAL,
        ADD COLUMN IF NOT EXISTS expected_move_weekly_low REAL,
        ADD COLUMN IF NOT EXISTS expected_move_weekly_high REAL,
        ADD COLUMN IF NOT EXISTS expected_move_daily_move REAL,
        ADD COLUMN IF NOT EXISTS expected_move_weekly_move REAL,
        ADD COLUMN IF NOT EXISTS expected_move_move_percentage REAL;
      `;
      
      const { data, error } = await supabase.rpc('exec_sql', { sql });
      
      if (error) {
        console.error('❌ SQL Error:', error);
        return res.status(500).json({ error: 'SQL execution failed', details: error });
      }
      
      console.log('✅ Database columns added successfully');
      res.json({ 
        success: true, 
        message: 'Missing database columns added successfully',
        sql: sql.trim()
      });
      
    } catch (error) {
      console.error('❌ Error adding columns:', error);
      res.status(500).json({ error: 'Failed to add columns', details: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Simple ATM test endpoint (no auth) - GET method for easy testing
  app.get('/api/debug/simple-atm-fix', async (req: any, res) => {
    try {
      console.log('🔧 SIMPLE ATM FIX: Starting ATM value fix...');
      
      // Set proper headers for JSON response
      res.setHeader('Content-Type', 'application/json');
      
      const userId = '5630d6b1-42b4-43bd-8669-d554281a5e1b';
      console.log('🔧 Getting tickers for user:', userId);
      
      const tickers = await storage.getActiveTickersWithPositionsForUser(userId);
      console.log('🔧 Found tickers:', tickers.length);
      
      if (tickers.length === 0) {
        return res.json({ message: 'No active tickers found', updated: 0 });
      }

      // Hardcoded historical prices from last Friday (Sept 13, 2025)
      const historicalPrices = {
        'NVDA': 170.29,  // Example historical price
        'QQQ': 590.00,   // Example historical price  
        'AAPL': 239.99   // Example historical price
      };
      
      let updatedCount = 0;
      
      for (const ticker of tickers) {
        const historicalPrice = historicalPrices[ticker.symbol as keyof typeof historicalPrices];
        if (historicalPrice) {
          await storage.updatePosition(ticker.position.id, userId, {
            atmValue: historicalPrice,
          });
          
          console.log(`✅ Updated ${ticker.symbol} ATM: $${ticker.position.atmValue.toFixed(2)} → $${historicalPrice.toFixed(2)}`);
          updatedCount++;
        }
      }
      
      res.json({
        success: true,
        message: `Updated ATM values for ${updatedCount} positions`,
        updated: updatedCount
      });
      
    } catch (error) {
      console.error('❌ Error in simple ATM fix:', error);
      res.status(500).json({ 
        error: 'Failed to fix ATM values', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  // Fix ATM values by setting them to stock prices from last expiration (previous Friday)
  app.post('/api/debug/fix-atm-from-last-expiration', requireSupabaseAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      console.log('🔧 Fixing ATM values using stock prices from last expiration...');
      
      const { storage } = await import('../storage');
      const tickers = await storage.getActiveTickersWithPositionsForUser(userId);
      
      if (tickers.length === 0) {
        return res.json({ message: 'No active tickers found', updated: 0 });
      }

      // Calculate the last Friday (previous expiration date)
      const today = new Date();
      const dayOfWeek = today.getDay(); // 0=Sunday, 5=Friday
      
      // Calculate days back to last Friday
      let daysBack;
      if (dayOfWeek === 0) { // Sunday
        daysBack = 2; // Last Friday was 2 days ago
      } else if (dayOfWeek === 6) { // Saturday  
        daysBack = 1; // Last Friday was 1 day ago
      } else { // Monday-Friday
        daysBack = dayOfWeek === 5 ? 7 : (dayOfWeek + 2); // If today is Friday, go back 7 days, otherwise go back to last Friday
      }
      
      const lastFriday = new Date(today);
      lastFriday.setDate(today.getDate() - daysBack);
      const lastFridayStr = lastFriday.toISOString().split('T')[0];
      
      console.log(`📅 Last expiration (Friday): ${lastFridayStr}`);
      
      let updatedCount = 0;
      
      for (const ticker of tickers) {
        try {
          console.log(`🔧 ${ticker.symbol}: Current ATM $${ticker.position.atmValue.toFixed(2)} → Fetching historical price from ${lastFridayStr}`);
          
          // Fetch actual historical closing price from last Friday using Finnhub
          const historicalPrice = await getHistoricalClosingPrice(ticker.symbol, lastFridayStr);
          
          if (!historicalPrice) {
            console.warn(`⚠️ Could not fetch historical price for ${ticker.symbol} on ${lastFridayStr}, keeping current ATM`);
            continue;
          }
          
          await storage.updatePosition(ticker.position.id, userId, {
            atmValue: historicalPrice,
          });
          
          console.log(`✅ Updated ${ticker.symbol} ATM: $${ticker.position.atmValue.toFixed(2)} → $${historicalPrice.toFixed(2)} (historical closing price)`);
          updatedCount++;
          
        } catch (error) {
          console.error(`❌ Failed to update ATM for ${ticker.symbol}:`, error);
        }
      }
      
      console.log(`🎉 ATM values fixed for ${updatedCount} positions using last expiration prices`);
      
      res.json({
        success: true,
        message: `Updated ATM values for ${updatedCount} positions`,
        lastExpirationDate: lastFridayStr,
        updated: updatedCount,
        details: tickers.map(t => ({
          symbol: t.symbol,
          previousATM: t.position.atmValue,
          updatedATM: 'See logs for new values'
        }))
      });
      
    } catch (error) {
      console.error('❌ Error fixing ATM values:', error);
      res.status(500).json({ 
        error: 'Failed to fix ATM values', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });
}
