import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiRequestWithAuth } from '@/lib/supabaseAuth';

interface OptionsChainContract {
  optionSymbol: string;
  strike: number;
  expiration: string;
  optionType: 'call' | 'put';
  bid: number;
  ask: number;
  last: number;
  mark: number;
  volume: number;
  openInterest: number;
  change?: number;
  impliedVolatility: number;
}

interface OptionsChainData {
  symbol: string;
  underlyingPrice: number;
  options: OptionsChainContract[];
}

interface SchwabStyleOptionsChainProps {
  symbol: string;
  'data-testid'?: string;
}

export const SchwabStyleOptionsChain: React.FC<SchwabStyleOptionsChainProps> = ({ symbol, 'data-testid': testId }) => {
  const [optionsData, setOptionsData] = useState<OptionsChainData | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedExpiration, setSelectedExpiration] = useState<string>('');
  const [view, setView] = useState<string>('calls-puts');
  const [strikesCount, setStrikesCount] = useState<string>('8');

  const fetchOptionsChain = async () => {
    if (!symbol) return;
    
    setLoading(true);
    try {
      const chainData = await apiRequestWithAuth(`/api/market-data/options-chain/${symbol}`);
      if (chainData) {
        setOptionsData(chainData);
        
        // Set default expiration to first available
        if (chainData.options.length > 0 && !selectedExpiration) {
          const expirations = [...new Set(chainData.options.map((opt: OptionsChainContract) => opt.expiration))];
          setSelectedExpiration(expirations[0]);
        }
      }
    } catch (error) {
      console.error('Error fetching options chain:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOptionsChain();
  }, [symbol]);

  if (!optionsData) {
    return (
      <Card className="w-full" data-testid={testId}>
        <CardHeader>
          <CardTitle>Options Chain</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32">
            {loading ? 'Loading options data...' : 'No options data available'}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Group options by expiration and strike
  const expirations = [...new Set(optionsData.options.map(opt => opt.expiration))].sort();
  const filteredOptions = selectedExpiration 
    ? optionsData.options.filter(opt => opt.expiration === selectedExpiration)
    : optionsData.options.filter(opt => opt.expiration === expirations[0]);

  // Group by strike price
  const strikeGroups = filteredOptions.reduce((acc, option) => {
    if (!acc[option.strike]) {
      acc[option.strike] = { calls: [], puts: [] };
    }
    if (option.optionType === 'call') {
      acc[option.strike].calls.push(option);
    } else {
      acc[option.strike].puts.push(option);
    }
    return acc;
  }, {} as Record<number, { calls: OptionsChainContract[]; puts: OptionsChainContract[] }>);

  const strikes = Object.keys(strikeGroups).map(Number).sort((a, b) => a - b);
  
  // Find ATM strike (closest to underlying price)
  const atmStrike = strikes.reduce((closest, strike) => 
    Math.abs(strike - optionsData.underlyingPrice) < Math.abs(closest - optionsData.underlyingPrice) 
      ? strike 
      : closest
  );

  // Calculate days to expiration
  const getDaysToExpiration = (expiration: string) => {
    const expDate = new Date(expiration);
    const today = new Date();
    const diffTime = expDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const formatExpiration = (expiration: string) => {
    const date = new Date(expiration);
    const days = getDaysToExpiration(expiration);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    return `${monthNames[date.getMonth()]}. ${String(date.getDate()).padStart(2, '0')}, ${date.getFullYear()} (W) ${days} days`;
  };

  return (
    <Card className="w-full" data-testid={testId}>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Options Chain</CardTitle>
          <Button 
            variant="ghost" 
            size="icon"
            onClick={fetchOptionsChain}
            disabled={loading}
            data-testid="refresh-options-chain"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
        
        {/* Schwab-style controls */}
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">View</span>
            <Select value={view} onValueChange={setView}>
              <SelectTrigger className="w-36" data-testid="view-selector">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="calls-puts">Calls & Puts</SelectItem>
                <SelectItem value="calls">Calls Only</SelectItem>
                <SelectItem value="puts">Puts Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Strikes</span>
            <Select value={strikesCount} onValueChange={setStrikesCount}>
              <SelectTrigger className="w-16" data-testid="strikes-selector">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="6">6</SelectItem>
                <SelectItem value="8">8</SelectItem>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="15">15</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Expirations</span>
            <Select value={selectedExpiration} onValueChange={setSelectedExpiration}>
              <SelectTrigger className="w-32" data-testid="expiration-selector">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                {expirations.map(exp => (
                  <SelectItem key={exp} value={exp}>
                    {getDaysToExpiration(exp)} Days
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <Button variant="outline" size="sm" data-testid="filters-button">
            <Filter className="h-4 w-4 mr-2" />
            Filters
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {/* Schwab-style header */}
        <div className="grid grid-cols-11 border-b bg-muted/30">
          {(view === 'calls-puts' || view === 'calls') && (
            <>
              <div className="col-span-4 text-center py-3 bg-blue-600 text-white font-semibold">
                Calls
              </div>
            </>
          )}
          <div className="col-span-1 text-center py-3 bg-teal-600 text-white font-semibold">
            Strike
          </div>
          {(view === 'calls-puts' || view === 'puts') && (
            <>
              <div className="col-span-4 text-center py-3 bg-blue-600 text-white font-semibold">
                Puts
              </div>
            </>
          )}
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-11 border-b text-xs font-medium text-muted-foreground">
          {(view === 'calls-puts' || view === 'calls') && (
            <>
              <div className="text-center py-2">Bid</div>
              <div className="text-center py-2">Ask</div>
              <div className="text-center py-2">Last</div>
              <div className="text-center py-2">Change</div>
            </>
          )}
          <div className="text-center py-2"></div>
          {(view === 'calls-puts' || view === 'puts') && (
            <>
              <div className="text-center py-2">Bid</div>
              <div className="text-center py-2">Ask</div>
              <div className="text-center py-2">Last</div>
              <div className="text-center py-2">Change</div>
            </>
          )}
        </div>

        {/* Expiration section header */}
        <div className="border-b bg-muted/20 px-4 py-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">
              {formatExpiration(selectedExpiration || expirations[0])}
            </h3>
          </div>
        </div>

        {/* Options rows */}
        <div className="max-h-96 overflow-y-auto">
          {strikes.map(strike => {
            const group = strikeGroups[strike];
            const call = group.calls[0];
            const put = group.puts[0];
            const isATM = strike === atmStrike;

            return (
              <div
                key={strike}
                className={cn(
                  "grid grid-cols-11 border-b hover:bg-muted/20 text-sm",
                  isATM && "bg-gray-600 text-white font-medium"
                )}
                data-testid={`options-row-${strike}`}
              >
                {/* Calls data */}
                {(view === 'calls-puts' || view === 'calls') && (
                  <>
                    <div className="text-center py-2" data-testid={`call-bid-${strike}`}>
                      {call ? call.bid.toFixed(2) : '--'}
                    </div>
                    <div className="text-center py-2" data-testid={`call-ask-${strike}`}>
                      {call ? call.ask.toFixed(2) : '--'}
                    </div>
                    <div className="text-center py-2" data-testid={`call-last-${strike}`}>
                      {call ? call.last.toFixed(2) : '--'}
                    </div>
                    <div className="text-center py-2" data-testid={`call-change-${strike}`}>
                      {call?.change ? (
                        <span className={cn(
                          call.change > 0 ? "text-green-600" : call.change < 0 ? "text-red-600" : ""
                        )}>
                          {call.change > 0 ? '+' : ''}{call.change.toFixed(2)}
                        </span>
                      ) : (
                        <span>0.00</span>
                      )}
                    </div>
                  </>
                )}

                {/* Strike price */}
                <div className="text-center py-2 font-semibold" data-testid={`strike-${strike}`}>
                  {strike.toFixed(2)}
                </div>

                {/* Puts data */}
                {(view === 'calls-puts' || view === 'puts') && (
                  <>
                    <div className="text-center py-2" data-testid={`put-bid-${strike}`}>
                      {put ? put.bid.toFixed(2) : '--'}
                    </div>
                    <div className="text-center py-2" data-testid={`put-ask-${strike}`}>
                      {put ? put.ask.toFixed(2) : '--'}
                    </div>
                    <div className="text-center py-2" data-testid={`put-last-${strike}`}>
                      {put ? put.last.toFixed(2) : '--'}
                    </div>
                    <div className="text-center py-2" data-testid={`put-change-${strike}`}>
                      {put?.change ? (
                        <span className={cn(
                          put.change > 0 ? "text-green-600" : put.change < 0 ? "text-red-600" : ""
                        )}>
                          {put.change > 0 ? '+' : ''}{put.change.toFixed(2)}
                        </span>
                      ) : (
                        <span>0.00</span>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default SchwabStyleOptionsChain;