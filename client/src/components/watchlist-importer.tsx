import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, Check, X, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface ParsedWatchlistItem {
  symbol: string;
  name?: string;
  price?: number;
  change?: number;
  changePercent?: number;
}

export function WatchlistImporter() {
  const [watchlistData, setWatchlistData] = useState("");
  const [parsedItems, setParsedItems] = useState<ParsedWatchlistItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Parse ThinkOrSwim watchlist data
  const parseWatchlistData = (data: string): ParsedWatchlistItem[] => {
    const lines = data.trim().split('\n');
    const items: ParsedWatchlistItem[] = [];
    
    for (const line of lines) {
      // Handle different ThinkOrSwim export formats
      if (line.trim() === '' || line.startsWith('Symbol') || line.startsWith('Name')) continue;
      
      // Try CSV format first (Symbol, Name, Last, Change, %Change)
      if (line.includes(',')) {
        const parts = line.split(',').map(p => p.trim().replace(/"/g, ''));
        if (parts.length >= 1) {
          const symbol = parts[0].toUpperCase();
          if (symbol && /^[A-Z]{1,5}$/.test(symbol)) {
            items.push({
              symbol,
              name: parts[1] || undefined,
              price: parts[2] ? parseFloat(parts[2]) : undefined,
              change: parts[3] ? parseFloat(parts[3]) : undefined,
              changePercent: parts[4] ? parseFloat(parts[4].replace('%', '')) : undefined,
            });
          }
        }
      }
      // Handle tab-separated format
      else if (line.includes('\t')) {
        const parts = line.split('\t').map(p => p.trim());
        if (parts.length >= 1) {
          const symbol = parts[0].toUpperCase();
          if (symbol && /^[A-Z]{1,5}$/.test(symbol)) {
            items.push({
              symbol,
              name: parts[1] || undefined,
              price: parts[2] ? parseFloat(parts[2]) : undefined,
              change: parts[3] ? parseFloat(parts[3]) : undefined,
              changePercent: parts[4] ? parseFloat(parts[4].replace('%', '')) : undefined,
            });
          }
        }
      }
      // Handle simple symbol list (one per line)
      else {
        const symbol = line.trim().toUpperCase();
        if (symbol && /^[A-Z]{1,5}$/.test(symbol)) {
          items.push({ symbol });
        }
      }
    }
    
    // Remove duplicates
    const uniqueItems = items.filter((item, index, self) => 
      index === self.findIndex(i => i.symbol === item.symbol)
    );
    
    return uniqueItems;
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setWatchlistData(content);
      handleParseData(content);
    };
    reader.readAsText(file);
  };

  const handleParseData = (data: string = watchlistData) => {
    try {
      const parsed = parseWatchlistData(data);
      setParsedItems(parsed);
      
      if (parsed.length === 0) {
        toast({
          title: "No symbols found",
          description: "Please check your watchlist format and try again",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Watchlist parsed",
          description: `Found ${parsed.length} symbols`,
        });
      }
    } catch (error) {
      toast({
        title: "Parse error",
        description: "Failed to parse watchlist data",
        variant: "destructive",
      });
    }
  };

  // Import symbols to active tickers
  const importMutation = useMutation({
    mutationFn: async (symbols: string[]) => {
      setIsProcessing(true);
      const results = [];
      
      for (const symbol of symbols) {
        try {
          const result = await apiRequest("/api/tickers", {
            method: "POST",
            data: { symbol },
          });
          results.push({ symbol, success: true, data: result });
        } catch (error) {
          results.push({ symbol, success: false, error: error instanceof Error ? error.message : String(error) });
        }
      }
      
      return results;
    },
    onSuccess: (results) => {
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      
      queryClient.invalidateQueries({ queryKey: ["/api/tickers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/summary"] });
      
      toast({
        title: "Import completed",
        description: `${successful} symbols added successfully${failed > 0 ? `, ${failed} failed` : ''}`,
      });
      
      // Clear form on success
      if (failed === 0) {
        setWatchlistData("");
        setParsedItems([]);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    onError: (error) => {
      toast({
        title: "Import failed",
        description: error.message || "Failed to import watchlist",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsProcessing(false);
    },
  });

  const handleImport = () => {
    if (parsedItems.length === 0) return;
    
    const symbols = parsedItems.map(item => item.symbol);
    importMutation.mutate(symbols);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="w-5 h-5" />
          Import ThinkOrSwim Watchlist
        </CardTitle>
        <CardDescription>
          Upload a watchlist file or paste symbols to automatically add them as active tickers
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* File upload */}
        <div className="space-y-2">
          <Label htmlFor="file-upload">Upload Watchlist File</Label>
          <Input
            id="file-upload"
            type="file"
            accept=".csv,.txt,.tsv"
            onChange={handleFileUpload}
            ref={fileInputRef}
            data-testid="input-watchlist-file"
          />
          <p className="text-xs text-muted-foreground">
            Supports CSV, TSV, or plain text files with symbols
          </p>
        </div>

        {/* Manual input */}
        <div className="space-y-2">
          <Label htmlFor="watchlist-data">Or Paste Watchlist Data</Label>
          <Textarea
            id="watchlist-data"
            placeholder={`Paste your watchlist here. Supported formats:
AAPL
TSLA, Tesla Inc, 308.72, -0.54, -0.17%
MSFT    Microsoft Corp  527.75  -7.89   -1.47%`}
            value={watchlistData}
            onChange={(e) => setWatchlistData(e.target.value)}
            rows={6}
            data-testid="textarea-watchlist-data"
          />
          <Button 
            onClick={() => handleParseData()} 
            variant="outline" 
            size="sm"
            data-testid="button-parse-watchlist"
          >
            <FileText className="w-4 h-4 mr-2" />
            Parse Data
          </Button>
        </div>

        {/* Parsed results */}
        {parsedItems.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Parsed Symbols ({parsedItems.length})</Label>
              <Button 
                onClick={handleImport}
                disabled={isProcessing}
                data-testid="button-import-symbols"
              >
                {isProcessing ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Importing...
                  </div>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Import All Symbols
                  </>
                )}
              </Button>
            </div>
            
            <div className="max-h-40 overflow-y-auto border rounded-md p-3 space-y-2">
              {parsedItems.map((item, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" data-testid={`badge-symbol-${item.symbol}`}>
                      {item.symbol}
                    </Badge>
                    {item.name && (
                      <span className="text-sm text-muted-foreground truncate max-w-32">
                        {item.name}
                      </span>
                    )}
                  </div>
                  {item.price && (
                    <div className="text-sm text-right">
                      <div>${item.price}</div>
                      {item.changePercent && (
                        <div className={`text-xs ${item.changePercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {item.changePercent >= 0 ? '+' : ''}{item.changePercent.toFixed(2)}%
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Format examples */}
        <div className="bg-muted p-3 rounded-md">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Supported Formats</span>
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <div>• CSV: AAPL, Apple Inc, 202.92, -0.43, -0.21%</div>
            <div>• Tab-separated: TSLA  Tesla Inc       308.72  -0.54   -0.17%</div>
            <div>• Simple list: One symbol per line (AAPL, TSLA, MSFT)</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}