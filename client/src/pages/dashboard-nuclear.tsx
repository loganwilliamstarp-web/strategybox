// NUCLEAR OPTION: Direct fetch with forced re-renders
import { useState, useEffect } from 'react';

export default function NuclearDashboard() {
  const [data, setData] = useState<any>(null);
  const [lastUpdate, setLastUpdate] = useState<string>('');
  const [updateCount, setUpdateCount] = useState(0);

  const fetchData = async () => {
    try {
      // Add timestamp to bypass ALL caching
      const timestamp = Date.now();
      const response = await fetch(`/api/debug/tickers?t=${timestamp}`, {
        credentials: 'include',
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('🔥 NUCLEAR FETCH SUCCESS:', result);
        setData(result);
        setLastUpdate(new Date().toLocaleTimeString());
        setUpdateCount(prev => prev + 1);
      } else {
        console.error('❌ NUCLEAR FETCH FAILED:', response.status);
      }
    } catch (error) {
      console.error('❌ NUCLEAR FETCH ERROR:', error);
    }
  };

  // Fetch immediately on mount
  useEffect(() => {
    fetchData();
  }, []);

  // Auto-refresh every 2 seconds
  useEffect(() => {
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, []);

  if (!data) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4">🔥 NUCLEAR DASHBOARD</h1>
        <p>Loading direct backend data...</p>
      </div>
    );
  }

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-center">🔥 NUCLEAR DASHBOARD</h1>
        
        <div className="bg-white p-4 rounded-lg shadow mb-6">
          <h2 className="text-lg font-semibold mb-2">📊 Debug Info</h2>
          <p><strong>User ID:</strong> {data.userId}</p>
          <p><strong>Ticker Count:</strong> {data.tickerCount}</p>
          <p><strong>Last Update:</strong> {lastUpdate}</p>
          <p><strong>Update Count:</strong> {updateCount}</p>
          <div className="mt-2 space-x-2">
            <button 
              onClick={fetchData}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            >
              🔄 Force Refresh
            </button>
            <button 
              onClick={async () => {
                try {
                  console.log('🔥 Testing force price update...');
                  const response = await fetch('/api/debug/force-price-update', {
                    method: 'POST', 
                    credentials: 'include'
                  });
                  const result = await response.json();
                  console.log('🔥 Force update result:', result);
                  // Refresh data after update
                  setTimeout(fetchData, 1000);
                } catch (error) {
                  console.error('❌ Force update failed:', error);
                }
              }}
              className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
            >
              🔥 Force DB Update
            </button>
            <button 
              onClick={async () => {
                try {
                  console.log('📊 Populating options chains...');
                  const response = await fetch('/api/debug/populate-options-chains', {
                    method: 'POST', 
                    credentials: 'include'
                  });
                  const result = await response.json();
                  console.log('📊 Options chain result:', result);
                  // Refresh data after population
                  setTimeout(fetchData, 2000);
                } catch (error) {
                  console.error('❌ Options chain population failed:', error);
                }
              }}
              className="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600"
            >
              📊 Populate Options Chains
            </button>
            <button 
              onClick={async () => {
                try {
                  console.log('🎯 Updating strikes from live options data...');
                  const response = await fetch('/api/debug/update-strikes-from-live-data', {
                    method: 'POST', 
                    credentials: 'include'
                  });
                  const result = await response.json();
                  console.log('🎯 Strike update result:', result);
                  // Refresh data after update
                  setTimeout(fetchData, 2000);
                } catch (error) {
                  console.error('❌ Strike update failed:', error);
                }
              }}
              className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
            >
              🎯 Update Strikes from Live Data
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {data.tickers?.map((ticker: any) => (
            <div key={ticker.id} className="bg-white p-6 rounded-lg shadow">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-bold">{ticker.symbol}</h3>
                <div className="text-right">
                  <div className="text-2xl font-bold text-blue-600">
                    ${ticker.currentPrice.toFixed(2)}
                  </div>
                  <div className={`text-sm ${ticker.priceChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {ticker.priceChange >= 0 ? '+' : ''}${ticker.priceChange.toFixed(2)} 
                    ({ticker.priceChangePercent.toFixed(2)}%)
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded">
                <h4 className="font-semibold mb-2">Position Details</h4>
                <div className="space-y-1 text-sm">
                  <p><strong>Strategy:</strong> {ticker.position?.strategyType || 'N/A'}</p>
                  <p><strong>Call Strike:</strong> ${ticker.position?.longCallStrike || 'N/A'}</p>
                  <p><strong>Put Strike:</strong> ${ticker.position?.longPutStrike || 'N/A'}</p>
                  <p><strong>Call Premium:</strong> ${ticker.position?.longCallPremium?.toFixed(2) || 'N/A'}</p>
                  <p><strong>Put Premium:</strong> ${ticker.position?.longPutPremium?.toFixed(2) || 'N/A'}</p>
                  <p><strong>Days to Expiry:</strong> {ticker.position?.daysToExpiry || 'N/A'}</p>
                  <p><strong>Expiration:</strong> {ticker.position?.expirationDate || 'N/A'}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 bg-white p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-2">🔬 Raw Data</h2>
          <pre className="bg-gray-100 p-4 rounded text-xs overflow-auto max-h-96">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
