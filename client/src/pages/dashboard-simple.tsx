// Ultra-simple dashboard that bypasses React Query entirely
import { useState, useEffect } from 'react';
import type { TickerWithPosition } from '@shared/schema';

export default function SimpleDashboard() {
  const [tickers, setTickers] = useState<TickerWithPosition[]>([]);
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Token-based login function
  const login = async () => {
    try {
      const response = await fetch('/api/token-login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
        setToken(userData.token);
        console.log('✅ Token login successful:', { user: userData.email, token: userData.token?.substring(0, 8) + '...' });
        fetchTickers(userData.token);
      } else {
        setError('Login failed');
      }
    } catch (err) {
      setError('Login error: ' + (err as Error).message);
    }
  };

  // Token-based fetch tickers function
  const fetchTickers = async (authToken?: string) => {
    const currentToken = authToken || token;
    if (!currentToken) {
      setError('No authentication token');
      return;
    }
    
    try {
      setLoading(true);
      const response = await fetch('/api/tickers', {
        headers: {
          'Authorization': `Bearer ${currentToken}`,
        },
      });
      
      console.log('📡 Ticker response status:', response.status);
      console.log('📡 Using token:', currentToken?.substring(0, 8) + '...');
      
      if (response.ok) {
        const data = await response.json();
        console.log('📊 Received ticker data:', data);
        setTickers(data);
        setError(null);
      } else {
        console.error('❌ Ticker fetch failed:', response.status);
        setError(`Failed to fetch tickers: ${response.status}`);
      }
    } catch (err) {
      console.error('❌ Ticker fetch error:', err);
      setError('Error: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Check auth on mount (skip for token auth - require explicit login)
  useEffect(() => {
    setLoading(false);
  }, []);

  // Auto-refresh every 5 seconds
  useEffect(() => {
    if (user && token) {
      const interval = setInterval(() => {
        console.log('🔄 Auto-refreshing tickers...');
        fetchTickers();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [user, token]);

  // Fix strategy types
  const fixStrategies = async () => {
    if (!token) {
      setError('No authentication token');
      return;
    }
    
    try {
      const response = await fetch('/api/tickers/force-long-strangle', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const result = await response.json();
        console.log('✅ Strategy fix result:', result);
        fetchTickers(); // Refresh data
      }
    } catch (err) {
      console.error('Strategy fix error:', err);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
          <h1 className="text-2xl font-bold text-center mb-6">Options Tracker</h1>
          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}
          <button
            onClick={login}
            className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            🚀 Token Login (Bypass Sessions)
          </button>
          <p className="text-center text-gray-600 mt-4 text-sm">
            Uses token-based auth to bypass session persistence issues
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Simple Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold">Options Tracker</h1>
            <div className="flex space-x-4">
              <button
                onClick={fetchTickers}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Loading...' : 'Refresh'}
              </button>
              <button
                onClick={fixStrategies}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              >
                Fix Strategies
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <h2 className="text-xl font-semibold mb-6">
          Welcome {user.firstName}! ({tickers.length} positions)
        </h2>

        {error && (
          <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2">Loading positions...</p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {tickers.map((ticker) => (
              <div key={ticker.id} className="bg-white rounded-lg shadow-lg p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-xl font-bold">{ticker.symbol}</h3>
                    <p className="text-gray-600">{ticker.companyName}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold">${ticker.currentPrice?.toFixed(2)}</p>
                    <p className={`text-sm ${ticker.priceChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {ticker.priceChange >= 0 ? '+' : ''}${ticker.priceChange?.toFixed(2)}
                    </p>
                  </div>
                </div>

                {ticker.position && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500">Strategy</p>
                        <p className="font-semibold">{ticker.position.strategyType}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Max Loss</p>
                        <p className="font-semibold text-red-600">
                          ${ticker.position.maxLoss?.toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">Put Strike</p>
                        <p className="font-semibold">${ticker.position.longPutStrike}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Call Strike</p>
                        <p className="font-semibold">${ticker.position.longCallStrike}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Debug Info */}
        <div className="mt-8 p-4 bg-gray-100 rounded-lg">
          <h3 className="font-semibold mb-2">Debug Info</h3>
          <p className="text-sm">Last update: {new Date().toLocaleTimeString()}</p>
          <p className="text-sm">Tickers count: {tickers.length}</p>
          <p className="text-sm">User: {user?.email}</p>
          <p className="text-sm">Loading: {loading ? 'Yes' : 'No'}</p>
        </div>
      </main>
    </div>
  );
}
