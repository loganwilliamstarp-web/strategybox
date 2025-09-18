import type { InsertLongStranglePosition, OptionsChainData, StrategyType } from "@shared/schema";
import { strategyTypes } from "@shared/schema";

export interface OptionsCalculationInputs {
  strategyType: StrategyType;
  currentPrice: number;
  putStrike?: number;
  callStrike?: number;
  putPremium?: number;
  callPremium?: number;
  // Additional strikes for complex strategies
  shortPutStrike?: number;
  shortCallStrike?: number;
  shortPutPremium?: number;
  shortCallPremium?: number;
  impliedVolatility?: number;
  ivPercentile?: number;
  atmStrike?: number;
  daysToExpiry?: number;
  expirationDate?: string;
  shortExpiration?: string;
  useRealMarketPremiums?: boolean;
  symbol?: string;
  optionsChain?: OptionsChainData;  // Added for MarketData.app integration
}

export interface OptionsCalculationResult {
  strategyType: StrategyType;
  longPutStrike: number;
  longCallStrike: number;
  longPutPremium: number;
  longCallPremium: number;
  // Additional strikes for complex strategies
  shortPutStrike?: number;
  shortCallStrike?: number;
  shortPutPremium?: number;
  shortCallPremium?: number;
  // P&L calculations
  lowerBreakeven: number;
  upperBreakeven: number;
  maxLoss: number;
  maxProfit?: number;
  atmValue: number;
  impliedVolatility: number;
  ivPercentile: number;
  daysToExpiry: number;
  expirationDate: string;
  longExpiration?: string;
  shortExpiration?: string;
}

// Type definitions for strangle calculations
export interface StrangleCalculationInputs {
  strategyType: StrategyType;
  currentPrice: number;
  putStrike?: number;
  callStrike?: number;
  putPremium?: number;
  callPremium?: number;
  impliedVolatility?: number;
  ivPercentile?: number;
  atmStrike?: number;
  daysToExpiry?: number;
  expirationDate?: string;
  useRealMarketPremiums?: boolean;
  symbol?: string;
}

export interface StrangleCalculationResult {
  longPutStrike: number;
  longCallStrike: number;
  longPutPremium: number;
  longCallPremium: number;
  lowerBreakeven: number;
  upperBreakeven: number;
  maxLoss: number;
  atmValue: number;
  impliedVolatility: number;
  ivPercentile: number;
  daysToExpiry: number;
  expirationDate: string;
}

/**
 * Unified long strangle position calculator
 * Ensures consistent calculations across the entire application
 */
export class LongStrangleCalculator {
  
  /**
   * Calculate days to expiry from expiration date
   */
  private static calculateDaysToExpiry(expirationDate: string): number {
    const today = new Date();
    const expiry = new Date(expirationDate);
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  }

  /**
   * Calculate expected move for a position
   */
  private static calculateExpectedMove(currentPrice: number, impliedVolatility: number, daysToExpiry: number): {
    weeklyLow: number;
    weeklyHigh: number;
    dailyMove: number;
    weeklyMove: number;
    movePercentage: number;
  } {
    // Check if IV is already in decimal form (0.2) or percentage form (20)
    const ivDecimal = impliedVolatility > 1 ? impliedVolatility / 100 : impliedVolatility;
    
    // Handle edge cases for performance  
    if (impliedVolatility <= 0 || currentPrice <= 0) {
      return {
        weeklyLow: currentPrice * 0.95,
        weeklyHigh: currentPrice * 1.05,
        dailyMove: currentPrice * 0.01,
        weeklyMove: currentPrice * 0.05,
        movePercentage: 5.0
      };
    }
    
    // Calculate expected daily move using Black-Scholes formula
    const dailyVolatility = ivDecimal / Math.sqrt(365);
    const dailyMove = currentPrice * dailyVolatility;
    
    // Calculate expected weekly move (7 days)
    const weeklyVolatility = ivDecimal * Math.sqrt(7 / 365);
    const weeklyMove = currentPrice * weeklyVolatility;
    
    // Calculate price range
    const weeklyLow = currentPrice - weeklyMove;
    const weeklyHigh = currentPrice + weeklyMove;
    const movePercentage = (weeklyMove / currentPrice) * 100;
    
    return {
      weeklyLow: Math.round(weeklyLow * 100) / 100,
      weeklyHigh: Math.round(weeklyHigh * 100) / 100,
      dailyMove: Math.round(dailyMove * 100) / 100,
      weeklyMove: Math.round(weeklyMove * 100) / 100,
      movePercentage: Math.round(movePercentage * 100) / 100
    };
  }
  
  /**
   * Get optimal strikes from real market data, adjusted for expiration date
   */
  static async getOptimalStrikesFromChain(
    symbol: string,
    currentPrice: number,
    storage: any,
    expirationDate?: string
  ): Promise<{ putStrike: number; callStrike: number; putPremium: number; callPremium: number; impliedVolatility: number; ivPercentile: number; expectedMove: any; callIV: number; putIV: number } | null> {
    try {
      const { optionsApiService } = await import('./optionsApiService');
      
      console.log(`🎯 Finding optimal strikes for ${symbol} using MarketData.app...`);
      
      // Get fresh options chain with real market data for specific expiration date
      let optionsChain;
      if (expirationDate) {
        // For specific expiration dates, get fresh data to ensure accurate premiums
        console.log(`🎯 Fetching FRESH options data for specific expiration: ${expirationDate}`);
        optionsChain = await optionsApiService.getOptionsChainSnapshot(symbol, expirationDate, currentPrice);
        
        // Convert to expected format if we got specific expiration data
        if (optionsChain && optionsChain.length > 0) {
          optionsChain = {
            options: optionsChain,
            underlyingPrice: currentPrice
          };
        } else {
          // Fallback to comprehensive chain
          console.log(`⚠️ No specific data for ${expirationDate}, falling back to comprehensive chain`);
          optionsChain = await optionsApiService.getOptionsChain(symbol, currentPrice);
        }
      } else {
        // Use comprehensive chain for general requests
        optionsChain = await optionsApiService.getOptionsChain(symbol, currentPrice);
      }
      
      if (!optionsChain || !optionsChain.options || optionsChain.options.length === 0) {
        console.log(`❌ No options chain data available for ${symbol}`);
        return null;
      }
      
      console.log(`📊 Processing ${optionsChain.options.length} real options for ${symbol} at $${currentPrice}`);
      
      // Filter by expiration date if provided, otherwise use all options
      let filteredOptions = optionsChain.options;
      if (expirationDate) {
        // Debug: Log first few expiration dates to verify field names
        const firstFewExpirations = optionsChain.options.slice(0, 3).map(opt => ({
          expirationDate: opt.expirationDate,
          expiration_date: opt.expiration_date
        }));
        console.log(`🔍 FIELD DEBUG: First 3 expiration fields:`, firstFewExpirations);
        console.log(`🔍 FILTER DEBUG: Looking for expiration = ${expirationDate}`);
        
        filteredOptions = optionsChain.options.filter(opt => (opt.expirationDate || opt.expiration_date) === expirationDate);
        
        if (filteredOptions.length === 0) {
          console.log(`⚠️ No options found for ${symbol} expiration ${expirationDate}, using all available options`);
          filteredOptions = optionsChain.options;
        } else {
          console.log(`🎯 FIXED: Filtered to ${filteredOptions.length} options for expiration ${expirationDate}`);
        }
      }
      
      // Separate calls and puts
      const calls = filteredOptions.filter(opt => opt.contract_type === 'call').sort((a, b) => a.strike - b.strike);
      const puts = filteredOptions.filter(opt => opt.contract_type === 'put').sort((a, b) => a.strike - b.strike);
      
      console.log(`📈 Found ${calls.length} calls, ${puts.length} puts`);
      
      if (calls.length === 0 || puts.length === 0) {
        console.log(`❌ Missing calls or puts for ${symbol}`);
        return null;
      }
      
      // Calculate days to expiry for strike selection adjustment
      const daysToExpiry = expirationDate ? this.calculateDaysToExpiry(expirationDate) : 30;
      
      // Find optimal OTM strikes based on expiration - closer strikes for shorter expirations
      const callsAbovePrice = calls.filter(call => call.strike >= currentPrice + 1);
      const putsBelowPrice = puts.filter(put => put.strike <= currentPrice - 1).reverse(); // Reverse to get highest strikes first
      
      if (callsAbovePrice.length === 0 || putsBelowPrice.length === 0) {
        console.log(`❌ No suitable OTM options available for ${symbol}`);
        return null;
      }
      
      // Adjust strike selection based on expiration
      let callStrike: number;
      let putStrike: number;
      
      // Use realistic strike increments based on stock price
      let strikeIncrement: number;
      if (currentPrice < 50) {
        strikeIncrement = 1; // $1 increments for low-priced stocks
      } else if (currentPrice < 200) {
        strikeIncrement = 2.5; // $2.50 increments for mid-priced stocks
      } else {
        strikeIncrement = 5; // $5 increments for high-priced stocks
      }
      
      // Find the nearest strikes above and below current price
      const basePutStrike = Math.floor(currentPrice / strikeIncrement) * strikeIncrement;
      const baseCallStrike = Math.ceil(currentPrice / strikeIncrement) * strikeIncrement;
      
      // Ensure call is at least $1 above current price and put is at least $1 below
      let targetPutStrike = basePutStrike >= currentPrice - 1 ? basePutStrike - strikeIncrement : basePutStrike;
      let targetCallStrike = baseCallStrike <= currentPrice + 1 ? baseCallStrike + strikeIncrement : baseCallStrike;
      
      // Double-check minimum $1 separation
      while (targetPutStrike >= currentPrice - 1) {
        targetPutStrike -= strikeIncrement;
      }
      while (targetCallStrike <= currentPrice + 1) {
        targetCallStrike += strikeIncrement;
      }
      
      // Assign final values
      putStrike = targetPutStrike;
      callStrike = targetCallStrike;
      
      console.log(`🎯 REALISTIC STRIKES: Price $${currentPrice} → Target Call $${callStrike}, Target Put $${putStrike} (${strikeIncrement} increment)`);
      
      // Find the target strikes in the options chain, stepping outward if not found
      let callFound = callsAbovePrice.find(c => c.strike === callStrike);
      let putFound = putsBelowPrice.find(p => p.strike === putStrike);
      
      // Step outward in increments until we find available strikes
      let callSearchStrike = callStrike;
      let putSearchStrike = putStrike;
      
      while (!callFound && callSearchStrike <= currentPrice + 50) { // Max search $50 above
        callFound = callsAbovePrice.find(c => c.strike === callSearchStrike);
        if (!callFound) callSearchStrike += strikeIncrement;
      }
      
      while (!putFound && putSearchStrike >= currentPrice - 50) { // Max search $50 below
        putFound = putsBelowPrice.find(p => p.strike === putSearchStrike);
        if (!putFound) putSearchStrike -= strikeIncrement;
      }
      
      const finalCallStrike = callFound?.strike;
      const finalPutStrike = putFound?.strike;
      
      if (!finalCallStrike || !finalPutStrike) {
        console.log(`❌ Could not find suitable strikes for ${symbol} with ${daysToExpiry} days to expiry`);
        return null;
      }
      
      // Assign final values
      callStrike = finalCallStrike;
      putStrike = finalPutStrike;
      
      // Get premiums for selected strikes
      const selectedCall = calls.find(c => c.strike === callStrike);
      const selectedPut = puts.find(p => p.strike === putStrike);
      
      if (!selectedCall || !selectedPut) {
        console.log(`❌ Could not find premium data for selected strikes`);
        return null;
      }
      
      const callPremium = (selectedCall.bid + selectedCall.ask) / 2 || selectedCall.last;
      const putPremium = (selectedPut.bid + selectedPut.ask) / 2 || selectedPut.last;
      
      // Extract implied volatility from selected contracts (check both field names)
      const callIV = selectedCall.impliedVolatility || selectedCall.implied_volatility || 0;
      const putIV = selectedPut.impliedVolatility || selectedPut.implied_volatility || 0;
      
      // Calculate average implied volatility (convert from decimal to percentage)
      const averageIV = ((callIV + putIV) / 2) * 100;
      
      // Calculate IV percentile based on the distribution of IV across all options in the chain
      const ivPercentile = this.calculateIVPercentileFromChain(averageIV / 100, filteredOptions);
      
      // Calculate expected move for this position
      const expectedMove = this.calculateExpectedMove(currentPrice, averageIV, daysToExpiry);
      
      console.log(`✅ MARKETDATA.APP STRIKES FOR ${symbol} (expiration-optimized, ${daysToExpiry}d):`);
      console.log(`   Put Strike: ${putStrike} @ $${putPremium} (IV: ${(putIV * 100).toFixed(1)}%)`);
      console.log(`   Call Strike: ${callStrike} @ $${callPremium} (IV: ${(callIV * 100).toFixed(1)}%)`);
      console.log(`   Average IV: ${averageIV.toFixed(1)}% (${ivPercentile}th percentile)`);
      console.log(`   Expected Weekly Range: $${expectedMove.weeklyLow.toFixed(2)} - $${expectedMove.weeklyHigh.toFixed(2)}`);
      
      return {
        putStrike,
        callStrike,
        putPremium,
        callPremium,
        impliedVolatility: averageIV,
        ivPercentile,
        expectedMove,
        // Individual leg IV data for accurate display
        callIV: callIV * 100,  // Convert to percentage
        putIV: putIV * 100     // Convert to percentage
      };
    } catch (error) {
      console.log(`⚠️ MarketData.app options chain error for ${symbol}:`, error instanceof Error ? error.message : 'Unknown error');
      return null;
    }
  }

  /**
   * Get optimal Iron Condor strikes from real MarketData.app options chain data
   * Iron Condor: Long Put (far OTM) + Short Put (closer) + Short Call (closer) + Long Call (far OTM)
   */
  static async getIronCondorStrikesFromChain(
    symbol: string,
    currentPrice: number
  ): Promise<{
    longPutStrike: number; shortPutStrike: number;
    shortCallStrike: number; longCallStrike: number;
    longPutPremium: number; shortPutPremium: number;
    shortCallPremium: number; longCallPremium: number;
  } | null> {
    try {
      const { optionsApiService } = await import('./optionsApiService');
      
      console.log(`🦅 Finding Iron Condor strikes for ${symbol} using MarketData.app...`);
      
      // Get full options chain with real market data from MarketData.app
      const optionsChain = await optionsApiService.getOptionsChain(symbol, currentPrice);
      
      if (!optionsChain || !optionsChain.options || optionsChain.options.length === 0) {
        console.log(`❌ No options chain data available for ${symbol}`);
        return null;
      }
      
      console.log(`📊 Processing ${optionsChain.options.length} real options for Iron Condor on ${symbol} at $${currentPrice}`);
      
      // Separate calls and puts
      const calls = optionsChain.options.filter(opt => opt.contract_type === 'call').sort((a, b) => a.strike - b.strike);
      const puts = optionsChain.options.filter(opt => opt.contract_type === 'put').sort((a, b) => a.strike - b.strike);
      
      if (calls.length < 4 || puts.length < 4) {
        console.log(`❌ Insufficient options for Iron Condor on ${symbol} (need 4+ calls and 4+ puts)`);
        return null;
      }
      
      // Iron Condor strike selection (for ~$5-10 wide spreads)
      const callsAbovePrice = calls.filter(call => call.strike >= currentPrice);
      const putsBelowPrice = puts.filter(put => put.strike <= currentPrice).reverse(); // Reverse to get highest strikes first
      
      if (callsAbovePrice.length < 2 || putsBelowPrice.length < 2) {
        console.log(`❌ Insufficient OTM options for Iron Condor on ${symbol}`);
        return null;
      }
      
      // Select strikes for a balanced Iron Condor
      const shortCallStrike = callsAbovePrice[0]?.strike; // First call above price (short call)
      const longCallStrike = callsAbovePrice[1]?.strike;  // Second call above price (long call)
      const shortPutStrike = putsBelowPrice[0]?.strike;   // First put below price (short put)
      const longPutStrike = putsBelowPrice[1]?.strike;    // Second put below price (long put)
      
      if (!shortCallStrike || !longCallStrike || !shortPutStrike || !longPutStrike) {
        console.log(`❌ Could not find all required strikes for Iron Condor on ${symbol}`);
        return null;
      }
      
      // Get premiums for all 4 strikes
      const shortCall = calls.find(c => c.strike === shortCallStrike);
      const longCall = calls.find(c => c.strike === longCallStrike);
      const shortPut = puts.find(p => p.strike === shortPutStrike);
      const longPut = puts.find(p => p.strike === longPutStrike);
      
      if (!shortCall || !longCall || !shortPut || !longPut) {
        console.log(`❌ Could not find premium data for Iron Condor strikes on ${symbol}`);
        return null;
      }
      
      const shortCallPremium = (shortCall.bid + shortCall.ask) / 2 || shortCall.last;
      const longCallPremium = (longCall.bid + longCall.ask) / 2 || longCall.last;
      const shortPutPremium = (shortPut.bid + shortPut.ask) / 2 || shortPut.last;
      const longPutPremium = (longPut.bid + longPut.ask) / 2 || longPut.last;
      
      console.log(`✅ IRON CONDOR STRIKES FOR ${symbol}:`);
      console.log(`   Long Put: ${longPutStrike} @ $${longPutPremium} (buy)`);
      console.log(`   Short Put: ${shortPutStrike} @ $${shortPutPremium} (sell)`);
      console.log(`   Short Call: ${shortCallStrike} @ $${shortCallPremium} (sell)`);
      console.log(`   Long Call: ${longCallStrike} @ $${longCallPremium} (buy)`);
      
      return {
        longPutStrike,
        shortPutStrike,
        shortCallStrike,
        longCallStrike,
        longPutPremium,
        shortPutPremium,
        shortCallPremium,
        longCallPremium
      };
    } catch (error) {
      console.log(`⚠️ Iron Condor chain error for ${symbol}:`, error instanceof Error ? error.message : 'Unknown error');
      return null;
    }
  }

  /**
   * Fetch real market premiums from Alpha Vantage API for accurate long strangle calculations
   */
  static async getRealMarketPremiums(
    symbol: string, 
    putStrike: number, 
    callStrike: number, 
    storage: any
  ): Promise<{ putPremium: number; callPremium: number } | null> {
    try {
      console.log(`🔍 Fetching real premiums for ${symbol} put:${putStrike} call:${callStrike}`);
      
      console.log(`⚠️ Alpha Vantage not available, using storage fallback`);
      
      // Fallback to stored options chain data
      const optionsChain: OptionsChainData = await storage.getOptionsChain(symbol);
      
      if (!optionsChain.chains || Object.keys(optionsChain.chains).length === 0) {
        return null;
      }
      
      // Use the first available expiration date
      const firstExpiration = optionsChain.expirationDates[0];
      const chain = optionsChain.chains[firstExpiration];
      
      if (!chain) {
        return null;
      }
      
      // Find matching put option
      const putOption = chain.puts.find(put => put.strike === putStrike);
      const putPremium = putOption ? (putOption.bid + putOption.ask) / 2 : null;
      
      // Find matching call option
      const callOption = chain.calls.find(call => call.strike === callStrike);
      const callPremium = callOption ? (callOption.bid + callOption.ask) / 2 : null;
      
      if (putPremium !== null && callPremium !== null) {
        console.log(`✅ Storage fallback premiums: put=${putPremium}, call=${callPremium}`);
        return {
          putPremium: Math.round(putPremium * 100) / 100, // Round to 2 decimal places (per-share)
          callPremium: Math.round(callPremium * 100) / 100 // Round to 2 decimal places (per-share)
        };
      }
      
      return null;
    } catch (error) {
      console.error(`Failed to fetch real market premiums for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Get real market premiums for custom strikes
   */
  private static async getRealPremiumsForCustomStrikes(
    symbol: string,
    putStrike: number,
    callStrike: number,
    expirationDate: string,
    optionsApiService: any
  ): Promise<{ putPremium: number; callPremium: number } | null> {
    try {
      console.log(`🎯 Fetching real premiums for custom strikes: ${symbol} Put ${putStrike}, Call ${callStrike}, Expiration ${expirationDate}`);
      
      // Get options chain data for the specific expiration date
      const optionsChain = await optionsApiService.getOptionsChainSnapshot(symbol, expirationDate);
      
      if (!optionsChain || optionsChain.length === 0) {
        console.log(`❌ No options data for custom strikes on ${symbol}`);
        return null;
      }
      
      // Find the specific put and call contracts
      const putContract = optionsChain.find((opt: any) => 
        opt.contract_type === 'put' && opt.strike === putStrike
      );
      const callContract = optionsChain.find((opt: any) => 
        opt.contract_type === 'call' && opt.strike === callStrike
      );
      
      if (!putContract || !callContract) {
        console.log(`❌ Could not find custom strike contracts for ${symbol} Put ${putStrike} or Call ${callStrike}`);
        return null;
      }
      
      const putPremium = (putContract.bid + putContract.ask) / 2 || putContract.last;
      const callPremium = (callContract.bid + callContract.ask) / 2 || callContract.last;
      
      console.log(`✅ Custom strike premiums: Put ${putStrike}@$${putPremium}, Call ${callStrike}@$${callPremium}`);
      
      return {
        putPremium: Math.round(putPremium * 100) / 100,
        callPremium: Math.round(callPremium * 100) / 100
      };
    } catch (error) {
      console.error(`Failed to get custom strike premiums for ${symbol}:`, error);
      return null;
    }
  }
  
  /**
   * Calculate a complete long strangle position using real market options chain data
   * Prioritizes custom strikes when available and within the same expiration cycle
   */
  static async calculatePositionWithRealPremiums(
    inputs: StrangleCalculationInputs, 
    storage: any,
    existingPosition?: any // Pass existing position to check for custom strikes
  ): Promise<StrangleCalculationResult> {
    console.log(`🚀 STARTING calculatePositionWithRealPremiums for ${inputs.symbol}`, {
      useRealMarketPremiums: inputs.useRealMarketPremiums,
      symbol: inputs.symbol,
      currentPrice: inputs.currentPrice
    });
    
    // PRIORITY 1: Check for custom strikes if position exists and they're for current expiration cycle
    if (existingPosition && existingPosition.customCallStrike && existingPosition.customPutStrike && existingPosition.expirationCycleForCustomStrikes) {
      const currentExpirationDate = inputs.expirationDate || this.getNextOptionsExpiration().date;
      
      if (existingPosition.expirationCycleForCustomStrikes === currentExpirationDate) {
        console.log(`✅ USING CUSTOM STRIKES for ${inputs.symbol}: Put ${existingPosition.customPutStrike}, Call ${existingPosition.customCallStrike} (cycle: ${currentExpirationDate})`);
        
        // Get real market premiums for the custom strikes
        const { optionsApiService } = await import('./optionsApiService');
        try {
          const customStrikePremiums = await this.getRealPremiumsForCustomStrikes(
            inputs.symbol!,
            existingPosition.customPutStrike,
            existingPosition.customCallStrike,
            currentExpirationDate,
            optionsApiService
          );
          
          if (customStrikePremiums) {
            return this.calculatePosition({
              ...inputs,
              putStrike: existingPosition.customPutStrike,
              callStrike: existingPosition.customCallStrike,
              putPremium: customStrikePremiums.putPremium,
              callPremium: customStrikePremiums.callPremium
            });
          }
        } catch (error) {
          console.log(`⚠️ Failed to get premiums for custom strikes, falling back to automatic selection`);
        }
      } else {
        console.log(`🔄 Custom strikes are for expired cycle ${existingPosition.expirationCycleForCustomStrikes}, using automatic selection for ${currentExpirationDate}`);
      }
    }
    
    // PRIORITY 2: Automatic strike selection using MarketData.app
    // If real market data requested and symbol provided, try multiple data sources
    if (inputs.useRealMarketPremiums && inputs.symbol && inputs.currentPrice) {
      
      // Use MarketData.app for real options chain data
      const { optionsApiService } = await import('./optionsApiService');
      console.log(`🔍 MARKETDATA.APP: Fetching data for Symbol=${inputs.symbol}, Price=${inputs.currentPrice}`);
      
      console.log(`📡 Attempting to fetch optimal strikes from MarketData.app for ${inputs.symbol}...`);
      const realData = await LongStrangleCalculator.getOptimalStrikesFromChain(
        inputs.symbol,
        inputs.currentPrice,
        storage,
        inputs.expirationDate
      );
      
      if (realData) {
        console.log(`✅ USING MARKETDATA.APP (contract-based): ${inputs.symbol} Put ${realData.putStrike}=$${realData.putPremium} per contract, Call ${realData.callStrike}=$${realData.callPremium} per contract`);
        
        return this.calculatePosition({
          ...inputs,
          putStrike: realData.putStrike,
          callStrike: realData.callStrike,
          putPremium: realData.putPremium,
          callPremium: realData.callPremium
        });
      } else {
        console.log(`❌ MarketData.app returned no data for ${inputs.symbol}`);
        throw new Error(`No real market data available for ${inputs.symbol} options`);
      }
    }
    
    // No fallback to synthetic data - require real market data only
    console.log(`❌ No real market data source available for ${inputs.symbol || 'position'}`);
    throw new Error(`Cannot calculate position without real market data for ${inputs.symbol}`);
  }

  /**
   * Calculate a complete long strangle position with consistent logic and correct mathematics
   */
  static calculatePosition(inputs: StrangleCalculationInputs): StrangleCalculationResult {
    const {
      currentPrice,
      putStrike,
      callStrike,
      putPremium,
      callPremium,
      impliedVolatility,
      daysToExpiry,
      expirationDate
    } = inputs;

    // Use provided strikes if available, otherwise calculate first OTM strikes
    const calculatedPutStrike = putStrike ?? this.calculateFirstOTMPutStrike(currentPrice);
    const calculatedCallStrike = callStrike ?? this.calculateFirstOTMCallStrike(currentPrice);
    
    // Premium calculations - standardize to per-share internally
    let putPremiumPerShare: number;
    let callPremiumPerShare: number;
    
    if (putPremium !== undefined && callPremium !== undefined) {
      // Premiums from real MarketData.app market data - use directly 
      // MarketData.app returns per-share premiums, so use directly
      putPremiumPerShare = putPremium;
      callPremiumPerShare = callPremium;
      console.log(`✅ USING REAL MARKETDATA.APP PREMIUMS: Put=${putPremiumPerShare}, Call=${callPremiumPerShare} (per-share)`);
    } else {
      // REMOVED: No more theoretical pricing - require real market data
      console.log(`❌ THEORETICAL PRICING DISABLED: Must provide real market premiums for ${currentPrice}`);
      throw new Error('Real market data required - no theoretical pricing available');
    }
    
    // Calculate total premium per share (for breakeven calculations)
    const totalPremiumPerShare = putPremiumPerShare + callPremiumPerShare;
    
    // Breakeven calculations (mathematically correct)
    const lowerBreakeven = calculatedPutStrike - totalPremiumPerShare;
    const upperBreakeven = calculatedCallStrike + totalPremiumPerShare;
    
    // Max loss calculation (convert per-share to per-contract)
    const maxLossPerContract = totalPremiumPerShare * 100;
    
    // Default values for time and volatility
    const defaultDaysToExpiry = daysToExpiry ?? this.getDefaultDaysToExpiry();
    const defaultImpliedVol = impliedVolatility ?? this.estimateImpliedVolatility(currentPrice);
    const defaultExpiration = expirationDate ?? this.getNextOptionsExpiration().date;
    
    const result = {
      longPutStrike: Math.round(calculatedPutStrike * 100) / 100,
      longCallStrike: Math.round(calculatedCallStrike * 100) / 100,
      longPutPremium: Math.round(putPremiumPerShare * 100) / 100,
      longCallPremium: Math.round(callPremiumPerShare * 100) / 100,
      lowerBreakeven: Math.round(lowerBreakeven * 100) / 100,
      upperBreakeven: Math.round(upperBreakeven * 100) / 100,
      maxLoss: Math.round(maxLossPerContract * 100) / 100,
      atmValue: Math.round(currentPrice * 100) / 100,
      impliedVolatility: Math.round(defaultImpliedVol * 10000) / 100, // Convert to percentage
      ivPercentile: this.calculateIVPercentile(defaultImpliedVol),
      daysToExpiry: defaultDaysToExpiry,
      expirationDate: defaultExpiration,
    };
    
    console.log(`🎯 CORRECTED RESULT for ${inputs.symbol || 'position'}:`, result);
    return result;
  }

  /**
   * Calculate first OTM put strike for long strangle
   */
  private static calculateFirstOTMPutStrike(currentPrice: number): number {
    const availableStrikes = this.generateRealOptionStrikes(currentPrice);
    
    // Find strikes below current price for Long Strangle, sorted descending (closest first)
    const strikesBelow = availableStrikes
      .filter(strike => strike < currentPrice)
      .sort((a, b) => b - a); // Descending order: closest to farthest below
    
    if (strikesBelow.length === 0) {
      return this.roundToProperOptionStrike(currentPrice - 5, currentPrice);
    }
    
    // Return first OTM put strike (closest below current price)
    return strikesBelow[0];
  }

  /**
   * Calculate first OTM call strike for long strangle
   */
  private static calculateFirstOTMCallStrike(currentPrice: number): number {
    const availableStrikes = this.generateRealOptionStrikes(currentPrice);
    
    // Find strikes above current price for Long Strangle, sorted ascending (closest first)
    const strikesAbove = availableStrikes
      .filter(strike => strike > currentPrice)
      .sort((a, b) => a - b); // Ascending order: closest to farthest above
    
    if (strikesAbove.length === 0) {
      return this.roundToProperOptionStrike(currentPrice + 5, currentPrice);
    }
    
    // Return first OTM call strike (closest above current price)
    return strikesAbove[0];
  }

  /**
   * Generate realistic option strikes that match real options chains
   */
  private static generateRealOptionStrikes(currentPrice: number): number[] {
    const strikes: number[] = [];
    const increment = this.getStrikeIncrement(currentPrice);
    
    // Generate strikes from 50% below to 50% above current price
    const lowerBound = currentPrice * 0.5;
    const upperBound = currentPrice * 1.5;
    
    // Find starting strike (round down to nearest increment)
    const startStrike = Math.floor(lowerBound / increment) * increment;
    
    // Generate all available strikes in real option chain format
    for (let strike = startStrike; strike <= upperBound; strike += increment) {
      if (strike > 0) { // No negative strikes
        strikes.push(strike);
      }
    }
    
    return strikes.sort((a, b) => a - b);
  }

  /**
   * Round to proper option strike intervals (matches real options markets)
   */
  private static roundToProperOptionStrike(targetPrice: number, currentPrice: number): number {
    // Use realistic strike spacing that matches actual options chains
    if (currentPrice < 25) {
      // $1 increments for low-priced stocks
      return Math.round(targetPrice);
    } else if (currentPrice < 50) {
      // $2.50 increments for stocks $25-$50
      return Math.round(targetPrice / 2.5) * 2.5;
    } else if (currentPrice < 100) {
      // $5 increments for stocks $50-$100  
      return Math.round(targetPrice / 5) * 5;
    } else if (currentPrice < 200) {
      // $5 increments for stocks $100-$200 (AAPL at $227.76 -> 225, 230 strikes)
      return Math.round(targetPrice / 5) * 5;
    } else if (currentPrice < 500) {
      // $10 increments for stocks $200-$500
      return Math.round(targetPrice / 10) * 10;
    } else {
      // $25 increments for high-priced stocks like SPY
      return Math.round(targetPrice / 25) * 25;
    }
  }

  /**
   * Get the strike increment for a given stock price
   */
  private static getStrikeIncrement(currentPrice: number): number {
    if (currentPrice < 25) {
      return 1; // $1 increments
    } else if (currentPrice < 50) {
      return 2.5; // $2.50 increments
    } else if (currentPrice < 100) {
      return 5; // $5 increments
    } else if (currentPrice < 200) {
      return 5; // $5 increments
    } else if (currentPrice < 500) {
      return 10; // $10 increments
    } else {
      return 25; // $25 increments
    }
  }

  /**
   * Round to appropriate strike increment based on stock price (matches real options chains)
   */
  private static roundToNearestStrike(price: number, currentPrice: number): number {
    // Use realistic strike spacing that matches actual options chains
    if (currentPrice < 25) {
      // $1 increments for low-priced stocks
      return Math.round(price);
    } else if (currentPrice < 50) {
      // $2.50 increments for stocks $25-$50
      return Math.round(price / 2.5) * 2.5;
    } else if (currentPrice < 100) {
      // $5 increments for stocks $50-$100  
      return Math.round(price / 5) * 5;
    } else if (currentPrice < 200) {
      // $5 increments for stocks $100-$200 (like AAPL at $227.76 -> 225 strike)
      return Math.round(price / 5) * 5;
    } else if (currentPrice < 500) {
      // $10 increments for stocks $200-$500
      return Math.round(price / 10) * 10;
    } else {
      // $25 increments for high-priced stocks like SPY
      return Math.round(price / 25) * 25;
    }
  }

  /**
   * Legacy method for backward compatibility - now uses realistic approach
   */
  private static roundToNearestFiveDollarStrike(price: number): number {
    return Math.round(price / 5) * 5;
  }

  // REMOVED: calculateTheoreticalPutPremium function - no more theoretical pricing
  // System now requires real market data from MarketData.app

  // REMOVED: calculateTheoreticalCallPremium function - no more theoretical pricing
  // System now requires real market data from MarketData.app

  /**
   * Estimate implied volatility based on stock price characteristics
   */
  /**
   * REMOVED: Random IV estimation - now requires real IV from marketdata.app
   * This function is replaced by getting actual implied volatility from marketdata.app options chain
   */
  private static estimateImpliedVolatility(currentPrice: number): number {
    // No more random IV - require real market data
    console.log(`❌ RANDOM IV DISABLED: Must provide real IV from marketdata.app for ${currentPrice}`);
    throw new Error('Real IV data required - no random estimation available');
  }

  /**
   * Calculate IV percentile from the actual options chain distribution
   * Uses real MarketData.app IV values to determine where our IV sits in the distribution
   */
  private static calculateIVPercentileFromChain(targetIV: number, optionsChain: any[]): number {
    // Extract all IV values from the options chain (check both field names)
    const allIVs = optionsChain
      .map(option => option.impliedVolatility || option.implied_volatility)
      .filter(iv => iv && iv > 0)
      .sort((a, b) => a - b);
    
    if (allIVs.length === 0) {
      console.log('⚠️ No IV data in options chain, using fallback percentile calculation');
      return this.calculateIVPercentileFallback(targetIV);
    }
    
    // Find where our target IV sits in the distribution
    const lowerCount = allIVs.filter(iv => iv < targetIV).length;
    const percentile = Math.round((lowerCount / allIVs.length) * 100);
    
    console.log(`📊 IV Percentile from chain: ${targetIV.toFixed(4)} is ${percentile}th percentile (${lowerCount}/${allIVs.length} options below)`);
    
    return Math.max(1, Math.min(99, percentile)); // Clamp between 1-99
  }

  /**
   * Fallback IV percentile calculation when chain data isn't available
   */
  private static calculateIVPercentileFallback(impliedVol: number): number {
    // Convert to percentage if needed
    const ivPercent = impliedVol > 1 ? impliedVol : impliedVol * 100;
    
    // Estimate percentile based on typical market IV ranges
    if (ivPercent <= 15) return Math.round(10 + (ivPercent / 15) * 20); // 10th-30th percentile
    else if (ivPercent <= 35) return Math.round(30 + ((ivPercent - 15) / 20) * 40); // 30th-70th percentile
    else return Math.round(70 + Math.min(((ivPercent - 35) / 30) * 20, 20)); // 70th-90th percentile
  }

  /**
   * Legacy method for backward compatibility
   */
  private static calculateIVPercentile(impliedVol: number): number {
    return this.calculateIVPercentileFallback(impliedVol);
  }

  /**
   * Get default days to expiry (typically 30-45 days for optimal theta decay)
   */
  private static getDefaultDaysToExpiry(): number {
    return 35; // Sweet spot for long strangles
  }

  /**
   * Get next monthly options expiration
   */
  private static getNextOptionsExpiration(): string {
    const today = new Date();
    const currentDay = today.getDay(); // 0=Sunday, 5=Friday
    
    // Calculate days until next Friday (matching frontend Dashboard logic)
    let daysUntilFriday;
    if (currentDay < 5) {
      daysUntilFriday = 5 - currentDay;
    } else if (currentDay === 5) {
      // If it's Friday after 4 PM ET, use next Friday
      daysUntilFriday = today.getHours() >= 16 ? 7 : 0;
    } else {
      // Saturday (6) to Friday = 6 days
      daysUntilFriday = 6;
    }
    
    const nextFriday = new Date(today);
    nextFriday.setDate(today.getDate() + daysUntilFriday);
    
    // Format as YYYY-MM-DD
    const year = nextFriday.getFullYear();
    const month = String(nextFriday.getMonth() + 1).padStart(2, '0');
    const day = String(nextFriday.getDate()).padStart(2, '0');
    const fridayDate = `${year}-${month}-${day}`;
    
    console.log(`📅 Backend getNextOptionsExpiration: Today is ${today.toDateString()}, next Friday: ${fridayDate} (${nextFriday.toDateString()})`);
    return fridayDate;
  }

  /**
   * Recalculate position metrics when strikes change - now with corrected mathematics
   */
  static recalculateFromStrikes(
    putStrike: number,
    callStrike: number,
    currentPrice: number,
    putPremium?: number,
    callPremium?: number,
    impliedVolatility?: number,
    daysToExpiry?: number
  ): Partial<StrangleCalculationResult> {
    // Use provided premiums or calculate theoretical ones
    let putPremiumPerShare: number;
    let callPremiumPerShare: number;
    
    if (putPremium !== undefined && callPremium !== undefined) {
      putPremiumPerShare = putPremium;
      callPremiumPerShare = callPremium;
    } else {
      // REMOVED: No more theoretical pricing - require real market data
      console.log(`❌ THEORETICAL PRICING DISABLED: Must provide real market premiums for recalculation`);
      throw new Error('Real market data required - no theoretical pricing available');
    }
    
    // Calculate total premium per share (for breakeven calculations)
    const totalPremiumPerShare = putPremiumPerShare + callPremiumPerShare;
    
    // Max loss calculation (convert per-share to per-contract)
    const maxLossPerContract = totalPremiumPerShare * 100;
    
    return {
      longPutStrike: putStrike,
      longCallStrike: callStrike,
      longPutPremium: Math.round(putPremiumPerShare * 100) / 100,
      longCallPremium: Math.round(callPremiumPerShare * 100) / 100,
      lowerBreakeven: Math.round((putStrike - totalPremiumPerShare) * 100) / 100,
      upperBreakeven: Math.round((callStrike + totalPremiumPerShare) * 100) / 100,
      maxLoss: Math.round(maxLossPerContract * 100) / 100,
      atmValue: Math.round(currentPrice * 100) / 100,
      impliedVolatility: Math.round((impliedVolatility ?? 0) * 10000) / 100, // Use provided IV or 0, no random fallback
    };
  }
}

/**
 * Unified options strategy calculator - Now uses modular strategy system
 * Delegates to individual strategy implementations for clean separation
 */
export class OptionsStrategyCalculator {
  
  /**
   * Calculate optimal position using new modular strategy system
   */
  static async calculateOptimalPosition(inputs: OptionsCalculationInputs): Promise<OptionsCalculationResult> {
    return await this.calculatePosition(inputs);
  }
  
  /**
   * Calculate position using new strategy system
   */
  static async calculatePosition(
    inputs: OptionsCalculationInputs,
    storage?: any
  ): Promise<OptionsCalculationResult> {
    
    try {
      // Use new modular strategy system
      const { StrategyCalculatorAdapter } = await import('./strategies/StrategyCalculatorAdapter');
      
      console.log(`🎯 Using NEW STRATEGY SYSTEM for ${inputs.strategyType}`);
      return await StrategyCalculatorAdapter.calculatePosition(inputs);
      
    } catch (error) {
      console.error(`❌ New strategy system failed, falling back to legacy:`, error);
      
      // Fallback to legacy calculations for backward compatibility
      return await this.calculateLegacyStrategy(inputs);
    }
  }

  /**
   * Legacy strategy calculations (fallback only)
   */
  private static async calculateLegacyStrategy(inputs: OptionsCalculationInputs): Promise<OptionsCalculationResult> {
    console.log(`🔄 Using LEGACY strategy calculations for ${inputs.strategyType}`);
    
    switch (inputs.strategyType) {
      case strategyTypes.LONG_STRANGLE:
        return await this.calculateLongStrangle(inputs);
      case strategyTypes.SHORT_STRANGLE:
        return this.calculateShortStrangle(inputs);
      case strategyTypes.IRON_CONDOR:
        return await this.calculateIronCondor(inputs);
      case strategyTypes.DIAGONAL_CALENDAR:
        return this.calculateDiagonalCalendar(inputs);
      case strategyTypes.BUTTERFLY_SPREAD:
        return this.calculateButterflySpread(inputs);
      default:
        throw new Error(`Unsupported strategy type: ${inputs.strategyType}`);
    }
  }

  /**
   * Calculate Long Strangle position
   */
  private static async calculateLongStrangle(inputs: OptionsCalculationInputs): Promise<OptionsCalculationResult> {
    const currentPrice = inputs.currentPrice;
    const symbol = inputs.symbol || 'UNKNOWN';
    
    console.log(`🎯 Calculating long strangle for ${symbol} at $${currentPrice}`);
    
    // Try to get real market data first
    let putStrike = inputs.putStrike;
    let callStrike = inputs.callStrike;
    let putPremium = inputs.putPremium;
    let callPremium = inputs.callPremium;
    
    // Declare expected move data variable
    let expectedMoveData = null;
    
    // Always fetch real market data if symbol is provided and strikes/premiums aren't already set
    if ((!putStrike || !callStrike || !putPremium || !callPremium) && symbol && symbol !== 'UNKNOWN') {
      console.log(`🔍 Fetching real market data for ${symbol}...`);
      
      try {
        const realStrikes = await LongStrangleCalculator.getOptimalStrikesFromChain(symbol, currentPrice, null, inputs.expirationDate);
        
        if (realStrikes) {
          putStrike = realStrikes.putStrike;
          callStrike = realStrikes.callStrike;
          putPremium = realStrikes.putPremium; 
          callPremium = realStrikes.callPremium;
          
          // Calculate ATM strike and use REAL IV data from MarketData.app
          const atmStrike = Math.round(currentPrice / 5) * 5; // Round to nearest $5 
          const realImpliedVolatility = realStrikes.impliedVolatility / 100; // Convert percentage to decimal
          const realIvPercentile = realStrikes.ivPercentile;
          
          console.log(`✅ MARKETDATA.APP REAL DATA: Put ${putStrike}@$${putPremium}, Call ${callStrike}@$${callPremium}, ATM ${atmStrike}, IV ${realStrikes.impliedVolatility.toFixed(1)}% (${realIvPercentile}th percentile)`);
          
          // Store for final calculation
          inputs.atmStrike = atmStrike;
          inputs.ivPercentile = realIvPercentile;
          inputs.impliedVolatility = realImpliedVolatility;
          
          // Store expected move data for position
          expectedMoveData = realStrikes.expectedMove;
          
          console.log(`🔍 ATM VERIFICATION: Set inputs.atmStrike = ${atmStrike} vs current price ${currentPrice}`);
        } else {
          console.log(`❌ No real options data available for ${symbol}`);
          throw new Error(`No real market data available for ${symbol} options`);
        }
      } catch (error) {
        console.error(`❌ Error fetching real options data for ${symbol}:`, error);
        throw new Error(`Failed to fetch real market data for ${symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } else if (!putStrike || !callStrike || !putPremium || !callPremium) {
      console.log(`❌ Missing required position data for ${symbol}`);
      throw new Error(`Missing strike or premium data for position calculation`);
    }
    
    // Premium values from MarketData.app are already per-share, not per-contract
    // For contract calculations, multiply by 100 (1 contract = 100 shares)
    const totalPremiumPerContract = (putPremium + callPremium) * 100; // Total cost per strangle (1 put + 1 call contract)
    const totalPremiumPerShare = putPremium + callPremium; // Already per-share for breakeven calculations
    
    console.log(`📊 FINAL POSITION: Put ${putStrike}@$${putPremium}, Call ${callStrike}@$${callPremium}, ATM ${inputs.atmStrike || currentPrice}, Cost $${totalPremiumPerContract}`);
    
    // Ensure ATM value uses the calculated strike, not the stock price
    const finalAtmValue = inputs.atmStrike || currentPrice;
    
    return {
      strategyType: strategyTypes.LONG_STRANGLE,
      longPutStrike: putStrike,
      longCallStrike: callStrike,
      longPutPremium: putPremium,    // Store per-share premium for display
      longCallPremium: callPremium,  // Store per-share premium for display
      lowerBreakeven: putStrike - totalPremiumPerShare,
      upperBreakeven: callStrike + totalPremiumPerShare,
      maxLoss: totalPremiumPerContract, // Total cost per strangle contract
      atmValue: finalAtmValue, // Use calculated ATM strike or current price as fallback
      impliedVolatility: inputs.impliedVolatility || 0, // Use real IV from marketdata.app, no fallback
      ivPercentile: inputs.ivPercentile || 0, // Use real IV percentile from Market Data API
      daysToExpiry: inputs.daysToExpiry ?? 30,
      expirationDate: inputs.expirationDate || this.getNextOptionsExpiration(),
      longExpiration: inputs.expirationDate || this.getNextOptionsExpiration(),
      expectedMove: expectedMoveData, // Include pre-calculated expected move
    };
  }

  /**
   * Calculate Iron Condor position
   * Iron Condor = Short Put Spread + Short Call Spread
   * Strategy: Sell put spread and call spread for net credit
   */
  private static async calculateIronCondor(inputs: OptionsCalculationInputs): Promise<OptionsCalculationResult> {
    const currentPrice = inputs.currentPrice;
    const symbol = inputs.symbol || 'UNKNOWN';
    
    console.log(`🦅 Calculating Iron Condor for ${symbol} at $${currentPrice}`);
    
    // For Iron Condor, we need 4 strikes:
    // Long Put (far OTM put), Short Put (closer to money), Short Call (closer to money), Long Call (far OTM call)
    let longPutStrike = inputs.putStrike;
    let shortPutStrike = inputs.shortPutStrike;
    let shortCallStrike = inputs.shortCallStrike;
    let longCallStrike = inputs.callStrike;
    
    let longPutPremium = inputs.putPremium;
    let shortPutPremium = inputs.shortPutPremium;
    let shortCallPremium = inputs.shortCallPremium;
    let longCallPremium = inputs.callPremium;
    
    // If strikes/premiums not provided, fetch real market data
    if (!longPutStrike || !shortPutStrike || !shortCallStrike || !longCallStrike || 
        !longPutPremium || !shortPutPremium || !shortCallPremium || !longCallPremium) {
      
      if (symbol && symbol !== 'UNKNOWN') {
        console.log(`🔍 Fetching real market data for Iron Condor on ${symbol}...`);
        
        try {
          const realStrikes = await LongStrangleCalculator.getIronCondorStrikesFromChain(symbol, currentPrice);
          
          if (realStrikes) {
            longPutStrike = realStrikes.longPutStrike;
            shortPutStrike = realStrikes.shortPutStrike;
            shortCallStrike = realStrikes.shortCallStrike;
            longCallStrike = realStrikes.longCallStrike;
            
            longPutPremium = realStrikes.longPutPremium;
            shortPutPremium = realStrikes.shortPutPremium;
            shortCallPremium = realStrikes.shortCallPremium;
            longCallPremium = realStrikes.longCallPremium;
            
            console.log(`✅ IRON CONDOR STRIKES: Long Put ${longPutStrike}@$${longPutPremium}, Short Put ${shortPutStrike}@$${shortPutPremium}, Short Call ${shortCallStrike}@$${shortCallPremium}, Long Call ${longCallStrike}@$${longCallPremium}`);
          } else {
            throw new Error(`No real market data available for ${symbol} Iron Condor`);
          }
        } catch (error) {
          console.error(`❌ Error fetching Iron Condor data for ${symbol}:`, error);
          throw new Error(`Failed to fetch real market data for ${symbol} Iron Condor: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      } else {
        throw new Error(`Missing strike or premium data for Iron Condor calculation`);
      }
    }
    
    // Ensure all values are defined before calculations
    if (!longPutStrike || !shortPutStrike || !shortCallStrike || !longCallStrike ||
        !longPutPremium || !shortPutPremium || !shortCallPremium || !longCallPremium) {
      throw new Error(`Missing required Iron Condor data for ${symbol}`);
    }
    
    // Calculate net credit (Iron Condor is a credit strategy)
    // Credit = (Short Put Premium - Long Put Premium) + (Short Call Premium - Long Call Premium)
    const putSpreadCredit = shortPutPremium - longPutPremium;
    const callSpreadCredit = shortCallPremium - longCallPremium;
    const netCredit = putSpreadCredit + callSpreadCredit;
    const netCreditPerContract = netCredit * 100; // Convert to per-contract basis
    
    // Calculate spread widths
    const putSpreadWidth = shortPutStrike - longPutStrike;
    const callSpreadWidth = longCallStrike - shortCallStrike;
    const maxSpreadWidth = Math.max(putSpreadWidth, callSpreadWidth);
    
    // Iron Condor P&L calculations
    const maxProfit = netCreditPerContract; // Credit received
    const maxLoss = (maxSpreadWidth * 100) - netCreditPerContract; // Spread width - credit
    
    // Breakeven points
    const lowerBreakeven = shortPutStrike - netCredit;
    const upperBreakeven = shortCallStrike + netCredit;
    
    // Calculate ATM strike and IV
    const atmStrike = Math.round(currentPrice / 5) * 5;
    const symbolSpecificIV = this.estimateImpliedVolatility(currentPrice);
    const ivPercentile = this.calculateIVPercentile(symbolSpecificIV);
    
    console.log(`📊 IRON CONDOR FINAL: Net Credit $${netCreditPerContract}, Max Profit $${maxProfit}, Max Loss $${maxLoss}`);
    
    return {
      strategyType: strategyTypes.IRON_CONDOR,
      longPutStrike: longPutStrike,
      longCallStrike: longCallStrike,
      longPutPremium: longPutPremium,
      longCallPremium: longCallPremium,
      shortPutStrike: shortPutStrike,
      shortCallStrike: shortCallStrike,
      shortPutPremium: shortPutPremium,
      shortCallPremium: shortCallPremium,
      lowerBreakeven: lowerBreakeven,
      upperBreakeven: upperBreakeven,
      maxLoss: maxLoss,
      maxProfit: maxProfit,
      atmValue: atmStrike,
      impliedVolatility: inputs.impliedVolatility || symbolSpecificIV,
      ivPercentile: inputs.ivPercentile || ivPercentile,
      daysToExpiry: inputs.daysToExpiry ?? 30,
      expirationDate: inputs.expirationDate || this.getNextOptionsExpiration(),
      longExpiration: inputs.expirationDate || this.getNextOptionsExpiration(),
    };
  }

  /**
   * Calculate Short Strangle position
   */
  private static calculateShortStrangle(inputs: OptionsCalculationInputs): OptionsCalculationResult {
    const currentPrice = inputs.currentPrice;
    const putStrike = inputs.putStrike || Math.round(currentPrice - 10);
    const callStrike = inputs.callStrike || Math.round(currentPrice + 10);
    
    // Use provided premiums or calculate with Black-Scholes for short strangles
    const putPremium = inputs.putPremium || this.calculatePutPremium(putStrike, currentPrice, inputs.impliedVolatility || this.estimateImpliedVolatility(currentPrice));
    const callPremium = inputs.callPremium || this.calculateCallPremium(callStrike, currentPrice, inputs.impliedVolatility || this.estimateImpliedVolatility(currentPrice));
    
    const totalCreditReceived = putPremium + callPremium;
    const putPremiumPerShare = putPremium / 100;
    const callPremiumPerShare = callPremium / 100;
    const totalCreditPerShare = putPremiumPerShare + callPremiumPerShare;
    
    return {
      strategyType: strategyTypes.SHORT_STRANGLE,
      longPutStrike: putStrike,
      longCallStrike: callStrike,
      longPutPremium: -putPremium, // Negative because we sell
      longCallPremium: -callPremium, // Negative because we sell
      lowerBreakeven: putStrike - totalCreditPerShare,
      upperBreakeven: callStrike + totalCreditPerShare,
      maxLoss: Number.MAX_SAFE_INTEGER, // Short Strangles have UNLIMITED max loss potential
      maxProfit: totalCreditReceived,
      atmValue: currentPrice,
      impliedVolatility: inputs.impliedVolatility || this.estimateImpliedVolatility(currentPrice),
      ivPercentile: 0, // TODO: Implement real historical IV percentile for short strangles
      daysToExpiry: inputs.daysToExpiry ?? 30,
      expirationDate: inputs.expirationDate || this.getNextOptionsExpiration(),
      longExpiration: inputs.expirationDate || this.getNextOptionsExpiration(),
    };
  }

  /**
   * Calculate Diagonal Calendar Spread position
   */
  private static calculateDiagonalCalendar(inputs: OptionsCalculationInputs): OptionsCalculationResult {
    const currentPrice = inputs.currentPrice;
    const putStrike = inputs.putStrike || Math.round(currentPrice);
    const callStrike = inputs.callStrike || Math.round(currentPrice);
    
    const iv = inputs.impliedVolatility || this.estimateImpliedVolatility(currentPrice);
    
    // Short front month options (higher time premium)
    const shortPutPremium = inputs.shortPutPremium || this.calculatePutPremium(putStrike, currentPrice, iv) * 0.6;
    const shortCallPremium = inputs.shortCallPremium || this.calculateCallPremium(callStrike, currentPrice, iv) * 0.6;
    
    // Long back month options (lower time decay)
    const longPutPremium = inputs.putPremium || this.calculatePutPremium(putStrike, currentPrice, iv);
    const longCallPremium = inputs.callPremium || this.calculateCallPremium(callStrike, currentPrice, iv);
    
    const netDebit = (longPutPremium + longCallPremium) - (shortPutPremium + shortCallPremium);
    
    return {
      strategyType: strategyTypes.DIAGONAL_CALENDAR,
      longPutStrike: putStrike,
      longCallStrike: callStrike,
      longPutPremium: longPutPremium,
      longCallPremium: longCallPremium,
      shortPutStrike: putStrike,
      shortCallStrike: callStrike,
      shortPutPremium: -shortPutPremium, // Negative because we sell
      shortCallPremium: -shortCallPremium, // Negative because we sell
      lowerBreakeven: currentPrice - (netDebit / 100) / 2,
      upperBreakeven: currentPrice + (netDebit / 100) / 2,
      maxLoss: netDebit * 100, // Net debit × 100 shares per contract
      maxProfit: (shortPutPremium + shortCallPremium) * 0.5, // Estimate
      atmValue: currentPrice,
      impliedVolatility: iv,
      ivPercentile: 0, // TODO: Implement real historical IV percentile for diagonal calendar
      daysToExpiry: inputs.daysToExpiry ?? 30,
      expirationDate: inputs.expirationDate || this.getNextOptionsExpiration(),
      longExpiration: inputs.expirationDate || this.getNextOptionsExpiration(),
      shortExpiration: inputs.shortExpiration || this.getWeeklyExpiration().date,
    };
  }

  /**
   * Calculate Butterfly Spread position
   */
  private static calculateButterflySpread(inputs: OptionsCalculationInputs): OptionsCalculationResult {
    const currentPrice = inputs.currentPrice;
    const lowerStrike = inputs.putStrike || Math.round(currentPrice - 10);
    const middleStrike = inputs.shortPutStrike || Math.round(currentPrice);
    const upperStrike = inputs.callStrike || Math.round(currentPrice + 10);
    
    const iv = inputs.impliedVolatility || this.estimateImpliedVolatility(currentPrice);
    
    // Long lower and upper strikes
    const longLowerPremium = inputs.putPremium || this.calculatePutPremium(lowerStrike, currentPrice, iv);
    const longUpperPremium = inputs.callPremium || this.calculateCallPremium(upperStrike, currentPrice, iv);
    
    // Short 2x middle strike
    const shortMiddlePremium = (inputs.shortPutPremium || this.calculatePutPremium(middleStrike, currentPrice, iv)) * 2;
    
    const netDebit = (longLowerPremium + longUpperPremium) - shortMiddlePremium;
    const maxProfitAmount = (middleStrike - lowerStrike) * 100 - Math.abs(netDebit);
    
    return {
      strategyType: strategyTypes.BUTTERFLY_SPREAD,
      longPutStrike: lowerStrike,
      longCallStrike: upperStrike,
      longPutPremium: longLowerPremium,
      longCallPremium: longUpperPremium,
      shortPutStrike: middleStrike,
      shortCallStrike: middleStrike,
      shortPutPremium: -shortMiddlePremium / 2, // Split across put/call
      shortCallPremium: -shortMiddlePremium / 2,
      lowerBreakeven: lowerStrike + (Math.abs(netDebit) / 100),
      upperBreakeven: upperStrike - (Math.abs(netDebit) / 100),
      maxLoss: Math.abs(netDebit) * 100, // Net debit × 100 shares per contract
      maxProfit: maxProfitAmount,
      atmValue: currentPrice,
      impliedVolatility: iv,
      ivPercentile: 0, // TODO: Implement real historical IV percentile for butterfly spread
      daysToExpiry: inputs.daysToExpiry ?? 30,
      expirationDate: inputs.expirationDate || this.getNextOptionsExpiration(),
      longExpiration: inputs.expirationDate || this.getNextOptionsExpiration(),
    };
  }

  // Helper methods
  private static estimateImpliedVolatility(stockPrice: number): number {
    if (stockPrice > 500) return 0.15; // Low vol for high-price stocks like BRK.A
    if (stockPrice > 200) return 0.20; // Moderate vol for large caps
    if (stockPrice > 50) return 0.30;  // Higher vol for mid caps
    return 0.45; // High vol for small caps
  }

  // Legacy methods - replaced with calculateTheoreticalPutPremium and calculateTheoreticalCallPremium
  // Kept for complex strategies compatibility - will redirect to new theoretical calculations
  private static calculatePutPremium(strike: number, stockPrice: number, iv: number): number {
    // Simplified Black-Scholes approximation for put option pricing
    const timeValue = Math.max(0, strike - stockPrice) * iv;
    return Math.max(0.01, timeValue);
  }

  private static calculateCallPremium(strike: number, stockPrice: number, iv: number): number {
    // Simplified Black-Scholes approximation for call option pricing
    const timeValue = Math.max(0, stockPrice - strike) * iv;
    return Math.max(0.01, timeValue);
  }

  private static calculateIVPercentile(iv: number): number {
    // Convert to percentage if needed
    const ivPercent = iv > 1 ? iv : iv * 100;
    
    // Estimate percentile based on typical market IV ranges
    if (ivPercent <= 15) return Math.round(10 + (ivPercent / 15) * 20); // 10th-30th percentile
    else if (ivPercent <= 35) return Math.round(30 + ((ivPercent - 15) / 20) * 40); // 30th-70th percentile
    else return Math.round(70 + Math.min(((ivPercent - 35) / 30) * 20, 20)); // 70th-90th percentile
  }


  private static getWeeklyExpiration() {
    const now = new Date();
    const nextFriday = new Date(now);
    const daysUntilFriday = (5 - now.getDay() + 7) % 7;
    nextFriday.setDate(now.getDate() + daysUntilFriday); // This Friday
    
    return {
      date: nextFriday.toISOString().split('T')[0],
      days: Math.ceil((nextFriday.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    };
  }
}