import { storage } from "../storage";

// Fetch historical closing price for a given date using Finnhub
async function getHistoricalClosingPrice(symbol: string, date: string): Promise<number | null> {
  try {
    const { supabaseSecrets } = await import('../config/supabaseSecrets');
    const finnhubKey = await supabaseSecrets.getSecret('FINNHUB_API_KEY');
    
    if (!finnhubKey) {
      console.error('❌ Finnhub API key not found');
      return null;
    }

    // Convert date to Unix timestamp (start and end of day)
    const targetDate = new Date(date);
    const fromTimestamp = Math.floor(targetDate.getTime() / 1000);
    const toTimestamp = fromTimestamp + 86400; // Add 24 hours

    const url = `https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=D&from=${fromTimestamp}&to=${toTimestamp}&token=${finnhubKey}`;
    
    console.log(`📡 Fetching historical data for ${symbol} on ${date}...`);
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.s === 'ok' && data.c && data.c.length > 0) {
      const closingPrice = data.c[0]; // First (and should be only) closing price
      console.log(`📊 Historical price for ${symbol} on ${date}: $${closingPrice.toFixed(2)}`);
      return closingPrice;
    } else {
      console.warn(`⚠️ No historical data found for ${symbol} on ${date}:`, data);
      return null;
    }
  } catch (error) {
    console.error(`❌ Error fetching historical price for ${symbol}:`, error);
    return null;
  }
}

// Calculate the last Friday (previous expiration date)
function getLastFriday(): string {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sunday, 5=Friday
  
  // Calculate days back to last Friday
  let daysBack;
  if (dayOfWeek === 0) { // Sunday
    daysBack = 2; // Last Friday was 2 days ago
  } else if (dayOfWeek === 6) { // Saturday  
    daysBack = 1; // Last Friday was 1 day ago
  } else { // Monday-Friday
    daysBack = dayOfWeek === 5 ? 7 : (dayOfWeek + 2); // If today is Friday, go back 7 days, otherwise go back to last Friday
  }
  
  const lastFriday = new Date(today);
  lastFriday.setDate(today.getDate() - daysBack);
  return lastFriday.toISOString().split('T')[0];
}

// Daily job to ensure ATM values are accurate
export async function validateATMValues(): Promise<void> {
  try {
    console.log('🔧 Daily ATM validation starting...');
    
    // Get all users with active positions
    const { supabase } = await import('../config/supabase');
    const { data: users, error } = await supabase
      .from('users')
      .select('id')
      .limit(100); // Process in batches if needed
    
    if (error || !users) {
      console.error('❌ Failed to fetch users for ATM validation:', error);
      return;
    }
    
    const lastFridayStr = getLastFriday();
    console.log(`📅 Validating ATM values against last expiration: ${lastFridayStr}`);
    
    let totalUpdated = 0;
    
    for (const user of users) {
      try {
        const tickers = await storage.getActiveTickersWithPositionsForUser(user.id);
        
        if (tickers.length === 0) continue;
        
        for (const ticker of tickers) {
          try {
            // Check if ATM value needs updating (if it's significantly different from last Friday's close)
            const historicalPrice = await getHistoricalClosingPrice(ticker.symbol, lastFridayStr);
            
            if (!historicalPrice) continue;
            
            const currentATM = ticker.position.atmValue;
            const priceDifference = Math.abs(currentATM - historicalPrice);
            const percentDifference = (priceDifference / historicalPrice) * 100;
            
            // Only update if difference is more than 1% (to avoid unnecessary updates)
            if (percentDifference > 1) {
              console.log(`🔧 ${ticker.symbol}: ATM $${currentATM.toFixed(2)} differs from historical $${historicalPrice.toFixed(2)} by ${percentDifference.toFixed(1)}%`);
              
              await storage.updatePosition(ticker.position.id, user.id, {
                atmValue: historicalPrice,
              });
              
              console.log(`✅ Updated ${ticker.symbol} ATM: $${currentATM.toFixed(2)} → $${historicalPrice.toFixed(2)}`);
              totalUpdated++;
            }
            
          } catch (error) {
            console.error(`❌ Failed to validate ATM for ${ticker.symbol}:`, error);
          }
          
          // Rate limiting: small delay between API calls
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error(`❌ Failed to process user ${user.id}:`, error);
      }
    }
    
    console.log(`🎉 Daily ATM validation complete: ${totalUpdated} positions updated`);
    
  } catch (error) {
    console.error('❌ Daily ATM validation failed:', error);
  }
}

// Schedule the job to run once a day at 6 AM
export function startATMValidationScheduler(): void {
  console.log('📅 Starting daily ATM validation scheduler...');
  
  // Run immediately on startup (for testing)
  // validateATMValues();
  
  // Then run every 24 hours
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  setInterval(validateATMValues, TWENTY_FOUR_HOURS);
  
  console.log('✅ ATM validation scheduler started (runs every 24 hours)');
}
