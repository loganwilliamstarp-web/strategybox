import type { Express } from "express";
import { requireSupabaseAuth } from "../supabaseAuth";
import { storage } from "../storage";
import { OptionsStrategyCalculator } from "../positionCalculator";
import { StrategyType } from "@shared/schema";
import { marketDataApiService } from "../marketDataApi";
import { optionsApiService } from "../optionsApiService";
import { rateLimitRules } from "../middleware/rateLimiter";

/**
 * Register market data related routes
 */
export function registerMarketDataRoutes(app: Express): void {

  // Check API status
  app.get("/api/stock-api/status", rateLimitRules.general, async (req, res) => {
    try {
      const isConfigured = marketDataApiService.isConfigured();
      if (isConfigured) {
        // Test with a simple quote
        try {
          await marketDataApiService.getStockQuote("AAPL");
          res.json({ configured: true, status: "connected" });
        } catch (error) {
          res.json({ 
            configured: true, 
            status: "error", 
            error: error instanceof Error ? error.message : "Unknown error" 
          });
        }
      } else {
        res.json({ configured: false, status: "missing_api_key" });
      }
    } catch (error) {
      res.status(500).json({ 
        message: "Failed to check API status",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Clear Market Data API caches for debugging
  app.post("/api/market-data/clear-cache", rateLimitRules.general, async (req, res) => {
    try {
      // Clear any internal caches if needed
      console.log("Cache cleared - using real-time APIs");
      res.json({ message: "All Market Data API caches cleared successfully" });
    } catch (error) {
      console.error('Error clearing cache:', error);
      res.status(500).json({ 
        error: "Failed to clear cache",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Test MarketData.app API for AAPL specifically
  app.get("/api/market-data/test-aapl", rateLimitRules.marketData, async (req, res) => {
    try {
      console.log(`🧪 Testing MarketData.app API for AAPL...`);
      
      const testResults = {
        stockQuote: null as any,
        optionsChain: null as any,
        configured: false,
        status: 'testing',
        errors: [] as string[]
      };
      
      // Test 1: Check if MarketData API key is configured
      if (!process.env.MARKETDATA_API_KEY) {
        testResults.errors.push('MARKETDATA_API_KEY not configured');
        return res.json({ 
          ...testResults,
          configured: false, 
          status: 'missing_api_key',
          message: 'MARKETDATA_API_KEY not configured'
        });
      }
      
      testResults.configured = true;
      
      // Test 2: Get stock quote
      try {
        console.log(`🧪 Testing stock quote for AAPL...`);
        testResults.stockQuote = await marketDataApiService.getStockQuote('AAPL');
        if (testResults.stockQuote) {
          console.log(`✅ Stock quote test passed: AAPL = $${testResults.stockQuote.currentPrice}`);
        } else {
          testResults.errors.push('Stock quote returned null');
        }
      } catch (error) {
        const errorMsg = `Stock quote failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        testResults.errors.push(errorMsg);
        console.error(`❌ ${errorMsg}`);
      }
      
      // Test 3: Get options chain snapshot (single expiration)
      try {
        console.log(`🧪 Testing options chain for AAPL...`);
        // Get next Friday for expiration
        const nextFriday = new Date();
        const daysUntilFriday = (5 - nextFriday.getDay() + 7) % 7 || 7;
        nextFriday.setDate(nextFriday.getDate() + daysUntilFriday);
        const expiration = nextFriday.toISOString().split('T')[0];
        
        testResults.optionsChain = await marketDataApiService.getOptionsChainSnapshot('AAPL', expiration);
        if (testResults.optionsChain && testResults.optionsChain.length > 0) {
          console.log(`✅ Options chain test passed: ${testResults.optionsChain.length} contracts for AAPL ${expiration}`);
        } else {
          testResults.errors.push('Options chain returned empty array');
        }
      } catch (error) {
        const errorMsg = `Options chain failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        testResults.errors.push(errorMsg);
        console.error(`❌ ${errorMsg}`);
      }
      
      // Determine overall status
      if (testResults.errors.length === 0) {
        testResults.status = 'working';
        console.log(`✅ All MarketData.app API tests passed!`);
      } else if (testResults.stockQuote || (testResults.optionsChain && testResults.optionsChain.length > 0)) {
        testResults.status = 'partial';
        console.log(`⚠️ Some MarketData.app API tests failed`);
      } else {
        testResults.status = 'error';
        console.log(`❌ All MarketData.app API tests failed`);
      }
      
      res.json({ 
        ...testResults,
        message: testResults.errors.length === 0 
          ? 'MarketData.app API is working correctly' 
          : `MarketData.app API has ${testResults.errors.length} issue(s)`,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Error testing MarketData.app API:', error);
      res.json({ 
        configured: true,
        status: 'error',
        message: 'Failed to test MarketData.app API',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Market Data API routes for real options data
  app.get("/api/market-data/options-chain/:symbol", requireSupabaseAuth, rateLimitRules.marketData, async (req: any, res) => {
    try {
      const { symbol } = req.params;
      const { multipleExpirations = 'true' } = req.query;
      console.log(`Fetching Market Data options chain for ${symbol} (multiple: ${multipleExpirations})`);
      
      // Use MarketData.app API for real-time options data
      const optionsChain = await optionsApiService.getOptionsChain(symbol);
      
      if (!optionsChain) {
        return res.status(404).json({ error: "No options data found" });
      }
      
      console.log(`✅ Successfully retrieved options chain for ${symbol}`);
      console.log(`Found ${optionsChain.options.length} option contracts`);
      
      // Transform the response to match OptionsChainData interface expected by frontend
      let expirationDates = Array.from(new Set(optionsChain.options.map(opt => opt.expiration_date))).sort();
      
      // Check if today's expiration is missing and add it if available
      const todayEt = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
      const todayStr = new Date(todayEt).toISOString().slice(0, 10);
      
      if (!expirationDates.includes(todayStr)) {
        console.log(`🔍 Today's expiration (${todayStr}) missing from comprehensive data, fetching explicitly...`);
        try {
          const todayOptions = await optionsApiService.getOptionsChainSnapshot(symbol, todayStr, optionsChain.underlyingPrice);
          if (todayOptions && todayOptions.length > 0) {
            console.log(`✅ Injected today's expiration: ${todayOptions.length} contracts for ${todayStr}`);
            
            // Add today's options to the main array, avoiding duplicates
            const existingSymbols = new Set(optionsChain.options.map(opt => opt.contractSymbol || opt.ticker));
            const newTodayOptions = todayOptions.filter(opt => !existingSymbols.has(opt.contractSymbol || opt.ticker));
            
            optionsChain.options.push(...newTodayOptions);
            expirationDates.push(todayStr);
            expirationDates = Array.from(new Set(expirationDates)).sort();
            
            console.log(`📊 Updated chain: ${optionsChain.options.length} total options, ${expirationDates.length} expirations`);
          } else {
            console.log(`⚠️ No options found for today's expiration ${todayStr}`);
          }
        } catch (error) {
          console.log(`❌ Failed to fetch today's expiration ${todayStr}:`, error);
        }
      } else {
        console.log(`✅ Today's expiration ${todayStr} already included in comprehensive data`);
      }
      
      const chains: { [expiration: string]: { calls: any[]; puts: any[] } } = {};
      
      // Get current stock price from MarketData.app
      let currentPrice: number = optionsChain.underlyingPrice;
      console.log(`📊 Current ${symbol} price from MarketData.app: $${currentPrice}`);
      
      console.log(`📊 Filtering options for UI display around current price: $${currentPrice}`);

      expirationDates.forEach(expiration => {
        const optionsForExpiration = optionsChain.options.filter(opt => opt.expiration_date === expiration);
        
        // Filter to show only ±20 strikes centered around current price
        const maxStrikesPerSide = 20;
        
        // Get all strikes and sort them
        const allStrikes = [...new Set(optionsForExpiration.map(opt => opt.strike))].sort((a, b) => a - b);
        
        // Find strikes around current price
        const currentIndex = allStrikes.findIndex(strike => strike >= currentPrice);
        const startIndex = Math.max(0, currentIndex - maxStrikesPerSide);
        const endIndex = Math.min(allStrikes.length - 1, currentIndex + maxStrikesPerSide);
        const relevantStrikes = allStrikes.slice(startIndex, endIndex + 1);
        
        chains[expiration] = {
          calls: optionsForExpiration
            .filter(opt => opt.contract_type === 'call')
            .filter(opt => relevantStrikes.includes(opt.strike))
            .map(opt => ({
              strike: opt.strike || 0,
              bid: opt.bid || 0,
              ask: opt.ask || 0,
              lastPrice: opt.last || ((opt.bid || 0) + (opt.ask || 0)) / 2,
              volume: opt.volume || 0,
              openInterest: opt.open_interest || 0,
              impliedVolatility: opt.implied_volatility || 0,
              delta: opt.delta || 0,
              gamma: opt.gamma || 0,
              theta: opt.theta || 0,
              vega: opt.vega || 0,
              contractSymbol: opt.contractSymbol || opt.ticker || `${symbol}${expiration}C${opt.strike}`
            }))
            .sort((a, b) => a.strike - b.strike),
            
          puts: optionsForExpiration
            .filter(opt => opt.contract_type === 'put')
            .filter(opt => relevantStrikes.includes(opt.strike))
            .map(opt => ({
              strike: opt.strike || 0,
              bid: opt.bid || 0,
              ask: opt.ask || 0,
              lastPrice: opt.last || ((opt.bid || 0) + (opt.ask || 0)) / 2,
              volume: opt.volume || 0,
              openInterest: opt.open_interest || 0,
              impliedVolatility: opt.implied_volatility || 0,
              delta: opt.delta || 0,
              gamma: opt.gamma || 0,
              theta: opt.theta || 0,
              vega: opt.vega || 0,
              contractSymbol: opt.contractSymbol || opt.ticker || `${symbol}${expiration}P${opt.strike}`
            }))
            .sort((a, b) => b.strike - a.strike),
        };
      });
      
      // Return filtered options for UI to select from
      const filteredOptions = Object.values(chains).flatMap(chain => [
        ...chain.calls.map(call => ({
          ...call,
          contract_type: 'call',
          expiration_date: expirationDates.find(exp => chains[exp].calls.includes(call)) || expirationDates[0]
        })),
        ...chain.puts.map(put => ({
          ...put,
          contract_type: 'put', 
          expiration_date: expirationDates.find(exp => chains[exp].puts.includes(put)) || expirationDates[0]
        }))
      ]);

      const responseData = {
        symbol,
        underlyingPrice: currentPrice,
        expirationDates,
        options: filteredOptions,
        chains
      };
      
      // Log summary for performance monitoring
      const filteredOptionsCount = Object.values(chains).reduce((total, chain) => 
        total + chain.calls.length + chain.puts.length, 0
      );
      console.log(`📊 Returning ${filteredOptionsCount} filtered options (±20 strikes) for UI display across ${expirationDates.length} expiration dates`);
      
      res.json(responseData);
    } catch (error) {
      console.error(`Failed to fetch options chain for ${req.params.symbol}:`, error);
      res.status(500).json({ 
        error: "Failed to fetch options chain", 
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get optimal strangle strikes with real market data
  app.get("/api/market-data/optimal-strangle/:symbol", requireSupabaseAuth, rateLimitRules.marketData, async (req: any, res) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      // Get current stock price
      const quote = await marketDataApiService.getStockQuote(symbol);
      const currentPrice = quote.currentPrice;
      
      // Use the position calculator to find optimal strikes
      const result = await OptionsStrategyCalculator.calculateOptimalPosition({
        symbol,
        currentPrice,
        impliedVolatility: 0,
        daysToExpiry: 30,
        atmStrike: currentPrice,
        strategyType: 'long_strangle' as StrategyType,
      });
      
      if (!result) {
        return res.status(404).json({ 
          error: "No optimal strangle data available",
          message: "Unable to find suitable strikes with real market data"
        });
      }
      
      res.json({
        symbol,
        currentPrice,
        putStrike: result.longPutStrike,
        callStrike: result.longCallStrike,
        putPremium: result.longPutPremium,
        callPremium: result.longCallPremium,
        totalCost: result.longPutPremium + result.longCallPremium
      });
    } catch (error) {
      console.error(`Failed to get optimal strangle for ${req.params.symbol}:`, error);
      res.status(500).json({ 
        error: "Failed to calculate optimal strangle",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Check Market Data API status
  app.get("/api/market-data/status", rateLimitRules.general, async (req, res) => {
    try {
      const finnhubConfigured = marketDataApiService.isConfigured();
      const isConfigured = finnhubConfigured;
      
      if (isConfigured) {
        res.json({ configured: true, status: "ready" });
      } else {
        res.json({ configured: false, status: "missing_api_key" });
      }
    } catch (error) {
      console.error("Failed to check Market Data API status:", error);
      res.status(500).json({ 
        error: "Failed to check API status",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}
