import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingDown, TrendingUp, DollarSign } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface StrikeSelectorProps {
  symbol: string;
  currentPrice: number;
  currentPutStrike: number;
  currentCallStrike: number;
  onStrikeChange: (putStrike: number, callStrike: number, putPremium: number, callPremium: number) => void;
  onCancel: () => void;
}

interface OptionStrike {
  strike: number;
  bid: number;
  ask: number;
  premium: number;
  volume: number;
  openInterest: number;
  delta?: number;
}

interface OptionsChainData {
  symbol: string;
  expirationDates: string[];
  chains: {
    [expiration: string]: {
      calls: Array<{
        strike: number;
        bid: number;
        ask: number;
        volume?: number;
        openInterest?: number;
        delta?: number;
      }>;
      puts: Array<{
        strike: number;
        bid: number;
        ask: number;
        volume?: number;
        openInterest?: number;
        delta?: number;
      }>;
    };
  };
}

export function StrikeSelector({ 
  symbol, 
  currentPrice, 
  currentPutStrike, 
  currentCallStrike, 
  onStrikeChange, 
  onCancel 
}: StrikeSelectorProps) {
  const [selectedPutStrike, setSelectedPutStrike] = useState<number>(currentPutStrike);
  const [selectedCallStrike, setSelectedCallStrike] = useState<number>(currentCallStrike);
  const [selectedExpiration, setSelectedExpiration] = useState<string>("");

  const { data: optionsData, isLoading } = useQuery<OptionsChainData>({
    queryKey: [`/api/market-data/options-chain/${symbol}`],
    enabled: !!symbol,
    refetchInterval: 15 * 60 * 1000, // Refresh every 15 minutes to match premium updates
    staleTime: 5 * 60 * 1000, // Consider stale after 5 minutes
  });

  useEffect(() => {
    if (optionsData && optionsData.expirationDates.length > 0 && !selectedExpiration) {
      // Deduplicate expiration dates and default to first (usually nearest)
      const uniqueExpirations = Array.from(new Set(optionsData.expirationDates));
      setSelectedExpiration(uniqueExpirations[0]);
    }
  }, [optionsData, selectedExpiration]);

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center space-x-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Loading options chain for {symbol}...</span>
        </div>
      </Card>
    );
  }

  if (!optionsData || !selectedExpiration) {
    return (
      <Card className="p-6">
        <div className="text-center text-muted-foreground">
          <p>No options data available for {symbol}</p>
          <Button variant="outline" onClick={onCancel} className="mt-4">
            Cancel
          </Button>
        </div>
      </Card>
    );
  }

  const chainData = optionsData.chains[selectedExpiration];
  if (!chainData) {
    return (
      <Card className="p-6">
        <div className="text-center text-muted-foreground">
          <p>No options available for selected expiration</p>
          <Button variant="outline" onClick={onCancel} className="mt-4">
            Cancel
          </Button>
        </div>
      </Card>
    );
  }

  // Filter and format puts - Include more strikes around current price for better selection
  let puts: OptionStrike[] = chainData.puts
    .filter((put: any) => {
      // Include strikes within 20% of current price (both above and below)
      const priceRange = currentPrice * 0.2;
      const withinRange = Math.abs(put.strike - currentPrice) <= priceRange;
      const hasValidBidAsk = put.bid > 0 && put.ask > 0;
      
      // Always include strikes very close to current price (within $5)
      const veryClose = Math.abs(put.strike - currentPrice) <= 5;
      
      return (withinRange || veryClose) && hasValidBidAsk;
    })
    .map((put: any) => ({
      strike: put.strike,
      bid: put.bid,
      ask: put.ask,
      premium: (put.bid + put.ask) / 2,
      volume: put.volume || 0,
      openInterest: put.openInterest || 0,
      delta: put.delta,
    }))
    .sort((a: any, b: any) => b.strike - a.strike); // Highest strike first

  // Filter and format calls - Include more strikes around current price for better selection
  let calls: OptionStrike[] = chainData.calls
    .filter((call: any) => {
      // Include strikes within 20% of current price (both above and below)
      const priceRange = currentPrice * 0.2;
      const withinRange = Math.abs(call.strike - currentPrice) <= priceRange;
      const hasValidBidAsk = call.bid > 0 && call.ask > 0;
      
      // Always include strikes very close to current price (within $5)
      const veryClose = Math.abs(call.strike - currentPrice) <= 5;
      
      return (withinRange || veryClose) && hasValidBidAsk;
    })
    .map((call: any) => ({
      strike: call.strike,
      bid: call.bid,
      ask: call.ask,
      premium: (call.bid + call.ask) / 2,
      volume: call.volume || 0,
      openInterest: call.openInterest || 0,
      delta: call.delta,
    }))
    .sort((a: any, b: any) => a.strike - b.strike); // Lowest strike first

  // Ensure current manually selected strikes are always available in the options
  // This handles cases where selected strikes don't appear in the filtered API data
  const currentPutExists = puts.some(p => p.strike === currentPutStrike);
  const currentCallExists = calls.some(c => c.strike === currentCallStrike);

  if (!currentPutExists && currentPutStrike) {
    // Add the manually selected put strike as an option
    const putFromApi = chainData.puts.find((p: any) => p.strike === currentPutStrike);
    if (putFromApi) {
      puts.push({
        strike: putFromApi.strike,
        bid: putFromApi.bid || 0,
        ask: putFromApi.ask || 0,
        premium: putFromApi.bid && putFromApi.ask ? (putFromApi.bid + putFromApi.ask) / 2 : 0,
        volume: putFromApi.volume || 0,
        openInterest: putFromApi.openInterest || 0,
        delta: putFromApi.delta,
      });
      puts.sort((a, b) => b.strike - a.strike);
    }
  }

  if (!currentCallExists && currentCallStrike) {
    // Add the manually selected call strike as an option
    const callFromApi = chainData.calls.find((c: any) => c.strike === currentCallStrike);
    if (callFromApi) {
      calls.push({
        strike: callFromApi.strike,
        bid: callFromApi.bid || 0,
        ask: callFromApi.ask || 0,
        premium: callFromApi.bid && callFromApi.ask ? (callFromApi.bid + callFromApi.ask) / 2 : 0,
        volume: callFromApi.volume || 0,
        openInterest: callFromApi.openInterest || 0,
        delta: callFromApi.delta,
      });
      calls.sort((a, b) => a.strike - b.strike);
    }
  }

  const selectedPut = puts.find(p => p.strike === selectedPutStrike);
  const selectedCall = calls.find(c => c.strike === selectedCallStrike);

  // Debug logging to verify correct mapping
  console.debug("🎯 StrikeSelector rendered correctly for", symbol);
  console.debug("📊 Long Put section shows puts:", puts.slice(0, 3).map(p => `${p.strike}@${p.premium.toFixed(2)}`));
  console.debug("📈 Long Call section shows calls:", calls.slice(0, 3).map(c => `${c.strike}@${c.premium.toFixed(2)}`));

  const handleApplyChanges = () => {
    if (selectedPut && selectedCall) {
      onStrikeChange(
        selectedPutStrike,
        selectedCallStrike,
        selectedPut.premium,
        selectedCall.premium
      );
    }
  };

  const formatStrikeLabel = (option: OptionStrike, type: 'put' | 'call') => {
    const moneyness = type === 'put' 
      ? ((currentPrice - option.strike) / currentPrice * 100).toFixed(1)
      : ((option.strike - currentPrice) / currentPrice * 100).toFixed(1);
    
    return `$${option.strike} (${moneyness}% OTM) - $${option.premium.toFixed(2)}`;
  };

  const totalPremium = (selectedPut?.premium || 0) + (selectedCall?.premium || 0);
  const maxLoss = totalPremium;
  const lowerBreakeven = selectedPutStrike - totalPremium;
  const upperBreakeven = selectedCallStrike + totalPremium;

  return (
    <Card className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Select Strike Prices - {symbol}</h3>
        <Badge variant="outline">Current: ${currentPrice.toFixed(2)}</Badge>
      </div>

      {/* Expiration Selection */}
      <div className="space-y-2">
        <Label>Expiration Date</Label>
        <Select value={selectedExpiration} onValueChange={setSelectedExpiration}>
          <SelectTrigger>
            <SelectValue placeholder="Select expiration" />
          </SelectTrigger>
          <SelectContent>
            {Array.from(new Set(optionsData.expirationDates)).map((date: string, i: number) => (
              <SelectItem key={`${date}-${i}`} value={date}>
                {new Date(date).toLocaleDateString()} ({Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))} days)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Call Strike Selection - Showing call data */}
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <TrendingUp className="w-4 h-4 text-green-500" />
            <Label>Long Call Strike</Label>
          </div>
          <Select value={selectedCallStrike.toString()} onValueChange={(value) => setSelectedCallStrike(Number(value))}>
            <SelectTrigger>
              <SelectValue placeholder="Select call strike" />
            </SelectTrigger>
            <SelectContent>
              {calls.map((call) => (
                <SelectItem key={call.strike} value={call.strike.toString()}>
                  {formatStrikeLabel(call, 'call')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {selectedCall && (
            <div className="text-sm text-muted-foreground space-y-1">
              <p>Bid: ${selectedCall.bid.toFixed(2)} | Ask: ${selectedCall.ask.toFixed(2)}</p>
              <p>Volume: {selectedCall.volume} | OI: {selectedCall.openInterest}</p>
              {selectedCall.delta && <p>Delta: {selectedCall.delta.toFixed(3)}</p>}
            </div>
          )}
        </div>

        {/* Put Strike Selection - Showing put data */}
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <TrendingDown className="w-4 h-4 text-red-500" />
            <Label>Long Put Strike</Label>
          </div>
          <Select value={selectedPutStrike.toString()} onValueChange={(value) => setSelectedPutStrike(Number(value))}>
            <SelectTrigger>
              <SelectValue placeholder="Select put strike" />
            </SelectTrigger>
            <SelectContent>
              {puts.map((put) => (
                <SelectItem key={put.strike} value={put.strike.toString()}>
                  {formatStrikeLabel(put, 'put')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {selectedPut && (
            <div className="text-sm text-muted-foreground space-y-1">
              <p>Bid: ${selectedPut.bid.toFixed(2)} | Ask: ${selectedPut.ask.toFixed(2)}</p>
              <p>Volume: {selectedPut.volume} | OI: {selectedPut.openInterest}</p>
              {selectedPut.delta && <p>Delta: {selectedPut.delta.toFixed(3)}</p>}
            </div>
          )}
        </div>
      </div>

      {/* Position Summary */}
      {selectedPut && selectedCall && (
        <div className="bg-muted/50 p-4 rounded-lg space-y-3">
          <div className="flex items-center space-x-2">
            <DollarSign className="w-4 h-4" />
            <h4 className="font-medium">Position Summary</h4>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Total Premium</p>
              <p className="font-semibold">${totalPremium.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Max Loss</p>
              <p className="font-semibold text-red-600">
                {maxLoss === Number.MAX_SAFE_INTEGER ? 'Unlimited' : `$${maxLoss.toFixed(2)}`}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Lower Breakeven</p>
              <p className="font-semibold">${lowerBreakeven.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Upper Breakeven</p>
              <p className="font-semibold">${upperBreakeven.toFixed(2)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-end space-x-3">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button 
          onClick={handleApplyChanges}
          disabled={!selectedPut || !selectedCall}
        >
          Apply Changes
        </Button>
      </div>
    </Card>
  );
}