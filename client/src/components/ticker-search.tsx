import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequestWithAuth } from "@/lib/supabaseAuth";
import type { StrategyType, TickerWithPosition } from "@shared/schema";

interface TickerSearchProps {
  strategyType?: StrategyType;
  expirationDate?: string;
}

export function TickerSearch({ strategyType = 'long_strangle', expirationDate }: TickerSearchProps) {
  const [symbol, setSymbol] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const addTickerMutation = useMutation({
    mutationFn: async (symbol: string) => {
      console.log('🎯 Starting ticker creation for:', symbol);
      
      const payload = {
        symbol,
        strategyType,
        expirationDate,
      };
      
      console.log('📦 Ticker payload:', payload);

      try {
        const result = await apiRequestWithAuth("/api/tickers", { 
          method: "POST", 
          body: JSON.stringify(payload),
          headers: {
            'Content-Type': 'application/json',
          },
        });
        
        console.log('✅ Ticker creation API response:', result);
        return result;
      } catch (error) {
        console.error('❌ Ticker creation failed:', error);
        throw error;
      }
    },
    onSuccess: (newTicker: TickerWithPosition) => {
      console.log('✅ Ticker created successfully:', newTicker);
      
      // Update cache immediately with new ticker
      queryClient.setQueryData(["/api/tickers"], (current: TickerWithPosition[] | undefined) => {
        const updated = current ? [...current, newTicker] : [newTicker];
        console.log('📊 Updated ticker cache:', updated.map(t => t.symbol));
        return updated;
      });

      // REMOVED delayed invalidation to prevent cascading requests
      // The optimistic update above is sufficient
      
      setSymbol("");
      
      // Track search activity for achievements
      const searchCount = parseInt(localStorage.getItem('search-count') || '0') + 1;
      localStorage.setItem('search-count', searchCount.toString());
      
      toast({
        title: "Success",
        description: `${newTicker.symbol} added successfully`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add ticker",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (symbol.trim()) {
      addTickerMutation.mutate(symbol.trim().toUpperCase());
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSubmit(e);
    }
  };

  return (
    <div className="relative flex items-center" data-testid="ticker-search">
      <Input
        type="text"
        placeholder="Add ticker (e.g., AAPL)"
        value={symbol}
        onChange={(e) => setSymbol(e.target.value.toUpperCase())}
        onKeyPress={handleKeyPress}
        className="w-64 pr-10"
        data-testid="input-ticker-symbol"
        disabled={addTickerMutation.isPending}
      />
      <Button
        onClick={handleSubmit}
        disabled={!symbol.trim() || addTickerMutation.isPending}
        className="absolute right-1 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0"
        data-testid="button-add-ticker"
      >
        <Plus className="w-4 h-4" />
      </Button>
    </div>
  );
}
