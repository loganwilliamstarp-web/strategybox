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
  
  // Debug endpoint to check user's tickers in database
  app.get("/api/debug/user-tickers/:userId", async (req: any, res) => {
    try {
      const { userId } = req.params;
      console.log(`🔍 DEBUG: Checking tickers for user ${userId}`);
      
      const allTickers = await storage.getActiveTickersForUser(userId);
      const tickersWithPositions = await storage.getActiveTickersWithPositionsForUser(userId);
      
      console.log(`📊 DEBUG: Found ${allTickers.length} active tickers`);
      console.log(`📊 DEBUG: Found ${tickersWithPositions.length} tickers with positions`);
      
      res.json({
        userId,
        allTickers,
        tickersWithPositions,
        counts: {
          allTickers: allTickers.length,
          withPositions: tickersWithPositions.length
        }
      });
    } catch (error) {
      console.error('❌ Debug tickers error:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

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

  // Debug AAPL options data issue
  app.get("/api/debug/aapl-options-debug", async (req: any, res) => {
    try {
      const symbol = 'AAPL';
      console.log(`🔍 Debugging AAPL options data issue...`);
      
      // Step 1: Check what's in database
      const allData = await storage.getOptionsChainFromDB(symbol);
      console.log(`📊 Total AAPL options in database: ${allData.length}`);
      
      if (allData.length > 0) {
        const expirations = [...new Set(allData.map(r => r.expirationDate))].sort();
        console.log(`📅 Available expirations: ${expirations.join(', ')}`);
        
        // Step 2: Test specific expiration queries
        const expirationTests = {};
        for (const exp of expirations.slice(0, 3)) { // Test first 3 expirations
          const filteredData = await storage.getOptionsChainFromDB(symbol, exp);
          expirationTests[exp] = {
            count: filteredData.length,
            calls: filteredData.filter(o => o.optionType === 'call').length,
            puts: filteredData.filter(o => o.optionType === 'put').length
          };
        }
        
        // Step 3: Test API endpoint
        const apiResponse = await fetch(`http://localhost:5001/api/options-chain/${symbol}`, {
          headers: { 'Cookie': req.headers.cookie || '' }
        });
        const apiData = await apiResponse.json();
        
        const result = {
          symbol,
          databaseStatus: {
            totalOptions: allData.length,
            availableExpirations: expirations,
            expirationTests: expirationTests
          },
          apiStatus: {
            responseOk: apiResponse.ok,
            statusCode: apiResponse.status,
            optionsCount: apiData.options?.length || 0,
            apiExpirations: apiData.expirationDates || [],
            error: apiData.error || null
          },
          sampleData: {
            firstOption: allData[0] || null,
            apiFirstOption: apiData.options?.[0] || null
          }
        };
        
        console.log(`✅ AAPL debug completed:`, result);
        res.json(result);
        
      } else {
        // No data in database, try to populate
        console.log(`🔄 No AAPL data in database, attempting to populate...`);
        
        const { optionsApiService } = await import('../optionsApiService');
        const freshOptionsChain = await optionsApiService.getOptionsChain(symbol);
        
        if (freshOptionsChain && freshOptionsChain.options && freshOptionsChain.options.length > 0) {
          console.log(`📊 Got ${freshOptionsChain.options.length} options from API`);
          await storage.saveOptionsChain(symbol, freshOptionsChain);
          
          // Retry database query
          const newData = await storage.getOptionsChainFromDB(symbol);
          const newExpirations = [...new Set(newData.map(r => r.expirationDate))].sort();
          
          res.json({
            symbol,
            action: 'populated_from_api',
            apiOptions: freshOptionsChain.options.length,
            databaseOptions: newData.length,
            expirations: newExpirations,
            sampleOption: newData[0] || null
          });
        } else {
          res.json({
            symbol,
            action: 'no_api_data',
            error: 'No options data available from API'
          });
        }
      }
      
    } catch (error) {
      console.error(`❌ AAPL debug failed:`, error);
      res.status(500).json({
        error: "AAPL debug failed",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Test expiration date filtering
  app.get("/api/debug/test-expiration-filtering/:symbol", async (req: any, res) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      const testExpiration = req.query.expiration as string;
      
      console.log(`🧪 Testing expiration date filtering for ${symbol}${testExpiration ? ` with expiration ${testExpiration}` : ''}`);
      
      // Test 1: Get all options data
      const allOptions = await storage.getOptionsChainFromDB(symbol);
      console.log(`📊 Total options in database: ${allOptions.length}`);
      
      // Test 2: Get filtered options by expiration
      const filteredOptions = testExpiration 
        ? await storage.getOptionsChainFromDB(symbol, testExpiration)
        : allOptions;
      
      console.log(`📊 Filtered options: ${filteredOptions.length}`);
      
      // Test 3: Test API endpoint
      const apiUrl = testExpiration 
        ? `/api/options-chain/${symbol}?expiration=${testExpiration}`
        : `/api/options-chain/${symbol}`;
      
      const apiResponse = await fetch(`http://localhost:5000${apiUrl}`, {
        headers: { 'Cookie': req.headers.cookie || '' }
      });
      const apiData = await apiResponse.json();
      
      // Test 4: Analyze expiration dates
      const uniqueExpirations = [...new Set(allOptions.map(r => r.expirationDate))].sort();
      const apiExpirations = apiData.expirationDates || [];
      
      const result = {
        symbol,
        testExpiration,
        databaseTest: {
          totalOptions: allOptions.length,
          filteredOptions: filteredOptions.length,
          uniqueExpirations: uniqueExpirations,
          filteredByExpiration: testExpiration ? filteredOptions.every(opt => opt.expirationDate === testExpiration) : true
        },
        apiTest: {
          endpoint: apiUrl,
          responseOk: apiResponse.ok,
          optionsCount: apiData.options?.length || 0,
          expirationDates: apiExpirations,
          filteredCorrectly: testExpiration ? apiData.options?.every((opt: any) => opt.expiration_date === testExpiration) : true
        },
        sampleData: {
          firstOption: filteredOptions[0] || null,
          apiFirstOption: apiData.options?.[0] || null,
          expirationMatch: testExpiration ? filteredOptions[0]?.expirationDate === testExpiration : true
        }
      };
      
      console.log(`✅ Expiration filtering test completed for ${symbol}:`, result);
      res.json(result);
      
    } catch (error) {
      console.error(`❌ Expiration filtering test failed for ${req.params.symbol}:`, error);
      res.status(500).json({
        error: "Expiration filtering test failed",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Test options chain database storage and retrieval
  app.get("/api/debug/test-options-chain/:symbol", async (req: any, res) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      console.log(`🧪 Testing options chain database storage for ${symbol}`);
      
      // Step 1: Clear existing data
      await storage.clearOptionsChainData(symbol);
      console.log(`🗑️ Cleared existing data for ${symbol}`);
      
      // Step 2: Fetch fresh data from API
      const { optionsApiService } = await import('../optionsApiService');
      const freshOptionsChain = await optionsApiService.getOptionsChain(symbol);
      
      if (!freshOptionsChain || !freshOptionsChain.options || freshOptionsChain.options.length === 0) {
        return res.status(404).json({
          error: "No options data available from API",
          message: `No options chain data found for ${symbol} from external API`
        });
      }
      
      console.log(`📊 Fetched ${freshOptionsChain.options.length} options from API for ${symbol}`);
      
      // Step 3: Save to database
      await storage.saveOptionsChain(symbol, freshOptionsChain);
      console.log(`💾 Saved options chain to database for ${symbol}`);
      
      // Step 4: Retrieve from database
      const dbData = await storage.getOptionsChainFromDB(symbol);
      console.log(`📋 Retrieved ${dbData.length} options from database for ${symbol}`);
      
      // Step 5: Test API endpoint
      const apiResponse = await fetch(`http://localhost:5000/api/options-chain/${symbol}`, {
        headers: { 'Cookie': req.headers.cookie || '' }
      });
      const apiData = await apiResponse.json();
      
      // Step 6: Compare data
      const uniqueExpirations = [...new Set(dbData.map(r => r.expirationDate))].sort();
      const apiExpirations = apiData.expirationDates || [];
      
      const result = {
        symbol,
        testSteps: {
          clearedExistingData: true,
          fetchedFromAPI: freshOptionsChain.options.length,
          savedToDatabase: dbData.length,
          retrievedFromDatabase: dbData.length,
          apiEndpointWorking: apiResponse.ok,
          apiResponseOptions: apiData.options?.length || 0
        },
        dataIntegrity: {
          uniqueExpirations: uniqueExpirations,
          apiExpirations: apiExpirations,
          expirationMatch: JSON.stringify(uniqueExpirations) === JSON.stringify(apiExpirations),
          totalOptions: dbData.length,
          callsCount: dbData.filter(o => o.optionType === 'call').length,
          putsCount: dbData.filter(o => o.optionType === 'put').length
        },
        sampleData: {
          firstOption: dbData[0] || null,
          lastOption: dbData[dbData.length - 1] || null,
          apiSample: apiData.options?.[0] || null
        }
      };
      
      console.log(`✅ Options chain test completed for ${symbol}:`, result);
      res.json(result);
      
    } catch (error) {
      console.error(`❌ Options chain test failed for ${req.params.symbol}:`, error);
      res.status(500).json({
        error: "Options chain test failed",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
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

  // Debug MarketData.app API response for specific expiration
  app.get("/api/debug/marketdata-response/:symbol/:expiration", async (req: any, res) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      const expiration = req.params.expiration;
      console.log(`🔍 Debugging MarketData.app response for ${symbol} expiration ${expiration}...`);
      
      const { optionsApiService } = await import('../optionsApiService');
      
      // Test getOptionsChainSnapshot
      console.log(`🔄 Testing getOptionsChainSnapshot for ${symbol} ${expiration}...`);
      const snapshotData = await optionsApiService.getOptionsChainSnapshot(symbol, expiration);
      
      console.log(`📊 Snapshot response:`, {
        length: snapshotData?.length || 0,
        firstOption: snapshotData?.[0] || null,
        sampleExpirations: snapshotData?.slice(0, 5).map(opt => opt.expiration_date) || []
      });
      
      // Test getOptionsChain (comprehensive)
      console.log(`🔄 Testing getOptionsChain for ${symbol}...`);
      const comprehensiveData = await optionsApiService.getOptionsChain(symbol);
      
      console.log(`📊 Comprehensive response:`, {
        symbol: comprehensiveData?.symbol,
        optionsCount: comprehensiveData?.options?.length || 0,
        expirationDates: comprehensiveData?.expirationDates || [],
        firstOption: comprehensiveData?.options?.[0] || null
      });
      
      res.json({
        symbol,
        requestedExpiration: expiration,
        snapshotTest: {
          success: !!snapshotData,
          count: snapshotData?.length || 0,
          firstOption: snapshotData?.[0] || null,
          sampleExpirations: snapshotData?.slice(0, 5).map(opt => opt.expiration_date) || []
        },
        comprehensiveTest: {
          success: !!comprehensiveData,
          optionsCount: comprehensiveData?.options?.length || 0,
          expirationDates: comprehensiveData?.expirationDates || [],
          firstOption: comprehensiveData?.options?.[0] || null
        }
      });
      
    } catch (error) {
      console.error(`❌ MarketData debug failed:`, error);
      res.status(500).json({
        error: "MarketData debug failed",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get ALL data from MarketData.app with NO filters
  app.get("/api/debug/marketdata-raw-all/:symbol", async (req: any, res) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      console.log(`🔍 Getting ALL RAW data from MarketData.app for ${symbol} with NO filters...`);
      
      const { marketDataApiService } = await import('../marketDataApi');
      
      // Test multiple API endpoints with different parameters to get ALL possible data
      const tests = [
        { 
          name: 'NO LIMITS - Raw API call', 
          url: `/v1/options/chain/${symbol}/`,
          description: 'No strike or date limits - get everything'
        },
        { 
          name: 'HIGH LIMITS - 1000 strikes, 365 days', 
          url: `/v1/options/chain/${symbol}/?strikeLimit=1000&dateLimit=365`,
          description: 'Very high limits to get maximum data'
        },
        { 
          name: 'MEDIUM LIMITS - 500 strikes, 180 days', 
          url: `/v1/options/chain/${symbol}/?strikeLimit=500&dateLimit=180`,
          description: 'Medium limits'
        },
        { 
          name: 'CURRENT LIMITS - 200 strikes, no dateLimit', 
          url: `/v1/options/chain/${symbol}/?strikeLimit=200`,
          description: 'Current implementation (no dateLimit)'
        },
        { 
          name: 'OLD LIMITS - 200 strikes, 50 days', 
          url: `/v1/options/chain/${symbol}/?strikeLimit=200&dateLimit=50`,
          description: 'Previous implementation with dateLimit=50'
        }
      ];
      
      const results = {};
      
      for (const test of tests) {
        try {
          console.log(`🔄 Testing: ${test.name} - ${test.description}`);
          console.log(`   URL: ${test.url}`);
          
          const testData = await marketDataApiService.makeRequest(test.url);
          
          if (testData && testData.optionSymbol && testData.optionSymbol.length > 0) {
            // Extract ALL unique expiration dates
            const uniqueExpirations = [...new Set(testData.expiration.map(ts => {
              const date = new Date(ts * 1000);
              return date.toISOString().split('T')[0];
            }))].sort();
            
            // Count options per expiration
            const expirationCounts = {};
            for (let i = 0; i < testData.optionSymbol.length; i++) {
              const expDate = new Date(testData.expiration[i] * 1000).toISOString().split('T')[0];
              expirationCounts[expDate] = (expirationCounts[expDate] || 0) + 1;
            }
            
            // Check for specific dates we're looking for
            const targetDates = ['2025-09-26', '2025-09-25', '2025-09-27', '2025-10-03', '2025-10-17'];
            const foundTargetDates = targetDates.filter(date => uniqueExpirations.includes(date));
            
            results[test.name] = {
              success: true,
              totalOptions: testData.optionSymbol.length,
              totalExpirations: uniqueExpirations.length,
              expirationDates: uniqueExpirations,
              expirationCounts: expirationCounts,
              has20250926: uniqueExpirations.includes('2025-09-26'),
              foundTargetDates: foundTargetDates,
              sampleOptions: testData.optionSymbol.slice(0, 10).map((symbol, i) => ({
                optionSymbol: symbol,
                strike: testData.strike[i],
                side: testData.side[i],
                expiration: new Date(testData.expiration[i] * 1000).toISOString().split('T')[0],
                bid: testData.bid[i],
                ask: testData.ask[i]
              }))
            };
            
            console.log(`✅ ${test.name}: ${testData.optionSymbol.length} options across ${uniqueExpirations.length} expirations`);
            console.log(`   Expirations: ${uniqueExpirations.join(', ')}`);
            console.log(`   Has 2025-09-26: ${uniqueExpirations.includes('2025-09-26')}`);
            console.log(`   Found target dates: ${foundTargetDates.join(', ')}`);
            
          } else {
            results[test.name] = {
              success: false,
              error: 'No data returned',
              totalOptions: 0,
              expirationDates: []
            };
            console.log(`❌ ${test.name}: No data returned`);
          }
        } catch (error) {
          results[test.name] = {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            totalOptions: 0,
            expirationDates: []
          };
          console.log(`❌ ${test.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      
      // Also test the current service methods
      console.log(`🔄 Testing current service methods...`);
      const serviceResults = {};
      
      try {
        const comprehensiveData = await marketDataApiService.getOptionsChain(symbol);
        serviceResults.comprehensive = comprehensiveData ? {
          success: true,
          totalOptions: comprehensiveData.options.length,
          expirationDates: comprehensiveData.expirationDates,
          has20250926: comprehensiveData.expirationDates.includes('2025-09-26')
        } : { success: false, error: 'No data' };
      } catch (error) {
        serviceResults.comprehensive = { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
      }
      
      try {
        const snapshotData = await marketDataApiService.getOptionsChainSnapshot(symbol, '2025-09-26');
        serviceResults.snapshot20250926 = {
          success: true,
          totalOptions: snapshotData.length,
          hasData: snapshotData.length > 0
        };
      } catch (error) {
        serviceResults.snapshot20250926 = { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
      }
      
      res.json({
        symbol,
        timestamp: new Date().toISOString(),
        rawApiTests: results,
        serviceMethodTests: serviceResults,
        summary: {
          totalTests: Object.keys(results).length,
          successfulTests: Object.values(results).filter(r => r.success).length,
          allExpirations: [...new Set(Object.values(results).flatMap(r => r.expirationDates || []))].sort(),
          has20250926: Object.values(results).some(r => r.has20250926)
        }
      });
      
    } catch (error) {
      console.error(`❌ MarketData raw test failed:`, error);
      res.status(500).json({
        error: "MarketData raw test failed",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Check what's currently in the database for a symbol
  app.get("/api/debug/check-database/:symbol", async (req: any, res) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      console.log(`🔍 Checking database contents for ${symbol}...`);
      
      const { storage } = await import('../storage');
      
      // Get all data for this symbol
      const allData = await storage.getOptionsChainFromDB(symbol);
      console.log(`📊 Found ${allData.length} records for ${symbol} in database`);
      
      if (allData.length > 0) {
        const uniqueExpirations = [...new Set(allData.map(r => r.expirationDate))].sort();
        console.log(`📅 Unique expirations in database: ${uniqueExpirations.join(', ')}`);
        
        // Group by expiration
        const expirationGroups = {};
        for (const record of allData) {
          const expDate = record.expirationDate;
          if (!expirationGroups[expDate]) {
            expirationGroups[expDate] = { calls: 0, puts: 0, total: 0, sample: null };
          }
          expirationGroups[expDate].total++;
          if (record.optionType === 'call') {
            expirationGroups[expDate].calls++;
          } else {
            expirationGroups[expDate].puts++;
          }
          if (!expirationGroups[expDate].sample) {
            expirationGroups[expDate].sample = record;
          }
        }
        
        console.log(`📅 Database expiration breakdown:`);
        for (const [expDate, counts] of Object.entries(expirationGroups)) {
          console.log(`   ${expDate}: ${counts.total} total (${counts.calls} calls, ${counts.puts} puts)`);
        }
        
        res.json({
          symbol,
          success: true,
          totalRecords: allData.length,
          uniqueExpirations: uniqueExpirations,
          expirationBreakdown: expirationGroups,
          sampleRecord: allData[0] || null
        });
      } else {
        console.log(`❌ No records found for ${symbol} in database`);
        res.json({
          symbol,
          success: true,
          totalRecords: 0,
          uniqueExpirations: [],
          expirationBreakdown: {},
          message: "No records found in database"
        });
      }
      
    } catch (error) {
      console.error(`❌ Database check failed:`, error);
      res.status(500).json({
        error: "Database check failed",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Clear database and force fresh fetch from MarketData.app
  app.get("/api/debug/clear-and-fetch/:symbol", async (req: any, res) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      console.log(`🔍 CLEARING database and forcing fresh MarketData.app fetch for ${symbol}...`);
      
      const { storage } = await import('../storage');
      
      // Clear existing data
      console.log(`🗑️ Clearing existing database data for ${symbol}...`);
      const existingData = await storage.getOptionsChainFromDB(symbol);
      console.log(`📊 Found ${existingData.length} existing records for ${symbol}`);
      
      if (existingData.length > 0) {
        const { db } = await import('../db');
        const { optionsChains } = await import('../db/schema');
        const { eq } = await import('drizzle-orm');
        
        await db.delete(optionsChains).where(eq(optionsChains.symbol, symbol));
        console.log(`✅ Cleared ${existingData.length} records for ${symbol}`);
      }
      
      // Force fresh fetch
      const { optionsApiService } = await import('../optionsApiService');
      console.log(`🔄 Calling getOptionsChain for ${symbol}...`);
      const freshData = await optionsApiService.getOptionsChain(symbol);
      
      console.log(`🔍 RAW MarketData.app response:`, {
        success: !!freshData,
        hasOptions: !!freshData?.options,
        optionsCount: freshData?.options?.length || 0,
        expirationDates: freshData?.expirationDates || [],
        symbol: freshData?.symbol,
        underlyingPrice: freshData?.underlyingPrice,
        dataSource: freshData?.dataSource,
        timestamp: freshData?.timestamp
      });
      
      if (freshData && freshData.options) {
        // Save to database
        console.log(`💾 Saving fresh data to database...`);
        await storage.saveOptionsChain(symbol, freshData);
        
        // Verify what was saved
        const savedData = await storage.getOptionsChainFromDB(symbol);
        console.log(`🔍 Database verification:`, {
          totalSaved: savedData.length,
          uniqueExpirations: [...new Set(savedData.map(r => r.expirationDate))].sort(),
          sampleRecord: savedData[0] || null
        });
        
        // Group by expiration
        const expirationGroups = {};
        for (const option of freshData.options) {
          const expDate = option.expiration_date;
          if (!expirationGroups[expDate]) {
            expirationGroups[expDate] = { calls: 0, puts: 0, total: 0, sample: null };
          }
          expirationGroups[expDate].total++;
          if (option.contract_type === 'call') {
            expirationGroups[expDate].calls++;
          } else {
            expirationGroups[expDate].puts++;
          }
          if (!expirationGroups[expDate].sample) {
            expirationGroups[expDate].sample = option;
          }
        }
        
        console.log(`📅 Expiration breakdown from MarketData.app:`);
        for (const [expDate, counts] of Object.entries(expirationGroups)) {
          console.log(`   ${expDate}: ${counts.total} total (${counts.calls} calls, ${counts.puts} puts)`);
        }
        
        res.json({
          symbol,
          success: true,
          action: 'cleared_and_fetched',
          clearedRecords: existingData.length,
          rawResponse: freshData,
          expirationBreakdown: expirationGroups,
          sampleOptions: freshData.options.slice(0, 5),
          totalOptions: freshData.options.length,
          availableExpirations: freshData.expirationDates,
          databaseVerification: {
            totalSaved: savedData.length,
            uniqueExpirations: [...new Set(savedData.map(r => r.expirationDate))].sort()
          }
        });
      } else {
        console.log(`❌ No data returned from MarketData.app for ${symbol}`);
        res.json({
          symbol,
          success: false,
          action: 'cleared_but_no_data',
          clearedRecords: existingData.length,
          error: "No data returned from MarketData.app",
          rawResponse: freshData
        });
      }
      
    } catch (error) {
      console.error(`❌ Clear and fetch failed:`, error);
      res.status(500).json({
        error: "Clear and fetch failed",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Force fresh fetch from MarketData.app and show raw response
  app.get("/api/debug/force-marketdata-fetch/:symbol", async (req: any, res) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      console.log(`🔍 FORCING fresh MarketData.app fetch for ${symbol}...`);
      
      const { optionsApiService } = await import('../optionsApiService');
      
      // Force fresh fetch
      console.log(`🔄 Calling getOptionsChain for ${symbol}...`);
      const freshData = await optionsApiService.getOptionsChain(symbol);
      
      console.log(`🔍 RAW MarketData.app response:`, {
        success: !!freshData,
        hasOptions: !!freshData?.options,
        optionsCount: freshData?.options?.length || 0,
        expirationDates: freshData?.expirationDates || [],
        symbol: freshData?.symbol,
        underlyingPrice: freshData?.underlyingPrice,
        dataSource: freshData?.dataSource,
        timestamp: freshData?.timestamp
      });
      
      if (freshData && freshData.options) {
        // Group by expiration
        const expirationGroups = {};
        for (const option of freshData.options) {
          const expDate = option.expiration_date;
          if (!expirationGroups[expDate]) {
            expirationGroups[expDate] = { calls: 0, puts: 0, total: 0, sample: null };
          }
          expirationGroups[expDate].total++;
          if (option.contract_type === 'call') {
            expirationGroups[expDate].calls++;
          } else {
            expirationGroups[expDate].puts++;
          }
          if (!expirationGroups[expDate].sample) {
            expirationGroups[expDate].sample = option;
          }
        }
        
        console.log(`📅 Expiration breakdown from MarketData.app:`);
        for (const [expDate, counts] of Object.entries(expirationGroups)) {
          console.log(`   ${expDate}: ${counts.total} total (${counts.calls} calls, ${counts.puts} puts)`);
        }
        
        res.json({
          symbol,
          success: true,
          rawResponse: freshData,
          expirationBreakdown: expirationGroups,
          sampleOptions: freshData.options.slice(0, 5),
          totalOptions: freshData.options.length,
          availableExpirations: freshData.expirationDates
        });
      } else {
        console.log(`❌ No data returned from MarketData.app for ${symbol}`);
        res.json({
          symbol,
          success: false,
          error: "No data returned from MarketData.app",
          rawResponse: freshData
        });
      }
      
    } catch (error) {
      console.error(`❌ Force MarketData fetch failed:`, error);
      res.status(500).json({
        error: "Force MarketData fetch failed",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Debug what MarketData.app actually returns for any symbol
  app.get("/api/debug/marketdata-all-expirations/:symbol", async (req: any, res) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      console.log(`🔍 Debugging ALL MarketData.app expirations for ${symbol}...`);
      
      const { optionsApiService } = await import('../optionsApiService');
      
      // Get comprehensive data
      console.log(`🔄 Fetching comprehensive options chain for ${symbol}...`);
      const comprehensiveData = await optionsApiService.getOptionsChain(symbol);
      
      if (comprehensiveData && comprehensiveData.options) {
        console.log(`📊 MarketData.app comprehensive response for ${symbol}:`);
        console.log(`   Total options: ${comprehensiveData.options.length}`);
        console.log(`   Expiration dates: ${comprehensiveData.expirationDates.join(', ')}`);
        
        // Group by expiration and show counts
        const expirationGroups = {};
        for (const option of comprehensiveData.options) {
          const expDate = option.expiration_date;
          if (!expirationGroups[expDate]) {
            expirationGroups[expDate] = { calls: 0, puts: 0, total: 0 };
          }
          expirationGroups[expDate].total++;
          if (option.contract_type === 'call') {
            expirationGroups[expDate].calls++;
          } else {
            expirationGroups[expDate].puts++;
          }
        }
        
        console.log(`📅 Expiration breakdown:`);
        for (const [expDate, counts] of Object.entries(expirationGroups)) {
          console.log(`   ${expDate}: ${counts.total} total (${counts.calls} calls, ${counts.puts} puts)`);
        }
        
        res.json({
          symbol,
          success: true,
          totalOptions: comprehensiveData.options.length,
          expirationDates: comprehensiveData.expirationDates,
          expirationBreakdown: expirationGroups,
          sampleOptions: comprehensiveData.options.slice(0, 5),
          underlyingPrice: comprehensiveData.underlyingPrice,
          dataSource: comprehensiveData.dataSource,
          timestamp: comprehensiveData.timestamp
        });
      } else {
        console.log(`❌ No data returned from MarketData.app for ${symbol}`);
        res.json({
          symbol,
          success: false,
          error: "No data returned from MarketData.app",
          totalOptions: 0,
          expirationDates: [],
          expirationBreakdown: {}
        });
      }
      
    } catch (error) {
      console.error(`❌ MarketData comprehensive debug failed:`, error);
      res.status(500).json({
        error: "MarketData comprehensive debug failed",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Test database connection and schema
  app.get("/api/debug/test-database/:symbol", async (req: any, res) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      console.log(`🔍 Testing database connection and schema for ${symbol}...`);
      
      const { db } = await import('../db');
      const { optionsChains } = await import('../db/schema');
      const { eq } = await import('drizzle-orm');
      
      // Test 1: Simple select
      console.log(`🔄 Test 1: Simple select query...`);
      const existingData = await db.select().from(optionsChains).where(eq(optionsChains.symbol, symbol)).limit(5);
      console.log(`✅ Found ${existingData.length} existing records`);
      
      // Test 2: Test insert with minimal data
      console.log(`🔄 Test 2: Test insert with minimal data...`);
      const testRecord = {
        symbol: symbol,
        expirationDate: '2025-12-31',
        strike: 999.99,
        optionType: 'call' as const,
        bid: 1.0,
        ask: 1.1,
        lastPrice: 1.05,
        volume: 100,
        openInterest: 50,
        impliedVolatility: 0.25,
        delta: 0.5,
        gamma: 0.01,
        theta: -0.05,
        vega: 0.1,
      };
      
      try {
        const [insertedRecord] = await db.insert(optionsChains).values(testRecord).returning();
        console.log(`✅ Test insert successful:`, insertedRecord.id);
        
        // Clean up test record
        await db.delete(optionsChains).where(eq(optionsChains.id, insertedRecord.id));
        console.log(`✅ Test record cleaned up`);
        
        res.json({
          symbol,
          success: true,
          action: 'database_test',
          existingRecords: existingData.length,
          testInsert: 'success',
          sampleRecord: existingData[0] || null
        });
      } catch (insertError) {
        console.error(`❌ Test insert failed:`, insertError);
        res.json({
          symbol,
          success: false,
          action: 'database_test',
          existingRecords: existingData.length,
          testInsert: 'failed',
          error: insertError.message
        });
      }
      
    } catch (error) {
      console.error(`❌ Database test failed:`, error);
      res.status(500).json({
        error: "Database test failed",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Test upsert functionality directly
  app.get("/api/debug/test-upsert/:symbol", async (req: any, res) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      console.log(`🔍 Testing UPSERT functionality for ${symbol}...`);
      
      const { optionsApiService } = await import('../optionsApiService');
      const { storage } = await import('../storage');
      
      // Force fresh fetch from MarketData.app
      console.log(`🔄 Fetching fresh data from MarketData.app for ${symbol}...`);
      const freshData = await optionsApiService.getOptionsChain(symbol);
      
      if (freshData && freshData.options) {
        console.log(`📊 Got ${freshData.options.length} options from MarketData.app`);
        
        // Test the upsert method directly
        console.log(`🔄 Testing UPSERT method directly...`);
        await storage.saveOptionsChain(symbol, freshData);
        
        // Verify what was saved
        const savedData = await storage.getOptionsChainFromDB(symbol);
        console.log(`🔍 Verification: ${savedData.length} records in database after upsert`);
        
        res.json({
          symbol,
          success: true,
          action: 'upsert_test',
          marketDataCount: freshData.options.length,
          databaseCount: savedData.length,
          sampleOptions: freshData.options.slice(0, 3),
          sampleDatabaseRecords: savedData.slice(0, 3)
        });
      } else {
        res.json({
          symbol,
          success: false,
          error: "No data returned from MarketData.app",
          rawResponse: freshData
        });
      }
      
    } catch (error) {
      console.error(`❌ UPSERT test failed:`, error);
      res.status(500).json({
        error: "UPSERT test failed",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}
