// Debug endpoint to see raw ticker data
import type { Express } from "express";
import { requireAuth } from "../auth";
import { storage } from "../storage";
import { marketDataApiService } from "../marketDataApi";

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
}
