import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, X, Search, RefreshCw } from "lucide-react";

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
  impliedVolatility: number;
  change: number;
}

interface OptionsChainData {
  symbol: string;
  underlyingPrice: number;
  options: OptionsChainContract[];
  expirations?: string[];
  dataSource: string;
  correctionApplied: boolean;
  correctionFactor: number;
  totalContracts: number;
}

interface SchwabOptionsChainProps {
  symbol: string;
  isOpen: boolean;
  onClose: () => void;
  selectedExpiration?: string; // Add expiration prop from dashboard
  onExpirationChange?: (expiration: string) => void;
  testId?: string;
}

export function SchwabOptionsChain({ symbol, isOpen, onClose, selectedExpiration: dashboardExpiration, onExpirationChange, testId = "schwab-options-chain" }: SchwabOptionsChainProps) {
  const [optionsData, setOptionsData] = useState<OptionsChainData | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedExpiration, setSelectedExpiration] = useState<string>("");
  const [expandedExpirations, setExpandedExpirations] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Sync with dashboard expiration selection
  useEffect(() => {
    if (dashboardExpiration && dashboardExpiration !== selectedExpiration) {
      console.log(`📅 SchwabOptionsChain syncing with dashboard expiration: ${dashboardExpiration}`);
      setSelectedExpiration(dashboardExpiration);
      // Expand the new expiration
      setExpandedExpirations(new Set([dashboardExpiration]));
      // Force refresh of options data
      fetchOptionsChain();
    }
  }, [dashboardExpiration]);

  const fetchOptionsChain = async () => {
    if (!symbol) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/market-data/options-chain/${symbol}`);
      if (response.ok) {
        const data = await response.json();
        setOptionsData(data);
        
        // Set default expiration and expand it - use first expiration from 90-day range  
        if (data.options.length > 0) {
          const expirations = Array.from(new Set(data.options.map((opt: any) => opt.expiration_date))).sort() as string[];
          console.log('📊 Available expirations:', expirations);
          
          if (expirations.length > 0) {
            // Use the first (nearest) expiration and expand it by default
            const firstExpiration = expirations[0] as string;
            console.log('📊 Selected default expiration (Friday):', firstExpiration);
            setSelectedExpiration(firstExpiration);
            setExpandedExpirations(new Set([firstExpiration]));
            
            // Trigger position recalculation with the default expiration
            if (onExpirationChange) {
              onExpirationChange(firstExpiration);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error fetching options chain:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchOptionsChain();
    }
  }, [symbol, isOpen]);

  const toggleExpiration = (expiration: string) => {
    const newExpanded = new Set(expandedExpirations);
    if (newExpanded.has(expiration)) {
      newExpanded.delete(expiration);
    } else {
      newExpanded.add(expiration);
    }
    setExpandedExpirations(newExpanded);
    
    // Update selected expiration and trigger position recalculation
    setSelectedExpiration(expiration);
    if (onExpirationChange) {
      onExpirationChange(expiration);
    }
  };

  const formatDate = (dateStr: string, options?: any[]) => {
    // First, check if any option for this expiration has expirationLabel (new backend format)
    const optionWithLabel = options?.find((opt: any) => opt.expiration_date === dateStr && opt.expirationLabel);
    
    if (optionWithLabel?.expirationLabel) {
      // Use the pre-formatted label from backend (e.g., "Sep. 05, 2025 (W) 2 days")
      return optionWithLabel.expirationLabel;
    }
    
    // Fallback to old formatting if no label available
    const date = new Date(dateStr);
    const today = new Date();
    const diffTime = date.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    const formatOptions: Intl.DateTimeFormatOptions = { 
      month: 'short', 
      day: '2-digit', 
      year: 'numeric',
      weekday: 'short'
    };
    
    return `${date.toLocaleDateString('en-US', formatOptions)} ${diffDays} days`;
  };

  if (!isOpen) return null;

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" data-testid={`${testId}-loading`}>
        <Card className="w-full max-w-4xl mx-4">
          <CardContent className="p-8 text-center">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p>Loading options chain for {symbol}...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!optionsData) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" data-testid={`${testId}-error`}>
        <Card className="w-full max-w-4xl mx-4">
          <CardContent className="p-8 text-center">
            <p className="text-red-600 mb-4">Failed to load options chain</p>
            <Button onClick={onClose} data-testid="button-close-error">Close</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Get available expirations from the data - backend uses expiration_date field
  const availableExpirations = optionsData 
    ? (optionsData.expirations || Array.from(new Set(optionsData.options.map((opt: any) => opt.expiration_date)))).sort()
    : [];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" data-testid={testId}>
      <Card className="w-full max-w-7xl max-h-[95vh] overflow-hidden">
        <CardHeader className="border-b bg-gray-50 pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-semibold" data-testid="text-title">
              Options Chain - {symbol}
            </CardTitle>
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search symbols..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-48"
                  data-testid="input-search"
                />
              </div>
              <Button 
                onClick={onClose}
                variant="ghost"
                size="sm"
                data-testid="button-close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 max-h-[75vh] overflow-y-auto bg-white">
          {/* Professional Two-Tier Header */}
          <div className="sticky top-0 bg-white border-b-2 border-gray-400 z-10 shadow-md">
            {/* First tier - Category headers */}
            <div className="grid grid-cols-7 gap-0 text-sm font-bold">
              <div className="col-span-3 text-center py-2 px-3 text-green-600 bg-green-50 dark:bg-green-950 border-r-2 border-gray-400" data-testid="header-calls">
                Calls
              </div>
              <div className="col-span-1 text-center py-2 px-3 text-blue-600 bg-blue-50 dark:bg-blue-950 border-r-2 border-gray-400" data-testid="header-strike">
                Strike
              </div>
              <div className="col-span-3 text-center py-2 px-3 text-red-600 bg-red-50 dark:bg-red-950" data-testid="header-puts">
                Puts
              </div>
            </div>
            {/* Second tier - Column headers */}
            <div className="grid grid-cols-7 gap-0 text-xs font-semibold text-gray-800 uppercase tracking-wider border-t border-gray-300">
              {/* Call column headers */}
              <div className="text-center py-3 px-3 border-r border-gray-300 bg-green-100 text-green-900">Bid</div>
              <div className="text-center py-3 px-3 border-r border-gray-300 bg-green-100 text-green-900">Ask</div>
              <div className="text-center py-3 px-3 border-r-2 border-gray-400 bg-green-100 text-green-900">Last</div>
              
              {/* Strike column header */}
              <div className="text-center py-3 px-3 border-r-2 border-gray-400 font-bold text-gray-800 bg-gray-100">Strike</div>
              
              {/* Put column headers */}
              <div className="text-center py-3 px-3 border-r border-gray-300 bg-red-100 text-red-900">Bid</div>
              <div className="text-center py-3 px-3 border-r border-gray-300 bg-red-100 text-red-900">Ask</div>
              <div className="text-center py-3 px-3 bg-red-100 text-red-900">Last</div>
            </div>
          </div>

          {/* Expiration Sections */}
          {availableExpirations.map(expiration => {
            const expirationOptions = optionsData.options.filter((opt: any) => opt.expiration_date === expiration);
            const strikeGroups = expirationOptions.reduce((acc: any, option: any) => {
              if (!acc[option.strike]) {
                acc[option.strike] = { calls: [], puts: [] };
              }
              if (option.contract_type === 'call') {
                acc[option.strike].calls.push(option);
              } else {
                acc[option.strike].puts.push(option);
              }
              return acc;
            }, {} as Record<number, { calls: any[]; puts: any[] }>);

            const strikes = Object.keys(strikeGroups).map(Number).sort((a, b) => a - b);
            const isExpanded = expandedExpirations.has(expiration);
            
            // Calculate days to expiration  
            const date = new Date(expiration);
            const today = new Date();
            const diffTime = date.getTime() - today.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            return (
              <div key={expiration} className="border-b">
                {/* Clean Expiration Header */}
                <div 
                  className="bg-gray-50 py-2 px-4 cursor-pointer hover:bg-gray-100 flex items-center justify-between border-b border-gray-200"
                  onClick={() => toggleExpiration(expiration)}
                  data-testid={`expiration-${expiration}`}
                >
                  <div className="flex items-center gap-2">
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-gray-600" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-gray-600" />
                    )}
                    <span className="text-sm font-medium text-gray-800">
                      {date.toLocaleDateString('en-US', { 
                        month: 'short', 
                        day: 'numeric'
                      })} ({diffDays}d)
                    </span>
                  </div>
                  <span className="text-xs text-gray-600">{strikes.length} strikes</span>
                </div>

                {/* Data Rows with Alternating Colors */}
                {isExpanded && strikes.map((strike, index) => {
                  const putOption = strikeGroups[strike]?.puts[0];
                  const callOption = strikeGroups[strike]?.calls[0];
                  const isAtm = Math.abs(strike - optionsData.underlyingPrice) < 5;
                  const isEvenRow = index % 2 === 0;

                  return (
                    <div 
                      key={strike} 
                      className={`grid grid-cols-7 gap-0 hover:bg-blue-50 hover:shadow-md border-b border-gray-300 ${
                        isAtm ? 'bg-yellow-50 border-yellow-200' : isEvenRow ? 'bg-white' : 'bg-gray-50'
                      }`}
                      data-testid={`strike-${strike}`}
                    >
                      {/* Call Data - Backgrounds match row */}
                      <div className={`text-center px-3 py-4 text-sm font-semibold text-black border-r border-gray-300 ${
                        isAtm ? 'bg-yellow-50' : 'bg-white'
                      }`}>
                        {callOption?.bid ? callOption.bid.toFixed(2) : '-'}
                      </div>
                      <div className={`text-center px-3 py-4 text-sm font-semibold text-black border-r border-gray-300 ${
                        isAtm ? 'bg-yellow-50' : 'bg-white'
                      }`}>
                        {callOption?.ask ? callOption.ask.toFixed(2) : '-'}
                      </div>
                      <div className={`text-center px-3 py-4 text-sm font-bold text-green-700 border-r-2 border-gray-400 ${
                        isAtm ? 'bg-yellow-50' : 'bg-white'
                      }`}>
                        {callOption?.last ? callOption.last.toFixed(2) : '-'}
                      </div>
                      
                      {/* Strike - Center column */}
                      <div className={`text-center px-3 py-4 text-sm font-bold border-r-2 border-gray-400 ${
                        isAtm ? 'text-amber-800 bg-yellow-50' : 'text-gray-800 bg-gray-100'
                      }`}>
                        {strike}
                      </div>
                      
                      {/* Put Data - Backgrounds match row */}
                      <div className={`text-center px-3 py-4 text-sm font-semibold text-black border-r border-gray-300 ${
                        isAtm ? 'bg-yellow-50' : 'bg-white'
                      }`}>
                        {putOption?.bid ? putOption.bid.toFixed(2) : '-'}
                      </div>
                      <div className={`text-center px-3 py-4 text-sm font-semibold text-black border-r border-gray-300 ${
                        isAtm ? 'bg-yellow-50' : 'bg-white'
                      }`}>
                        {putOption?.ask ? putOption.ask.toFixed(2) : '-'}
                      </div>
                      <div className={`text-center px-3 py-4 text-sm font-bold text-red-700 ${
                        isAtm ? 'bg-yellow-50' : 'bg-white'
                      }`}>
                        {putOption?.last ? putOption.last.toFixed(2) : '-'}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </CardContent>

        {/* Footer with data source info */}
        <div className="border-t bg-gray-50 px-4 py-2 text-xs text-gray-600">
          <div className="flex items-center justify-between">
            <div>
              {optionsData.correctionApplied && (
                <span className="text-green-600 font-medium">
                  ✓ Real market data from Market Data API
                </span>
              )}
            </div>
            <div>
              {optionsData.totalContracts} contracts • {optionsData.dataSource}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}