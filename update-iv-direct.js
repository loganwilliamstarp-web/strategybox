// Direct IV update script - run with: node update-iv-direct.js
import { createClient } from '@supabase/supabase-js';

// Supabase configuration
const supabaseUrl = 'https://nogazoggoluvgarfvizo.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vZ2F6b2dnb2x1dmdhcmZ2aXpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxMjYyMDAsImV4cCI6MjA3MzcwMjIwMH0.ar0rWErOFGv6bvIPlniKKbcQZ6-fVv6NvbGjHkd0HxE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function updateIVData() {
    console.log('🔄 Starting direct IV update...');
    
    try {
        // First, let's check what users exist
        const { data: users } = await supabase
            .from('users')
            .select('id, email')
            .limit(5);
        console.log('📋 Available users:', users);
        
        // Check what tickers exist
        const { data: allTickers } = await supabase
            .from('tickers')
            .select('id, symbol, user_id')
            .limit(5);
        console.log('📋 Available tickers:', allTickers);
        
        // Get all positions for the user (join with tickers to get user_id)
        const { data: positions, error } = await supabase
            .from('long_strangle_positions')
            .select(`
                *,
                tickers!inner (
                    id,
                    symbol,
                    user_id
                )
            `)
            .eq('tickers.user_id', '5630d6b1-42b4-43bd-8669-d554281a5e1b');
            
        if (error) {
            console.error('❌ Error fetching positions:', error);
            return;
        }
        
        console.log(`📊 Found ${positions.length} positions to update`);
        
        for (const position of positions) {
            // Calculate days to expiry correctly
            const today = new Date();
            const expiry = new Date(position.expirationDate);
            const diffTime = expiry.getTime() - today.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            const correctDaysToExpiry = Math.max(0, diffDays);
            
            // Update with sample real IV data (you can replace with actual API calls)
            const sampleIVData = {
                'QQQ': { iv: 28.5, percentile: 55 },
                'AAPL': { iv: 31.2, percentile: 62 },
                'NVDA': { iv: 45.8, percentile: 78 }
            };
            
            // Get ticker symbol from the joined data
            const ticker = position.tickers;
                
            if (ticker && sampleIVData[ticker.symbol]) {
                const ivData = sampleIVData[ticker.symbol];
                
                // Update the position
                const { error: updateError } = await supabase
                    .from('long_strangle_positions')
                    .update({
                        impliedVolatility: ivData.iv,
                        ivPercentile: ivData.percentile,
                        daysToExpiry: correctDaysToExpiry
                    })
                    .eq('id', position.id);
                    
                if (updateError) {
                    console.error(`❌ Error updating ${ticker.symbol}:`, updateError);
                } else {
                    console.log(`✅ Updated ${ticker.symbol}: IV=${ivData.iv}%, Percentile=${ivData.percentile}th, Days=${correctDaysToExpiry}d`);
                }
            }
        }
        
        console.log('✅ IV update complete! Refresh your browser to see changes.');
        
    } catch (error) {
        console.error('❌ Script error:', error);
    }
}

updateIVData();
