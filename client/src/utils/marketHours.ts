/**
 * Frontend Market Hours Utility
 * Client-side market hours detection for optimizing refresh intervals
 */

export interface MarketSession {
  isMarketOpen: boolean;
  isExtendedHours: boolean;
  sessionType: 'market' | 'extended' | 'closed';
}

export interface FrontendIntervals {
  refetchInterval: number | false; // React Query refetch interval
  description: string;
}

/**
 * Check if current time is during regular market hours
 * Market Hours: 9:30 AM - 4:00 PM ET, Monday-Friday
 */
export function isMarketHours(): boolean {
  const now = new Date();
  const etTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  
  // Check if it's a weekday (Monday = 1, Friday = 5)
  const dayOfWeek = etTime.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false; // Weekend
  }
  
  const hours = etTime.getHours();
  const minutes = etTime.getMinutes();
  const timeInMinutes = hours * 60 + minutes;
  
  // Market hours: 9:30 AM (570 min) to 4:00 PM (960 min) ET
  return timeInMinutes >= 570 && timeInMinutes < 960;
}

/**
 * Check if current time is during extended hours
 * Extended Hours: 4:00 AM - 9:30 AM ET and 4:00 PM - 8:00 PM ET
 */
export function isExtendedHours(): boolean {
  const now = new Date();
  const etTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  
  // Check if it's a weekday
  const dayOfWeek = etTime.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false; // Weekend
  }
  
  const hours = etTime.getHours();
  const minutes = etTime.getMinutes();
  const timeInMinutes = hours * 60 + minutes;
  
  // Pre-market: 4:00 AM (240 min) to 9:30 AM (570 min) ET
  // After-hours: 4:00 PM (960 min) to 8:00 PM (1200 min) ET
  return (timeInMinutes >= 240 && timeInMinutes < 570) || 
         (timeInMinutes >= 960 && timeInMinutes < 1200);
}

/**
 * Get current market session information
 */
export function getMarketSession(): MarketSession {
  const isMarket = isMarketHours();
  const isExtended = isExtendedHours();
  
  let sessionType: 'market' | 'extended' | 'closed';
  if (isMarket) {
    sessionType = 'market';
  } else if (isExtended) {
    sessionType = 'extended';
  } else {
    sessionType = 'closed';
  }
  
  return {
    isMarketOpen: isMarket,
    isExtendedHours: isExtended,
    sessionType,
  };
}

/**
 * Get optimal frontend refresh intervals based on market session
 */
export function getOptimalRefetchInterval(isRealtimeConnected: boolean): FrontendIntervals {
  const session = getMarketSession();
  
  // If WebSocket is connected, rely on real-time updates primarily
  if (isRealtimeConnected) {
    switch (session.sessionType) {
      case 'market':
        return {
          refetchInterval: 2 * 60 * 1000, // 2 minutes (backup to WebSocket)
          description: 'Market Hours: WebSocket primary, 2min backup'
        };
      case 'extended':
        return {
          refetchInterval: 5 * 60 * 1000, // 5 minutes
          description: 'Extended Hours: WebSocket primary, 5min backup'
        };
      case 'closed':
        return {
          refetchInterval: false, // No polling when market closed and WebSocket connected
          description: 'Market Closed: WebSocket only'
        };
    }
  }
  
  // If WebSocket is disconnected, use polling with market-aware intervals
  switch (session.sessionType) {
    case 'market':
      return {
        refetchInterval: 60 * 1000, // 1 minute
        description: 'Market Hours: 1min polling (WebSocket disconnected)'
      };
    case 'extended':
      return {
        refetchInterval: 5 * 60 * 1000, // 5 minutes
        description: 'Extended Hours: 5min polling (WebSocket disconnected)'
      };
    case 'closed':
      return {
        refetchInterval: 30 * 60 * 1000, // 30 minutes
        description: 'Market Closed: 30min polling (WebSocket disconnected)'
      };
    default:
      return {
        refetchInterval: 60 * 1000,
        description: 'Default: 1min polling'
      };
  }
}

/**
 * Get current Eastern Time string for display
 */
export function getCurrentEasternTime(): string {
  const now = new Date();
  return now.toLocaleString("en-US", { 
    timeZone: "America/New_York",
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}
