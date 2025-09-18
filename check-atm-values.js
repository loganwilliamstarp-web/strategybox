// Check current ATM values in database
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nogazoggoluvgarfvizo.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vZ2F6b2dnb2x1dmdhcmZ2aXpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxMjYyMDAsImV4cCI6MjA3MzcwMjIwMH0.ar0rWErOFGv6bvIPlniKKbcQZ6-fVv6NvbGjHkd0HxE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkATMValues() {
    console.log('🔍 Checking current ATM values and expiration dates...');
    
    try {
        // Get positions with ticker data
        const { data: positions, error } = await supabase
            .from('long_strangle_positions')
            .select(`
                *,
                tickers!inner (
                    symbol,
                    current_price,
                    user_id
                )
            `)
            .eq('tickers.user_id', '5630d6b1-42b4-43bd-8669-d554281a5e1b');
            
        if (error) {
            console.error('❌ Error:', error);
            return;
        }
        
        console.log(`📊 Found ${positions.length} positions:`);
        
        positions.forEach(position => {
            const ticker = position.tickers;
            console.log(`\n${ticker.symbol}:`);
            console.log(`  Current Stock Price: $${ticker.current_price}`);
            console.log(`  ATM Value in DB: $${position.atm_value}`);
            console.log(`  Difference: $${(ticker.current_price - position.atm_value).toFixed(2)}`);
            console.log(`  Expiration Date: ${position.expiration_date}`);
            console.log(`  Days to Expiry: ${position.days_to_expiry}d`);
            console.log(`  IV: ${position.implied_volatility}%`);
            console.log(`  IV Percentile: ${position.iv_percentile}th`);
        });
        
        // Check what today and tomorrow are
        const today = new Date();
        const tomorrow = new Date(Date.now() + 24*60*60*1000);
        console.log(`\n📅 Date Check:`);
        console.log(`  Today: ${today.toISOString().split('T')[0]} (${today.toLocaleDateString('en-US', {weekday: 'short'})})`);
        console.log(`  Tomorrow: ${tomorrow.toISOString().split('T')[0]} (${tomorrow.toLocaleDateString('en-US', {weekday: 'short'})})`);
        
    } catch (error) {
        console.error('❌ Script error:', error);
    }
}

checkATMValues();
