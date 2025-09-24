// MarketData.app Real-Time Options Data API
// Provides live bid/ask/last pricing, volume, open interest, and Greeks

import { OptionsDataProvider, OptionContract, OptionsChainData } from './optionsDataProvider';
import { SupabaseSecrets } from './config/supabaseSecrets';

// MarketData.app API response interfaces for chain endpoint
interface MarketDataOptionsChain {
  s: string;
  optionSymbol: string[];
  underlying: string[];
  expiration: number[];
  side: string[];
  strike: number[];
  firstTraded: number[];
  dte: number[];
  updated: number[];
  bid: number[];
  bidSize?: number[];
  mid?: number[];
  ask: number[];
  askSize?: number[];
  last: (number | null)[];
  openInterest: number[];
  volume: number[];
  inTheMoney: boolean[];
  intrinsicValue: number[];
  extrinsicValue?: number[];
  underlyingPrice?: number[];
  iv?: number[];
  delta?: number[];
  gamma?: number[];
  theta?: number[];
  vega?: number[];
  rho?: number[];
}

interface MarketDataStockQuote {
  s: string;
  symbol: string[];
  last: number[];
  change?: number[];
  changepct?: number[];
}

class MarketDataApiService implements OptionsDataProvider {
  private apiKey: string;
  private finnhubApiKey: string;
  private baseUrl = 'https://api.marketdata.app';
  private finnhubBaseUrl = 'https://finnhub.io/api/v1';
  private requestCache = new Map<string, { data: any, timestamp: number }>();
  private readonly CACHE_DURATION = 1 * 60 * 1000; // 1 minute cache for more live data
  private readonly EXTENDED_CACHE_DURATION = 15 * 60 * 1000; // 15 minute extended cache for fallback
  private lastRequestTime = 0;
  private readonly MIN_REQUEST_INTERVAL = 50; // Minimal delay for paid plan

  constructor() {
    // 🔒 SECURITY: API keys ONLY from Supabase Vault - no environment fallbacks
    this.apiKey = '';
    this.finnhubApiKey = '';
    console.log('🔒 MarketData API service initialized - keys will load from Supabase Vault only');
  }

  // Initialize API keys from Supabase Vault
  async initialize(): Promise<void> {
    try {
      console.log('🔄 INITIALIZING MarketData API service...');
      console.log(`🔍 Current apiKey before Vault: ${this.apiKey}`);
      
      // FORCE CLEAR existing keys to prevent cache issues
      this.apiKey = '';
      this.finnhubApiKey = '';
      console.log('🧹 Cleared existing API keys to force fresh load');
      
      // Load MarketData API key from Supabase Vault first
      console.log('🔍 Getting MARKETDATA_API_KEY from Vault...');
      const vaultApiKey = await SupabaseSecrets.getSecret('MARKETDATA_API_KEY');
      const keyPreview = vaultApiKey ? `${vaultApiKey.substring(0, 4)}...${vaultApiKey.slice(-4)}` : 'null';
      console.log(`🔍 Vault returned for MARKETDATA_API_KEY: ${keyPreview} (${vaultApiKey?.length || 0} chars)`);
      
      if (vaultApiKey && 
          vaultApiKey !== 'demo-key' && 
          vaultApiKey !== 'YOUR_ACTUAL_API_KEY_HERE' &&
          vaultApiKey.length > 15) {
        this.apiKey = vaultApiKey;
        const keyPreview = vaultApiKey.substring(0, 8) + '...' + vaultApiKey.substring(vaultApiKey.length - 4);
        console.log(`✅ MarketData API key CONFIRMED from Vault: ${keyPreview} (${vaultApiKey.length} chars)`);
      } else {
        console.error(`❌ SECURITY: No valid MarketData API key found in Supabase Vault: "${vaultApiKey}"`);
        console.error(`❌ SECURITY: Environment fallbacks disabled - only Supabase Vault keys allowed`);
      }
      
      // Load Finnhub API key from Supabase Vault ONLY
      const vaultFinnhubKey = await SupabaseSecrets.getSecret('FINNHUB_API_KEY');
      if (vaultFinnhubKey && vaultFinnhubKey.length > 10) {
        this.finnhubApiKey = vaultFinnhubKey;
        console.log(`✅ Finnhub API key loaded from Vault (${vaultFinnhubKey.length} chars)`);
      } else {
        console.error(`❌ SECURITY: No valid Finnhub API key found in Supabase Vault`);
        console.error(`❌ SECURITY: Environment fallbacks disabled - only Supabase Vault keys allowed`);
      }
      
      // FINAL VALIDATION
      console.log(`🔍 FINAL API KEY STATE:`);
      console.log(`   MarketData: ${this.apiKey ? 'SET' : 'MISSING'} (${this.apiKey?.length || 0} chars)`);
      console.log(`   Finnhub: ${this.finnhubApiKey ? 'SET' : 'MISSING'} (${this.finnhubApiKey?.length || 0} chars)`);
      
      if (!this.apiKey && !this.finnhubApiKey) {
        console.error('🔒 SECURITY: No market data API keys found in Supabase Vault');
        console.error('🔒 SECURITY: Environment variable access disabled for enhanced security');
      }
    } catch (error) {
      console.error('❌ Failed to load API keys from Vault:', error);
      // Keep existing environment keys if any
    }
  }

  // Check if API is configured
  isConfigured(): boolean {
    return !!(this.apiKey || this.finnhubApiKey);
  }

  // Check if MarketData.app specifically is configured
  isMarketDataConfigured(): boolean {
    return !!this.apiKey;
  }

  // Check if Finnhub specifically is configured
  isFinnhubConfigured(): boolean {
    return !!this.finnhubApiKey;
  }

  // Clear all request caches to force fresh data
  clearCache(): void {
    console.log(`🧹 Clearing MarketData API cache (${this.requestCache.size} entries)...`);
    this.requestCache.clear();
    console.log(`✅ MarketData API cache cleared - next requests will be fresh`);
  }

  private async makeRequest(endpoint: string): Promise<any> {
    if (!this.apiKey) {
      throw new Error('MarketData API key not configured');
    }

    // Check cache first - prefer fresh cache but extend duration on API failures
    const cacheKey = endpoint;
    const cached = this.requestCache.get(cacheKey);
    
    // Use fresh cache (15 minutes) if available
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      console.log(`🎯 Using 15min cached MarketData for ${endpoint}`);
      return cached.data;
    }
    
    // For API failures, extend cache to 24 hours to keep system functional
    if (cached && Date.now() - cached.timestamp < this.EXTENDED_CACHE_DURATION) {
      console.log(`🔄 Using extended cache (avoiding API limits) for ${endpoint}`);
      // Don't return yet - try API first, fall back to extended cache if API fails
    }

    // Rate limiting - wait if needed
    const timeSinceLastRequest = Date.now() - this.lastRequestTime;
    if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL) {
      await new Promise(resolve => setTimeout(resolve, this.MIN_REQUEST_INTERVAL - timeSinceLastRequest));
    }

    const url = `${this.baseUrl}${endpoint}`;
      console.log(`📡 MarketData API request: ${url}`);
      console.log(`🔑 Using API key: ${this.apiKey.substring(0, 8)}...${this.apiKey.substring(this.apiKey.length - 4)} (${this.apiKey.length} chars)`);
      
      try {
        this.lastRequestTime = Date.now();
        const response = await fetch(url, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'OptionsTrader/1.0',
            'Authorization': `Bearer ${this.apiKey}`
          },
        });

        console.log(`✅ MarketData API response received for ${endpoint}`);

        if (!response.ok) {
          if (response.status === 401) {
            console.error(`❌ INVALID API KEY for ${endpoint}! Key: ${this.apiKey.substring(0, 8)}...${this.apiKey.substring(this.apiKey.length - 4)}`);
            console.error(`🔍 This suggests the API key from Vault is invalid or expired`);
          }
          if (response.status === 429) {
            console.warn(`⚠️ MarketData rate limit hit for ${endpoint}`);
            throw new Error(`Rate limit exceeded: ${response.status}`);
          }
          throw new Error(`MarketData API error: ${response.status} ${response.statusText}`);
        }

      const data = await response.json();
      
      // DETAILED LOGGING: Log raw MarketData.app API response
      console.log(`🔬 RAW MARKETDATA.APP RESPONSE for ${endpoint}:`, JSON.stringify(data, null, 2));
      
      // Cache successful response
      this.requestCache.set(cacheKey, {
        data,
        timestamp: Date.now()
      });

      return data;
    } catch (error) {
      console.error(`❌ MarketData API request failed for ${endpoint}:`, error);
      
      // Emergency fallback: use extended 24-hour cache if available
      const cached = this.requestCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.EXTENDED_CACHE_DURATION) {
        const hoursOld = Math.round((Date.now() - cached.timestamp) / (60 * 60 * 1000));
        console.log(`🆘 EMERGENCY FALLBACK: Using ${hoursOld}h old cached MarketData for ${endpoint} (REAL market data, not theoretical)`);
        return cached.data;
      }
      
      // If no cached data within 24 hours, throw error (no theoretical fallback)
      throw error;
    }
  }

  // Get current stock price with change data - Use Finnhub FIRST for complete quote data
  async getStockQuote(symbol: string): Promise<{ currentPrice: number; change: number; changePercent: number } | null> {
    // Try Finnhub FIRST for complete stock quote data (price + changes)
    if (this.isFinnhubConfigured()) {
      try {
        console.log(`📡 PRIMARY: Using Finnhub for complete stock quote data for ${symbol}...`);
        const finnhubQuote = await this.getFinnhubStockQuote(symbol);
        if (finnhubQuote) {
          console.log(`✅ FINNHUB PRIMARY SUCCESS: ${symbol} = $${finnhubQuote.currentPrice} (${finnhubQuote.change >= 0 ? '+' : ''}$${finnhubQuote.change.toFixed(2)}, ${finnhubQuote.changePercent >= 0 ? '+' : ''}${finnhubQuote.changePercent.toFixed(2)}%)`);
          return finnhubQuote;
        }
      } catch (finnhubError) {
        console.warn(`⚠️ Finnhub failed for ${symbol}, trying MarketData.app fallback:`, finnhubError);
      }
    } else {
      console.log(`⚠️ No Finnhub API key - using MarketData.app for ${symbol}`);
    }

    // Fallback to MarketData.app (but it doesn't provide change data)
    try {
      const data: MarketDataStockQuote = await this.makeRequest(`/v1/stocks/quotes/${symbol}/`);
      
      if (data.s !== 'ok' || !data.last?.[0]) {
        console.warn(`⚠️ Invalid stock quote data for ${symbol}`);
        return null;
      }

      console.log(`📊 MARKETDATA FALLBACK: ${symbol} = $${data.last[0]} (no change data available)`);
      
      // MarketData API provides change data in the response
      const currentPrice = data.last[0];
      const change = data.change?.[0] || 0;
      const changePercent = data.changepct?.[0] || 0;
      
      if (change !== 0 || changePercent !== 0) {
        console.log(`📈 MARKETDATA CHANGE DATA: ${symbol} = $${currentPrice} (${change >= 0 ? '+' : ''}$${change.toFixed(2)}, ${changePercent >= 0 ? '+' : ''}${(changePercent * 100).toFixed(2)}%)`);
      } else {
        console.log(`⚠️ MARKETDATA: No change data available for ${symbol}`);
      }
      
      return {
        currentPrice,
        change,
        changePercent: changePercent * 100 // Convert to percentage
      };
    } catch (error) {
      console.error(`❌ Both Finnhub and MarketData failed for ${symbol}:`, error);
      return null;
    }
  }

  // Finnhub API for stock quotes (fallback method)
  async getFinnhubStockQuote(symbol: string): Promise<{ currentPrice: number; change: number; changePercent: number } | null> {
    if (!this.finnhubApiKey) {
      throw new Error('Finnhub API key not configured');
    }

    const url = `${this.finnhubBaseUrl}/quote?symbol=${symbol}&token=${this.finnhubApiKey}`;
    console.log(`📡 Finnhub API request: ${url}`);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Finnhub API error: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      
      if (data && data.c) { // c is current price in Finnhub
        return {
          currentPrice: data.c,
          change: data.d || 0, // d is change
          changePercent: data.dp || 0 // dp is change percent
        };
      }
      return null;
    } catch (error) {
      console.error(`❌ Finnhub API request failed for ${symbol}:`, error);
      throw error;
    }
  }


  // Get options chain for a specific expiration with real market data
  async getOptionsChainSnapshot(symbol: string, expiration: string, realTimePrice?: number): Promise<OptionContract[]> {
    console.log(`📊 REAL MARKET QUOTES: Getting options for ${symbol} - ${expiration} (MarketData.app)`);
    
    try {
      // Use real-time price if provided, otherwise fetch from API
      let currentPrice: number;
      if (realTimePrice) {
        currentPrice = realTimePrice;
        console.log(`📊 USING REAL-TIME PRICE: ${symbol} = $${currentPrice}`);
      } else {
        const stockQuote = await this.getStockQuote(symbol);
        currentPrice = stockQuote?.currentPrice || 100;
        console.log(`📊 USING MARKET QUOTE: ${symbol} = $${currentPrice}`);
      }
      
      // AAPL SPECIFIC PRICE LOGGING
      if (symbol === 'AAPL') {
        console.log(`🍎 AAPL CURRENT PRICE FOR OPTIONS: $${currentPrice}`);
        console.log(`🍎 Current time: ${new Date().toISOString()}`);
        console.log(`🍎 Market hours: ${new Date().toLocaleString('en-US', {timeZone: 'America/New_York'})} ET`);
      }
      
      // Use the correct options chain endpoint with cost optimization parameters
      // strikeLimit=20 limits to exactly 20 strikes for cost optimization
      const chainData: MarketDataOptionsChain = await this.makeRequest(
        `/v1/options/chain/${symbol}/?expiration=${expiration}&strikeLimit=20`
      );
      
      if (chainData.s !== 'ok' || !chainData.optionSymbol || chainData.optionSymbol.length === 0) {
        console.warn(`⚠️ No options found for ${symbol} ${expiration}`);
        return [];
      }
      
      console.log(`📊 COST OPTIMIZED: Got ${chainData.optionSymbol.length} options from MarketData.app for ${symbol} ${expiration}`);
      
      // DETAILED AAPL LOGGING: If this is AAPL, log detailed expiration and contract data
      if (symbol === 'AAPL') {
        console.log(`🍎 AAPL DEBUG - Requested expiration: ${expiration}`);
        console.log(`🍎 AAPL DEBUG - Raw MarketData expiration timestamps:`, chainData.expiration?.slice(0, 10));
        if (chainData.expiration) {
          const expirationDates = chainData.expiration.slice(0, 10).map(timestamp => {
            const date = new Date(timestamp * 1000);
            return {
              timestamp,
              date: date.toISOString().split('T')[0],
              dateObject: date
            };
          });
          console.log(`🍎 AAPL DEBUG - Converted expiration dates:`, expirationDates);
        }
      }
      
      const contracts: OptionContract[] = [];
      
      // Process each option with REAL market data
      for (let i = 0; i < chainData.optionSymbol.length; i++) {
        const optionSymbol = chainData.optionSymbol[i];
        const side = chainData.side[i]; // "call" or "put"
        const strike = chainData.strike[i];
        const expirationTimestamp = chainData.expiration[i];
        
        // Convert timestamp to YYYY-MM-DD format
        const expirationDate = new Date(expirationTimestamp * 1000).toISOString().split('T')[0];
        
        // Extract real market data
        const bid = chainData.bid?.[i] || 0;
        const ask = chainData.ask?.[i] || 0;
        const last = chainData.last?.[i] || 0;
        const volume = chainData.volume?.[i] || 0;
        const openInterest = chainData.openInterest?.[i] || 0;
        const impliedVolatility = chainData.iv?.[i];
        
        // Calculate mid price if bid/ask available
        const midPrice = (bid > 0 && ask > 0) ? (bid + ask) / 2 : last;
        
        // DETAILED AAPL CONTRACT LOGGING
        if (symbol === 'AAPL') {
          console.log(`🍎 AAPL CONTRACT DEBUG - ${optionSymbol}:`);
          console.log(`   Side: ${side}, Strike: ${strike}`);
          console.log(`   Expiration Date: ${expirationDate} (from timestamp ${expirationTimestamp})`);
          console.log(`   BID: $${bid.toFixed(4)}, ASK: $${ask.toFixed(4)}, LAST: $${last?.toFixed(4) || 'null'}`);
          console.log(`   Mid Price: $${midPrice.toFixed(4)}`);
          console.log(`   Volume: ${volume}, Open Interest: ${openInterest}`);
          console.log(`   IV: ${impliedVolatility?.toFixed(4) || 'null'}%`);
          console.log(`   Greeks - Delta: ${chainData.delta?.[i]?.toFixed(4) || 'null'}, Gamma: ${chainData.gamma?.[i]?.toFixed(4) || 'null'}`);
          
          // Compare with Charles Schwab data
          if (side === 'call' && strike === 235) {
            console.log(`🔍 CHARLES SCHWAB COMPARISON - Call $235:`);
            console.log(`   Schwab: BID $1.60, ASK $1.69`);
            console.log(`   MarketData.app: BID $${bid.toFixed(2)}, ASK $${ask.toFixed(2)}`);
            console.log(`   DISCREPANCY: BID diff $${(bid - 1.60).toFixed(2)}, ASK diff $${(ask - 1.69).toFixed(2)}`);
          }
          if (side === 'put' && strike === 237.5) {
            console.log(`🔍 CHARLES SCHWAB COMPARISON - Put $237.50:`);
            console.log(`   Schwab: BID $4.05, ASK $4.15`);
            console.log(`   MarketData.app: BID $${bid.toFixed(2)}, ASK $${ask.toFixed(2)}`);
            console.log(`   DISCREPANCY: BID diff $${(bid - 4.05).toFixed(2)}, ASK diff $${(ask - 4.15).toFixed(2)}`);
          }
        }
        
        console.log(`💰 REAL MARKET QUOTES (MarketData.app) ${optionSymbol}: ${side} strike ${strike}, BID $${bid.toFixed(2)}, ASK $${ask.toFixed(2)}, LAST $${last?.toFixed(2) || 'null'}`);
        
        contracts.push({
          ticker: optionSymbol,
          strike: strike,
          expiration_date: expirationDate,
          contract_type: side as 'call' | 'put',
          bid: Math.max(0.01, bid),
          ask: Math.max(0.01, ask || bid || last || 0.01),
          last: Math.max(0.01, last || midPrice || 0.01),
          volume,
          open_interest: openInterest,
          implied_volatility: impliedVolatility,
          delta: chainData.delta?.[i],
          gamma: chainData.gamma?.[i],
          theta: chainData.theta?.[i],
          vega: chainData.vega?.[i],
          expirationLabel: expirationDate,
          daysUntilExpiration: chainData.dte?.[i] || Math.ceil((new Date(expirationDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
        });
      }
      
      console.log(`✅ Successfully processed ${contracts.length} real options from MarketData.app`);
      return contracts;
      
    } catch (error) {
      console.error(`❌ Failed to fetch MarketData options for ${symbol}:`, error);
      // Fallback to empty array - caller will handle fallback
      return [];
    }
  }

  // Get comprehensive options chain across multiple expirations
  async getOptionsChain(symbol: string, realTimePrice?: number): Promise<OptionsChainData | null> {
    try {
      // Use real-time price if provided, otherwise fetch from API  
      let currentPrice: number;
      if (realTimePrice) {
        currentPrice = realTimePrice;
        console.log(`📊 getOptionsChain: Using REAL-TIME price for ${symbol} = $${currentPrice}`);
      } else {
        const stockQuote = await this.getStockQuote(symbol);
        currentPrice = stockQuote?.currentPrice || 100;
        console.log(`📊 getOptionsChain: Using MARKET QUOTE for ${symbol} = $${currentPrice}`);
      }

      // STEP 1: Get all available expirations with date range to capture all Friday expirations
      console.log(`🔄 STEP 1: Getting all available expirations for ${symbol}...`);
      
      // Calculate date range dynamically from today until 60 days from now
      const today = new Date();
      const fromDate = new Date(today.getTime() - (1 * 24 * 60 * 60 * 1000)); // 1 day ago to capture current expiration
      const toDate = new Date(today.getTime() + (60 * 24 * 60 * 60 * 1000)); // 60 days out as requested
      
      const fromDateStr = fromDate.toISOString().split('T')[0];
      const toDateStr = toDate.toISOString().split('T')[0];
      
      console.log(`📅 Date range: ${fromDateStr} to ${toDateStr} (to capture all Friday expirations including 09/26)`);
      
      const allExpirationsData: MarketDataOptionsChain = await this.makeRequest(
        `/v1/options/chain/${symbol}/?from=${fromDateStr}&to=${toDateStr}&strikeLimit=1000`
      );
      
      if (allExpirationsData.s !== 'ok' || !allExpirationsData.expiration) {
        console.warn(`⚠️ No expiration data found for ${symbol}`);
        return null;
      }

      // Extract unique expiration dates
      const uniqueExpirations = [...new Set(allExpirationsData.expiration.map(ts => {
        const date = new Date(ts * 1000);
        return date.toISOString().split('T')[0];
      }))].sort();

      console.log(`📅 Found ${uniqueExpirations.length} available expirations for ${symbol}: ${uniqueExpirations.join(', ')}`);

      // FIXED: Process all options data from the single from/to API call (avoid parameter conflicts)
      console.log(`🔄 PROCESSING: Using data from single from/to API call to avoid parameter conflicts`);
      const allOptionsByExpiration: OptionContract[] = [];

      if (allExpirationsData.optionSymbol && allExpirationsData.optionSymbol.length > 0) {
        console.log(`✅ Processing ${allExpirationsData.optionSymbol.length} options from single API call`);
        
        // Process all options from the single comprehensive call
        for (let i = 0; i < allExpirationsData.optionSymbol.length; i++) {
          const optionSymbol = allExpirationsData.optionSymbol[i];
          const side = allExpirationsData.side[i];
          const strike = allExpirationsData.strike[i];
          const expirationTimestamp = allExpirationsData.expiration[i];
          
          // Convert timestamp to YYYY-MM-DD format
          const expirationDate = new Date(expirationTimestamp * 1000).toISOString().split('T')[0];
          
          // Extract real market data
          const bid = allExpirationsData.bid?.[i] || 0;
          const ask = allExpirationsData.ask?.[i] || 0;
          const last = allExpirationsData.last?.[i] || 0;
          const volume = allExpirationsData.volume?.[i] || 0;
          const openInterest = allExpirationsData.openInterest?.[i] || 0;
          const impliedVolatility = allExpirationsData.iv?.[i];
          
          // Calculate mid price if bid/ask available
          const midPrice = (bid > 0 && ask > 0) ? (bid + ask) / 2 : last;
          
          allOptionsByExpiration.push({
            ticker: optionSymbol,
            strike: strike,
            expiration_date: expirationDate,
            contract_type: side as 'call' | 'put',
            bid: Math.max(0.01, bid),
            ask: Math.max(0.01, ask || bid || last || 0.01),
            last: Math.max(0.01, last || midPrice || 0.01),
            volume,
            open_interest: openInterest,
            implied_volatility: impliedVolatility,
            delta: allExpirationsData.delta?.[i],
            gamma: allExpirationsData.gamma?.[i],
            theta: allExpirationsData.theta?.[i],
            vega: allExpirationsData.vega?.[i],
            expirationLabel: expirationDate,
            daysUntilExpiration: allExpirationsData.dte?.[i] || Math.ceil((new Date(expirationDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
          });
        }
      } else {
        console.warn(`⚠️ No options data found in comprehensive call for ${symbol}`);
      }
      
      console.log(`✅ COMPLETE CHAIN: ${symbol} - ${allOptionsByExpiration.length} total options across ${uniqueExpirations.length} expirations`);

      // FINAL SUMMARY LOGGING
      if (symbol === 'AAPL') {
        console.log(`🍎 AAPL FINAL SUMMARY:`);
        const expirations = [...new Set(allOptionsByExpiration.map(opt => opt.expiration_date))].sort();
        console.log(`   Available expirations: ${expirations.join(', ')}`);
        console.log(`   Total options: ${allOptionsByExpiration.length} across dates: ${expirations.join(', ')}`);
      }

      // Transform flat options array into chains structure
      const chains: { [expirationDate: string]: { calls: OptionContract[], puts: OptionContract[] } } = {};
      const expirationDates: string[] = [];
      
      // Group options by expiration date and type
      for (const option of allOptionsByExpiration) {
        const expDate = option.expiration_date;
        
        if (!chains[expDate]) {
          chains[expDate] = { calls: [], puts: [] };
          expirationDates.push(expDate);
        }
        
        if (option.contract_type === 'call') {
          chains[expDate].calls.push(option);
        } else {
          chains[expDate].puts.push(option);
        }
      }
      
      // Sort chains by strike within each expiration
      for (const expDate of Object.keys(chains)) {
        chains[expDate].calls.sort((a, b) => a.strike - b.strike);
        chains[expDate].puts.sort((a, b) => a.strike - b.strike);
      }
      
      const sortedOptions = allOptionsByExpiration.sort((a, b) => {
        // Sort by expiration first, then by strike
        if (a.expiration_date !== b.expiration_date) {
          return a.expiration_date.localeCompare(b.expiration_date);
        }
        return a.strike - b.strike;
      });
      
      console.log(`🔧 TRANSFORMED OPTIONS CHAIN for ${symbol}: ${Object.keys(chains).length} expirations, ${allOptionsByExpiration.length} total options`);
      
      return {
        symbol,
        underlyingPrice: currentPrice,
        options: sortedOptions,
        chains: chains,
        expirationDates: expirationDates.sort(),
        dataSource: 'marketdata.app-realtime',
        timestamp: Date.now()
      };
    } catch (error) {
      console.error(`❌ Failed to fetch comprehensive MarketData options chain for ${symbol}:`, error);
      return null;
    }
  }
}

export const marketDataApiService = new MarketDataApiService();

// Auto-debugging removed to prevent date conflicts