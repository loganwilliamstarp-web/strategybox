import { Clock, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useRefreshTimer } from "@/hooks/useRefreshTimer";

interface RefreshTimerProps {
  intervalMinutes?: number;
  className?: string;
}

export function RefreshTimer({ intervalMinutes = 15, className = "" }: RefreshTimerProps) {
  const { formattedTime, isRefreshing } = useRefreshTimer(intervalMinutes);

  return (
    <div className={`flex items-center gap-2 ${className}`} data-testid="refresh-timer">
      <Badge 
        variant={isRefreshing ? "destructive" : "secondary"}
        className="flex items-center gap-1 text-xs font-mono"
        data-testid="refresh-timer-badge"
      >
        {isRefreshing ? (
          <RefreshCw className="h-3 w-3 animate-spin" data-testid="refresh-timer-spinning" />
        ) : (
          <Clock className="h-3 w-3" data-testid="refresh-timer-clock" />
        )}
        <span data-testid="refresh-timer-countdown">
          {isRefreshing ? "Refreshing..." : `${formattedTime}`}
        </span>
      </Badge>
      {!isRefreshing && (
        <span className="text-xs text-muted-foreground" data-testid="refresh-timer-label">
          until next data refresh
        </span>
      )}
    </div>
  );
}