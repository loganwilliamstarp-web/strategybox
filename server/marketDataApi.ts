// MarketData.app Real-Time Options Data API
// Provides live bid/ask/last pricing, volume, open interest, and Greeks

import { OptionsDataProvider, OptionContract, OptionsChainData } from './optionsDataProvider';
import { SupabaseSecrets } from './config/supabaseSecrets';
import { recordMarketDataMetric } from './telemetry/marketDataMetrics';

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
  private readonly debugLogging = process.env.MARKETDATA_DEBUG === 'true';
  private logDebug(message: string, ...optional: any[]) {
    if (this.debugLogging) {
      console.debug('[MarketData]', message, ...optional);
    }
  }
  private logInfo(message: string, ...optional: any[]) {
    console.info('[MarketData]', message, ...optional);
  }
  constructor() {
    // 🔒 SECURITY: API keys ONLY from Supabase Vault - no environment fallbacks
    this.apiKey = '';
    this.logInfo('MarketData API service initialized (Supabase vault only)');
    this.finnhubApiKey = '';
  }

  // Initialize API keys from Supabase Vault
  async initialize(): Promise<void> {
    try {
      this.apiKey = '';
      this.finnhubApiKey = '';

      const vaultApiKey = await SupabaseSecrets.getSecret('MARKETDATA_API_KEY');
      if (
        vaultApiKey &&
        vaultApiKey !== 'demo-key' &&
        vaultApiKey !== 'YOUR_ACTUAL_API_KEY_HERE' &&
        vaultApiKey.length > 15
      ) {
        this.apiKey = vaultApiKey;
        this.logInfo('Loaded MarketData API key from Supabase Vault');
      } else {
        console.error('[MarketData] No valid MarketData API key found in Supabase Vault', { value: vaultApiKey });
        console.error('[MarketData] Environment fallbacks disabled - only Supabase Vault keys allowed');
      }

      const vaultFinnhubKey = await SupabaseSecrets.getSecret('FINNHUB_API_KEY');
      if (vaultFinnhubKey && vaultFinnhubKey.length > 10) {
        this.finnhubApiKey = vaultFinnhubKey;
        this.logInfo('Loaded Finnhub API key from Supabase Vault');
      } else {
        console.error('[MarketData] No valid Finnhub API key found in Supabase Vault');
        console.error('[MarketData] Environment fallbacks disabled - only Supabase Vault keys allowed');
      }

      if (!this.apiKey && !this.finnhubApiKey) {
        console.error('[MarketData] No market data API keys found in Supabase Vault');
        console.error('[MarketData] Environment variable access disabled for enhanced security');
      }
    } catch (error) {
      console.error('[MarketData] Failed to load API keys from Vault', error);
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
    this.requestCache.clear();
  }

  private async makeRequest(endpoint: string): Promise<any> {
    if (!this.apiKey) {
      throw new Error('MarketData API key not configured');
    }

    const cacheKey = endpoint;
    const cached = this.requestCache.get(cacheKey);
    const now = Date.now();

    if (cached && now - cached.timestamp < this.CACHE_DURATION) {
      recordMarketDataMetric({ event: 'cache_hit', endpoint, cacheAgeMs: now - cached.timestamp });
      return cached.data;
    }

    const canFallbackToStaleCache = Boolean(cached && now - cached.timestamp < this.EXTENDED_CACHE_DURATION);

    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL) {
      await new Promise(resolve => setTimeout(resolve, this.MIN_REQUEST_INTERVAL - timeSinceLastRequest));
    }

    const requestStarted = Date.now();
    const url = `${this.baseUrl}${endpoint}`;

    try {
      this.lastRequestTime = Date.now();
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'OptionsTrader/1.0',
          'Authorization': `Bearer ${this.apiKey}`
        },
      });
      const latency = Date.now() - requestStarted;

      if (!response.ok) {
        recordMarketDataMetric({
          event: 'fetch_error',
          endpoint,
          latencyMs: latency,
          statusCode: response.status,
          error: response.statusText,
        });

        if (response.status === 401) {
          console.error('[MarketData] Invalid API key when calling endpoint', { endpoint });
        } else if (response.status === 429) {
          console.warn('[MarketData] MarketData.app rate limit hit', { endpoint });
        }

        throw new Error(`MarketData API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      this.requestCache.set(cacheKey, {
        data,
        timestamp: Date.now(),
      });

      recordMarketDataMetric({
        event: 'fetch_success',
        endpoint,
        latencyMs: latency,
        statusCode: response.status,
      });

      return data;
    } catch (error) {
      recordMarketDataMetric({
        event: 'fetch_error',
        endpoint,
        latencyMs: Date.now() - requestStarted,
        error: error instanceof Error ? error.message : 'unknown',
      });
      console.error('[MarketData] API request failed', { endpoint, error });

      if (canFallbackToStaleCache && cached) {
        recordMarketDataMetric({ event: 'cache_stale_hit', endpoint, cacheAgeMs: now - cached.timestamp });
        return cached.data;
      }

      throw error;
    }
  }

  // Get current stock price with change data - Use Finnhub FIRST for complete quote data
  async getStockQuote(symbol: string): Promise<{ currentPrice: number; change: number; changePercent: number } | null> {
    if (this.isFinnhubConfigured()) {
      try {
        const finnhubQuote = await this.getFinnhubStockQuote(symbol);
        if (finnhubQuote) {
          return finnhubQuote;
        }
      } catch (finnhubError) {
        console.warn('[MarketData] Finnhub quote failed, falling back to MarketData.app', { symbol, error: finnhubError });
      }
    }

    try {
      const data: MarketDataStockQuote = await this.makeRequest(`/v1/stocks/quotes/${symbol}/`);
      if (data.s !== 'ok' || !data.last?.[0]) {
        console.warn('[MarketData] Invalid stock quote payload', { symbol, response: data });
        return null;
      }

      const currentPrice = data.last[0];
      const change = data.change?.[0] ?? 0;
      const changePercent = (data.changepct?.[0] ?? 0) * 100;

      return {
        currentPrice,
        change,
        changePercent,
      };
    } catch (error) {
      console.error('[MarketData] Failed to fetch stock quote from MarketData after Finnhub fallback', { symbol, error });
      return null;
    }
  }
  async getFinnhubStockQuote(symbol: string): Promise<{ currentPrice: number; change: number; changePercent: number } | null> {
    if (!this.finnhubApiKey) {
      throw new Error('Finnhub API key not configured');
    }

    const url = `${this.finnhubBaseUrl}/quote?symbol=${symbol}&token=${this.finnhubApiKey}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Finnhub API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (data && data.c) {
        return {
          currentPrice: data.c,
          change: data.d || 0,
          changePercent: data.dp || 0,
        };
      }

      return null;
    } catch (error) {
      console.error('[MarketData] Finnhub API request failed', { symbol, error });
      throw error;
    }
  }
  // Get options chain for a specific expiration with real market data
  async getOptionsChainSnapshot(symbol: string, expiration: string, realTimePrice?: number): Promise<OptionContract[]> {
    
    try {
      // Use real-time price if provided, otherwise fetch from API
      let currentPrice: number;
      if (realTimePrice) {
        currentPrice = realTimePrice;
      } else {
        const stockQuote = await this.getStockQuote(symbol);
        currentPrice = stockQuote?.currentPrice || 100;
      }
      
      // AAPL SPECIFIC PRICE LOGGING
      if (symbol === 'AAPL') {
        console.log(`🍎 AAPL Options Chain Request - Price: $${currentPrice}, Expiration: ${expiration}`);
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
      
      // DETAILED AAPL LOGGING: If this is AAPL, log detailed expiration and contract data
      if (symbol === 'AAPL') {
        if (chainData.expiration) {
          const expirationDates = chainData.expiration.slice(0, 10).map(timestamp => {
            const date = new Date(timestamp * 1000);
            return {
              timestamp,
              date: date.toISOString().split('T')[0],
              dateObject: date
            };
          });
          console.log(`🍎 AAPL Expiration dates:`, expirationDates);
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
          // Compare with Charles Schwab data
          if (side === 'call' && strike === 235) {
            console.log(`🍎 AAPL Call 235: Bid=${bid}, Ask=${ask}, Last=${last}, IV=${impliedVolatility}`);
          }
          if (side === 'put' && strike === 237.5) {
            console.log(`🍎 AAPL Put 237.5: Bid=${bid}, Ask=${ask}, Last=${last}, IV=${impliedVolatility}`);
          }
        }
        
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
      } else {
        const stockQuote = await this.getStockQuote(symbol);
        currentPrice = stockQuote?.currentPrice || 100;
      }

      // STEP 1: Get all available expirations with date range to capture all Friday expirations
      
      // Calculate date range dynamically from today until 60 days from now
      const today = new Date();
      const fromDate = new Date(today.getTime() - (1 * 24 * 60 * 60 * 1000)); // 1 day ago to capture current expiration
      const toDate = new Date(today.getTime() + (60 * 24 * 60 * 60 * 1000)); // 60 days out as requested
      
      const fromDateStr = fromDate.toISOString().split('T')[0];
      const toDateStr = toDate.toISOString().split('T')[0];
      
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


      // FIXED: Process all options data from the single from/to API call (avoid parameter conflicts)
      const allOptionsByExpiration: OptionContract[] = [];

      if (allExpirationsData.optionSymbol && allExpirationsData.optionSymbol.length > 0) {
        
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
        console.warn('[MarketData] No options data returned in comprehensive call', { symbol });
      }

      // FINAL SUMMARY LOGGING
      if (symbol === 'AAPL') {
        const expirations = [...new Set(allOptionsByExpiration.map(opt => opt.expiration_date))].sort();
        console.log(`🍎 AAPL Final Summary: ${expirations.length} expirations, ${allOptionsByExpiration.length} total options`);
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
      console.error('[MarketData] Failed to fetch comprehensive MarketData options chain', { symbol, error });
      return null;
    }
  }
}

export const marketDataApiService = new MarketDataApiService();

// Auto-debugging removed to prevent date conflicts






