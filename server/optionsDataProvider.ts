// Options Data Provider Abstraction
// Allows switching between different options data sources (Polygon, MarketData.app, etc.)

export interface OptionsDataProvider {
  // Get current stock price
  getStockQuote(symbol: string): Promise<{ currentPrice: number } | null>;
  
  // Get options chain for a specific expiration  
  getOptionsChainSnapshot(symbol: string, expiration: string, realTimePrice?: number): Promise<OptionContract[]>;
  
  // Get comprehensive options chain across multiple expirations
  getOptionsChain(symbol: string, realTimePrice?: number): Promise<OptionsChainData | null>;
}

// Unified option contract interface (compatible with existing PolygonOptionContract)
export interface OptionContract {
  ticker: string;
  strike: number;
  expiration_date: string;
  contract_type: 'call' | 'put';
  bid: number;
  ask: number;
  last: number;
  volume: number;
  open_interest: number;
  implied_volatility?: number;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  contractSymbol?: string;  // Added for UI compatibility
  expirationLabel?: string;
  daysUntilExpiration?: number;
}

// Unified options chain interface (compatible with existing PolygonOptionsChain)
export interface OptionsChainData {
  symbol: string;
  underlyingPrice: number;
  options: OptionContract[];
  dataSource: string;
  timestamp: number;
}