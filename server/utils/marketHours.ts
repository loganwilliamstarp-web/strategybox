/**
 * Market Hours Utility
 * Handles US stock market trading hours and optimizes API call frequency
 */

export interface MarketSession {
  isMarketOpen: boolean;
  isExtendedHours: boolean;
  sessionType: 'market' | 'extended' | 'closed';
  nextOpenTime?: Date;
  nextCloseTime?: Date;
}

export interface ApiIntervals {
  stockPrice: number;     // milliseconds
  optionsChain: number;   // milliseconds
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
    // TODO: Add next open/close times if needed
  };
}

/**
 * Get optimal API call intervals based on current market session
 */
export function getOptimalApiIntervals(): ApiIntervals {
  const session = getMarketSession();
  
  switch (session.sessionType) {
    case 'market':
      // Regular market hours: High frequency for accurate tracking
      return {
        stockPrice: 60 * 1000,      // 1 minute
        optionsChain: 30 * 60 * 1000, // 30 minutes
        description: 'Market Hours (9:30 AM - 4:00 PM ET): Active trading'
      };
      
    case 'extended':
      // Extended hours: Reduced frequency, still some activity
      return {
        stockPrice: 5 * 60 * 1000,   // 5 minutes
        optionsChain: 60 * 60 * 1000, // 1 hour
        description: 'Extended Hours (Pre/After market): Reduced activity'
      };
      
    case 'closed':
      // Market closed: Minimal frequency to save API costs
      return {
        stockPrice: 30 * 60 * 1000,  // 30 minutes
        optionsChain: 2 * 60 * 60 * 1000, // 2 hours
        description: 'Market Closed (8:00 PM - 4:00 AM ET): Minimal updates'
      };
      
    default:
      // Fallback to current intervals
      return {
        stockPrice: 60 * 1000,
        optionsChain: 30 * 60 * 1000,
        description: 'Default intervals'
      };
  }
}

/**
 * Check if it's a US market holiday
 * Basic implementation - can be expanded with full holiday calendar
 */
export function isMarketHoliday(date?: Date): boolean {
  const checkDate = date || new Date();
  const etDate = new Date(checkDate.toLocaleString("en-US", { timeZone: "America/New_York" }));
  
  const month = etDate.getMonth() + 1; // JavaScript months are 0-indexed
  const day = etDate.getDate();
  
  // Basic major holidays (expand as needed)
  const holidays = [
    { month: 1, day: 1 },   // New Year's Day
    { month: 7, day: 4 },   // Independence Day  
    { month: 12, day: 25 }, // Christmas
    // TODO: Add more holidays (Memorial Day, Labor Day, Thanksgiving, etc.)
  ];
  
  return holidays.some(holiday => 
    holiday.month === month && holiday.day === day
  );
}

/**
 * Get current Eastern Time for logging
 */
export function getCurrentEasternTime(): string {
  const now = new Date();
  return now.toLocaleString("en-US", { 
    timeZone: "America/New_York",
    weekday: 'short',
    year: 'numeric',
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
}

/**
 * Log market session info for debugging
 */
export function logMarketSession(): void {
  const session = getMarketSession();
  const intervals = getOptimalApiIntervals();
  const etTime = getCurrentEasternTime();
  
  console.log(`🕐 Market Session Check (${etTime}):`);
  console.log(`   📈 Session: ${session.sessionType.toUpperCase()}`);
  console.log(`   🔄 Stock Price Interval: ${intervals.stockPrice / 1000}s`);
  console.log(`   📊 Options Chain Interval: ${intervals.optionsChain / 60000}min`);
  console.log(`   💡 ${intervals.description}`);
}
