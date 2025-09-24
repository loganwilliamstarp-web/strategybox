import { Express } from "express";
import { requireSupabaseAuth } from "../supabaseAuth";
import { storage } from "../storage";
import { rateLimitRules } from "../middleware/rateLimiter";

/**
 * Register options chain routes that serve data from database
 */
export function registerOptionsChainRoutes(app: Express): void {
  console.log('🔧 Registering options chain routes...');

  // Get options chain data from database (single source of truth)
  app.get("/api/options-chain/:symbol", requireSupabaseAuth, rateLimitRules.marketData, async (req: any, res) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      const expirationDate = req.query.expiration as string;
      
      console.log(`📊 Fetching options chain from database for ${symbol}${expirationDate ? ` (expiration: ${expirationDate})` : ''}`);

    // Get options chain data from database (filtered by expiration if specified)
      const optionsData = await storage.getOptionsChainFromDB(symbol, expirationDate);
    
    console.log(`📊 Retrieved ${optionsData.length} options from database for ${symbol}${expirationDate ? ` with expiration ${expirationDate}` : ''}`);
    console.log(`🔍 Database query details:`, {
      symbol,
      requestedExpiration: expirationDate,
      totalOptionsInDB: optionsData.length,
      actualExpirations: [...new Set(optionsData.map(r => r.expirationDate))].sort(),
      sampleRecord: optionsData[0] || null
    });
    
      // FORCE FRESH FETCH FOR TESTING - Always fetch fresh data
      console.log(`🔄 FORCING FRESH FETCH FOR TESTING - Always fetching fresh data for ${symbol}`);
      const needsFreshData = true; // Force fresh fetch
      
      if (needsFreshData) {
        console.log(`⚠️ No options data found in database for ${symbol}${expirationDate ? ` with expiration ${expirationDate}` : ''} - attempting to populate from API`);
        console.log(`🔍 Database check: Found ${optionsData.length} options, requested expiration: ${expirationDate}`);
        if (optionsData.length > 0) {
          const availableExpirations = [...new Set(optionsData.map(opt => opt.expirationDate))].sort();
          console.log(`🔍 Available expirations in database: ${availableExpirations.join(', ')}`);
        }
        
        // Try to populate from API if no database data exists
        try {
          const { optionsApiService } = await import('../optionsApiService');
          
          // ALWAYS fetch comprehensive data to see what expirations are actually available
          console.log(`🔄 Fetching ALL available expirations from MarketData.app for ${symbol}...`);
          
          // Test multiple API calls to see ALL available data
          const { marketDataApiService } = await import('../optionsApiService');
          const { marketDataApiService: rawApiService } = await import('../marketDataApi');
          
          console.log(`🔍 Testing RAW MarketData.app API calls for ${symbol}...`);
          
          // Test 1: No limits
          try {
            console.log(`🔄 Test 1: No limits - /v1/options/chain/${symbol}/`);
            const noLimitsData = await rawApiService.makeRequest(`/v1/options/chain/${symbol}/`);
            if (noLimitsData && noLimitsData.expiration) {
              const noLimitsExpirations = [...new Set(noLimitsData.expiration.map(ts => {
                const date = new Date(ts * 1000);
                return date.toISOString().split('T')[0];
              }))].sort();
              console.log(`✅ NO LIMITS: ${noLimitsData.optionSymbol?.length || 0} options, expirations: ${noLimitsExpirations.join(', ')}`);
              console.log(`🔍 NO LIMITS - Has 2025-09-26: ${noLimitsExpirations.includes('2025-09-26')}`);
            }
          } catch (error) {
            console.log(`❌ NO LIMITS test failed:`, error);
          }
          
          // Test 2: High limits
          try {
            console.log(`🔄 Test 2: High limits - 1000 strikes, 365 days`);
            const highLimitsData = await rawApiService.makeRequest(`/v1/options/chain/${symbol}/?strikeLimit=1000&dateLimit=365`);
            if (highLimitsData && highLimitsData.expiration) {
              const highLimitsExpirations = [...new Set(highLimitsData.expiration.map(ts => {
                const date = new Date(ts * 1000);
                return date.toISOString().split('T')[0];
              }))].sort();
              console.log(`✅ HIGH LIMITS: ${highLimitsData.optionSymbol?.length || 0} options, expirations: ${highLimitsExpirations.join(', ')}`);
              console.log(`🔍 HIGH LIMITS - Has 2025-09-26: ${highLimitsExpirations.includes('2025-09-26')}`);
            }
          } catch (error) {
            console.log(`❌ HIGH LIMITS test failed:`, error);
          }
          
          // Test 3: Current implementation
          try {
            console.log(`🔄 Test 3: Current implementation - 200 strikes, no dateLimit`);
            const currentData = await rawApiService.makeRequest(`/v1/options/chain/${symbol}/?strikeLimit=200`);
            if (currentData && currentData.expiration) {
              const currentExpirations = [...new Set(currentData.expiration.map(ts => {
                const date = new Date(ts * 1000);
                return date.toISOString().split('T')[0];
              }))].sort();
              console.log(`✅ CURRENT: ${currentData.optionSymbol?.length || 0} options, expirations: ${currentExpirations.join(', ')}`);
              console.log(`🔍 CURRENT - Has 2025-09-26: ${currentExpirations.includes('2025-09-26')}`);
            }
          } catch (error) {
            console.log(`❌ CURRENT test failed:`, error);
          }
          
          const freshOptionsChain = await optionsApiService.getOptionsChain(symbol);
          
          console.log(`🔍 RAW MarketData.app response for ${symbol}:`, {
            success: !!freshOptionsChain,
            hasOptions: !!freshOptionsChain?.options,
            optionsCount: freshOptionsChain?.options?.length || 0,
            expirationDates: freshOptionsChain?.expirationDates || [],
            symbol: freshOptionsChain?.symbol,
            underlyingPrice: freshOptionsChain?.underlyingPrice,
            dataSource: freshOptionsChain?.dataSource,
            timestamp: freshOptionsChain?.timestamp
          });
          
          if (freshOptionsChain && freshOptionsChain.options && freshOptionsChain.options.length > 0) {
            console.log(`📊 MarketData.app returned ${freshOptionsChain.options.length} total options for ${symbol}`);
            console.log(`📅 Available expirations from MarketData.app:`, freshOptionsChain.expirationDates);
            
            // Log sample options for each expiration
            for (const expDate of freshOptionsChain.expirationDates) {
              const optionsForExp = freshOptionsChain.options.filter(opt => opt.expiration_date === expDate);
              console.log(`📊 ${expDate}: ${optionsForExp.length} options (${optionsForExp.filter(o => o.contract_type === 'call').length} calls, ${optionsForExp.filter(o => o.contract_type === 'put').length} puts)`);
            }
            
            // Log sample options to see the data structure
            console.log(`🔍 Sample options from MarketData.app:`, freshOptionsChain.options.slice(0, 3));
            
            console.log(`🔄 Saving ALL expirations to database for ${symbol}...`);
            await storage.saveOptionsChain(symbol, freshOptionsChain);
            
            // Verify what was actually saved to database
            const savedData = await storage.getOptionsChainFromDB(symbol);
            console.log(`🔍 Database verification for ${symbol}:`, {
              totalSaved: savedData.length,
              uniqueExpirations: [...new Set(savedData.map(r => r.expirationDate))].sort(),
              sampleRecord: savedData[0] || null
            });
            
                  // If specific expiration was requested, check if it exists in the fresh data
                  if (expirationDate) {
                    const hasRequestedExpiration = freshOptionsChain.options.some((opt: any) => opt.expiration_date === expirationDate);
                    if (!hasRequestedExpiration) {
                      console.log(`⚠️ Requested expiration ${expirationDate} not available in MarketData.app data for ${symbol}`);
                      console.log(`📅 Available expirations from MarketData.app: ${freshOptionsChain.expirationDates.join(', ')}`);
                      
                      // Return all available expirations so frontend can show what's available
                      const allData = await storage.getOptionsChainFromDB(symbol);
                      if (allData && allData.length > 0) {
                        console.log(`📅 Returning all available expirations from database: ${[...new Set(allData.map(r => r.expirationDate))].sort().join(', ')}`);
                        return formatAndReturnOptionsData(res, symbol, allData, undefined);
                      }
                    } else {
                      console.log(`✅ Requested expiration ${expirationDate} found in MarketData.app data!`);
                    }
                  }
            
            // Retry database query with original parameters
            const retryData = await storage.getOptionsChainFromDB(symbol, expirationDate);
            if (retryData && retryData.length > 0) {
              console.log(`✅ Successfully retrieved ${retryData.length} options from database for ${symbol}${expirationDate ? ` with expiration ${expirationDate}` : ''}`);
              console.log(`🔍 Final API response data for ${symbol}:`, {
                totalOptions: retryData.length,
                requestedExpiration: expirationDate,
                actualExpirations: [...new Set(retryData.map(r => r.expirationDate))].sort(),
                sampleOptions: retryData.slice(0, 3)
              });
              return formatAndReturnOptionsData(res, symbol, retryData, expirationDate);
            }
          } else {
            console.log(`❌ No options data returned from MarketData.app for ${symbol}`);
          }
        } catch (populateError) {
          console.error(`❌ Failed to populate options data for ${symbol}:`, populateError);
        }
        
              // If still no data, try to get any available data for the symbol
              if (expirationDate) {
                console.log(`🔄 No data for specific expiration ${expirationDate}, trying to get any available data for ${symbol}`);
                const anyData = await storage.getOptionsChainFromDB(symbol);
                if (anyData && anyData.length > 0) {
                  console.log(`✅ Found ${anyData.length} options for ${symbol} with different expirations`);
                  return formatAndReturnOptionsData(res, symbol, anyData, undefined);
                }
              }
              
              return res.status(404).json({
                error: "No options data available",
                message: `No options chain data found for ${symbol}${expirationDate ? ` with expiration ${expirationDate}` : ''}`
              });
            }

            // If we have data but not for the requested expiration, return what we have
            if (expirationDate && optionsData.length > 0 && !optionsData.some(opt => opt.expirationDate === expirationDate)) {
              console.log(`⚠️ Requested expiration ${expirationDate} not found in database for ${symbol}`);
              const availableExpirations = [...new Set(optionsData.map(opt => opt.expirationDate))].sort();
              console.log(`📅 Available expirations in database: ${availableExpirations.join(', ')}`);
              console.log(`📅 Returning all available data from database`);
              return formatAndReturnOptionsData(res, symbol, optionsData, undefined);
            }
      }

      return formatAndReturnOptionsData(res, symbol, optionsData, expirationDate);

    } catch (error) {
      console.error(`❌ Failed to fetch options chain from database for ${req.params.symbol}:`, error);
      res.status(500).json({
        error: "Failed to fetch options chain from database",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Helper function to format and return options data
  function formatAndReturnOptionsData(res: any, symbol: string, optionsData: any[], expirationDate?: string) {
      // Group options by expiration date and type
      const groupedData: { [expiration: string]: { calls: any[]; puts: any[] } } = {};
      const expirationDates: string[] = [];
      const allOptions: any[] = [];

      optionsData.forEach(option => {
        if (!groupedData[option.expirationDate]) {
          groupedData[option.expirationDate] = { calls: [], puts: [] };
          if (!expirationDates.includes(option.expirationDate)) {
            expirationDates.push(option.expirationDate);
          }
        }

        const optionData = {
          strike: option.strike,
          bid: option.bid,
          ask: option.ask,
          last: option.lastPrice,
          volume: option.volume,
          openInterest: option.openInterest,
          impliedVolatility: option.impliedVolatility,
          delta: option.delta,
          gamma: option.gamma,
          theta: option.theta,
          vega: option.vega,
        expiration_date: option.expirationDate,
        contract_type: option.optionType
        };

        allOptions.push(optionData);

        if (option.optionType === 'call') {
          groupedData[option.expirationDate].calls.push(optionData);
        } else {
          groupedData[option.expirationDate].puts.push(optionData);
        }
      });

      // Sort expiration dates
      expirationDates.sort();

      const responseData = {
        symbol,
        underlyingPrice: 0, // Will be populated from ticker data
        expirationDates,
        options: allOptions,
        chains: groupedData,
        source: 'database',
        timestamp: new Date().toISOString()
      };

      console.log(`✅ Returning ${allOptions.length} options from database for ${symbol} across ${expirationDates.length} expiration dates`);

    // Add appropriate cache headers for database data
      res.set({
      'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
      'ETag': `"${symbol}-${expirationDate || 'all'}-${Date.now()}"`
      });

      res.json(responseData);
  }

  // Populate database with initial options data (for testing)
  app.post("/api/options-chain/:symbol/populate", async (req: any, res) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      console.log(`🔄 Manually populating options chain data for ${symbol}`);
      
      // Import the options API service
      const { optionsApiService } = await import('../optionsApiService');
      
      // Get fresh options data from API
      const optionsChain = await optionsApiService.getOptionsChain(symbol);
      
      if (!optionsChain || !optionsChain.options || optionsChain.options.length === 0) {
        return res.status(404).json({
          error: "No options data available from API",
          message: `No options chain data found for ${symbol} from external API`
        });
      }

      // Clear existing data for this symbol
      await storage.clearOptionsChainData(symbol);
      
      // Insert new data
      await storage.updateOptionsChainData(symbol, optionsChain.options);
      
      res.json({
        success: true,
        message: `Options chain data populated for ${symbol}`,
        optionsCount: optionsChain.options.length,
        expirations: [...new Set(optionsChain.options.map(opt => opt.expiration_date))].sort()
      });

    } catch (error) {
      console.error(`❌ Failed to populate options chain data for ${req.params.symbol}:`, error);
      res.status(500).json({
        error: "Failed to populate options chain data",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Update options chain data in database (called by background jobs)
  app.post("/api/options-chain/:symbol/update", requireSupabaseAuth, rateLimitRules.marketData, async (req: any, res) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      const optionsData = req.body;
      
      console.log(`🔄 Updating options chain in database for ${symbol}`);

      // Clear existing data for this symbol
      await storage.clearOptionsChainData(symbol);
      
      // Insert new data
      await storage.updateOptionsChainData(symbol, optionsData);
      
      res.json({
        success: true,
        message: `Options chain data updated for ${symbol}`,
        optionsCount: optionsData.length || 0
      });

    } catch (error) {
      console.error(`❌ Failed to update options chain in database for ${req.params.symbol}:`, error);
      res.status(500).json({
        error: "Failed to update options chain in database",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}
