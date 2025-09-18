import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { StrategyType } from "@shared/schema";

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
      return await apiRequest("/api/tickers", { 
        method: "POST", 
        data: { 
          symbol,
          strategyType,
          expirationDate 
        } 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/summary"] });
      setSymbol("");
      
      // Track search activity for achievements
      const searchCount = parseInt(localStorage.getItem('search-count') || '0') + 1;
      localStorage.setItem('search-count', searchCount.toString());
      
      toast({
        title: "Success",
        description: "Ticker added successfully",
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
