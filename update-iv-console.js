// Run this in your browser console while on the StrategyBox page
// This will trigger the IV update for all positions

async function updateIVData() {
    console.log('🔄 Triggering IV update...');
    
    try {
        const response = await fetch('/api/tickers?updateiv=true', {
            method: 'GET',
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('✅ IV Update Complete!');
        console.log(`Updated ${data.length} positions with real MarketData.app IV values.`);
        
        // Show IV data for each ticker
        data.forEach(ticker => {
            console.log(`${ticker.symbol}: IV=${ticker.position.impliedVolatility}%, IV Percentile=${ticker.position.ivPercentile}th`);
        });
        
        // Force refresh the page to see updated values
        console.log('🔄 Refreshing page to show updated IV values...');
        setTimeout(() => window.location.reload(), 2000);
        
        return data;
        
    } catch (error) {
        console.error('❌ Error updating IV:', error);
        throw error;
    }
}

// Execute the update
updateIVData();
