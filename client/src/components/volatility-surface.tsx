import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveContainer, Surface } from "recharts";
import { TrendingUp, Activity, BarChart3 } from "lucide-react";

interface VolatilitySurfaceProps {
  symbol: string;
  isOpen: boolean;
  onClose: () => void;
}

interface VolatilityPoint {
  strike: number;
  expiration: string;
  daysToExp: number;
  impliedVol: number;
  moneyness: number; // strike/spot ratio
}

interface VolatilitySurfaceData {
  points: VolatilityPoint[];
  currentPrice: number;
  surfaceStats: {
    avgIV: number;
    minIV: number;
    maxIV: number;
    ivSkew: number;
    termStructure: 'upward' | 'downward' | 'flat';
  };
}

export function VolatilitySurfaceComponent({ symbol, isOpen, onClose }: VolatilitySurfaceProps) {
  const [selectedView, setSelectedView] = useState<"3d" | "heatmap" | "term-structure">("heatmap");

  const { data: volSurfaceData, isLoading, error } = useQuery<VolatilitySurfaceData>({
    queryKey: ['/api/volatility-surface', symbol],
    enabled: !!symbol && isOpen,
  });

  if (!isOpen) return null;

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
        <Card className="w-full max-w-6xl">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center">
                <Activity className="h-5 w-5 mr-2 text-purple-600" />
                Volatility Surface - {symbol}
              </div>
              <Button variant="ghost" size="sm" onClick={onClose}>×</Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center h-96">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
                <p className="text-muted-foreground">Loading volatility surface...</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !volSurfaceData) {
    return (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
        <Card className="w-full max-w-6xl">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center">
                <Activity className="h-5 w-5 mr-2 text-purple-600" />
                Volatility Surface - {symbol}
              </div>
              <Button variant="ghost" size="sm" onClick={onClose}>×</Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-12">
              <p className="text-muted-foreground">Unable to load volatility surface data for {symbol}</p>
              <p className="text-sm text-muted-foreground mt-2">
                This feature requires options chain data with IV calculations
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const renderHeatmap = () => {
    // Group by expiration dates
    const expirations = Array.from(new Set(volSurfaceData.points.map(p => p.expiration))).sort();
    const strikes = Array.from(new Set(volSurfaceData.points.map(p => p.strike))).sort((a, b) => a - b);
    
    const getVolatility = (strike: number, expiration: string) => {
      const point = volSurfaceData.points.find(p => p.strike === strike && p.expiration === expiration);
      return point ? point.impliedVol : 0;
    };

    const getColorIntensity = (iv: number) => {
      const normalized = (iv - volSurfaceData.surfaceStats.minIV) / 
                        (volSurfaceData.surfaceStats.maxIV - volSurfaceData.surfaceStats.minIV);
      return Math.max(0.1, Math.min(1, normalized));
    };

    return (
      <div className="overflow-auto">
        <div className="min-w-[800px]">
          <div className="grid gap-1" style={{ gridTemplateColumns: `120px repeat(${expirations.length}, 100px)` }}>
            {/* Header row */}
            <div className="p-2 font-semibold text-xs text-center">Strike</div>
            {expirations.map(exp => (
              <div key={exp} className="p-2 font-semibold text-xs text-center bg-gray-100 rounded">
                {new Date(exp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
            ))}
            
            {/* Data rows */}
            {strikes.map(strike => (
              <div key={strike} className="contents">
                <div className={`p-2 text-xs text-center font-medium ${
                  Math.abs(strike - volSurfaceData.currentPrice) / volSurfaceData.currentPrice < 0.05 
                    ? 'bg-blue-100 border-l-2 border-blue-500' 
                    : 'bg-gray-50'
                }`}>
                  ${strike}
                </div>
                {expirations.map(exp => {
                  const iv = getVolatility(strike, exp);
                  const intensity = iv > 0 ? getColorIntensity(iv) : 0;
                  return (
                    <div
                      key={`${strike}-${exp}`}
                      className="p-2 text-xs text-center font-medium rounded"
                      style={{
                        backgroundColor: iv > 0 
                          ? `rgba(139, 69, 19, ${intensity})` 
                          : '#f9fafb',
                        color: intensity > 0.5 ? 'white' : 'black'
                      }}
                    >
                      {iv > 0 ? `${iv.toFixed(1)}%` : '-'}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderTermStructure = () => {
    // Group by moneyness levels (ATM, OTM puts, OTM calls)
    const atmPoints = volSurfaceData.points.filter(p => Math.abs(p.moneyness - 1) < 0.05);
    const otmPuts = volSurfaceData.points.filter(p => p.moneyness < 0.95);
    const otmCalls = volSurfaceData.points.filter(p => p.moneyness > 1.05);

    const renderTermLine = (points: VolatilityPoint[], label: string, color: string) => (
      <div className="mb-4">
        <h4 className="text-sm font-medium mb-2 flex items-center">
          <div className={`w-3 h-3 rounded-full mr-2`} style={{ backgroundColor: color }}></div>
          {label}
        </h4>
        <div className="grid grid-cols-6 gap-2 text-xs">
          {points.sort((a, b) => a.daysToExp - b.daysToExp).map(point => (
            <div key={`${point.strike}-${point.expiration}`} className="text-center bg-gray-50 p-2 rounded">
              <div className="font-medium">{point.daysToExp}d</div>
              <div style={{ color }}>{point.impliedVol.toFixed(1)}%</div>
            </div>
          ))}
        </div>
      </div>
    );

    return (
      <div className="space-y-4">
        {atmPoints.length > 0 && renderTermLine(atmPoints, "At-the-Money", "#3b82f6")}
        {otmPuts.length > 0 && renderTermLine(otmPuts, "OTM Puts", "#ef4444")}
        {otmCalls.length > 0 && renderTermLine(otmCalls, "OTM Calls", "#22c55e")}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <Card className="w-full max-w-7xl max-h-[90vh] overflow-hidden">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center">
              <Activity className="h-5 w-5 mr-2 text-purple-600" />
              Volatility Surface - {symbol}
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={onClose} data-testid="button-close-vol-surface">
              ×
            </Button>
          </div>
          
          {/* Stats Row */}
          <div className="grid grid-cols-5 gap-4 text-sm">
            <div className="text-center">
              <div className="text-muted-foreground">Current Price</div>
              <div className="font-semibold">${volSurfaceData.currentPrice.toFixed(2)}</div>
            </div>
            <div className="text-center">
              <div className="text-muted-foreground">Avg IV</div>
              <div className="font-semibold text-purple-600">{volSurfaceData.surfaceStats.avgIV.toFixed(1)}%</div>
            </div>
            <div className="text-center">
              <div className="text-muted-foreground">IV Range</div>
              <div className="font-semibold">
                {volSurfaceData.surfaceStats.minIV.toFixed(1)}% - {volSurfaceData.surfaceStats.maxIV.toFixed(1)}%
              </div>
            </div>
            <div className="text-center">
              <div className="text-muted-foreground">IV Skew</div>
              <div className="font-semibold text-orange-600">{volSurfaceData.surfaceStats.ivSkew.toFixed(2)}</div>
            </div>
            <div className="text-center">
              <div className="text-muted-foreground">Term Structure</div>
              <Badge variant={volSurfaceData.surfaceStats.termStructure === 'upward' ? 'default' : 'secondary'}>
                {volSurfaceData.surfaceStats.termStructure}
              </Badge>
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          {/* View Toggle */}
          <div className="flex gap-2 mb-4">
            <Button
              variant={selectedView === "heatmap" ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedView("heatmap")}
              data-testid="button-view-heatmap"
            >
              <BarChart3 className="h-4 w-4 mr-1" />
              Heatmap
            </Button>
            <Button
              variant={selectedView === "term-structure" ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedView("term-structure")}
              data-testid="button-view-term-structure"
            >
              <TrendingUp className="h-4 w-4 mr-1" />
              Term Structure
            </Button>
          </div>

          {/* Content */}
          <div className="overflow-auto max-h-96">
            {selectedView === "heatmap" && renderHeatmap()}
            {selectedView === "term-structure" && renderTermStructure()}
          </div>
          
          {/* Legend */}
          <div className="mt-4 pt-4 border-t text-xs text-muted-foreground">
            <div className="flex justify-between items-center">
              <div>Higher intensity = Higher implied volatility</div>
              <div className="flex items-center gap-4">
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-blue-100 border-l-2 border-blue-500 mr-1"></div>
                  ATM Strikes
                </div>
                <div>Data points: {volSurfaceData.points.length}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}