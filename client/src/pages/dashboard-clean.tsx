// Clean dashboard for frontend rebuild with full features
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth-clean';
import { useWebSocket } from '../hooks/useWebSocket-clean';
import { apiCall } from '../lib/api';
import { PLChart } from '../components/pl-chart';
import { ProbabilityChart } from '../components/probability-chart';
import type { TickerWithPosition } from '@shared/schema';

export default function Dashboard() {
  const { user, isAuthenticated, logout } = useAuth();
  const { isConnected } = useWebSocket(user);

  // Simple ticker data query
  const { data: tickers = [], isLoading, refetch } = useQuery<TickerWithPosition[]>({
    queryKey: ['tickers'],
    queryFn: () => apiCall('/api/tickers'),
    enabled: isAuthenticated,
    refetchInterval: 5000, // 5 second refresh
    staleTime: 0,
    cacheTime: 0,
  });

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6">
          <h1 className="text-2xl font-bold text-center mb-6">Options Tracker</h1>
          <LoginForm />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <h1 className="text-xl font-semibold">Options Tracker</h1>
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="text-sm text-gray-600">
                  {isConnected ? 'Live Data' : 'Disconnected'}
                </span>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">
                Welcome, {user?.firstName}
              </span>
              <button
                onClick={() => refetch()}
                disabled={isLoading}
                className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {isLoading ? 'Loading...' : 'Refresh'}
              </button>
              <button
                onClick={() => {
                  // Force fix all strategies
                  apiCall('/api/tickers/force-long-strangle', { method: 'POST' })
                    .then(() => refetch())
                    .catch(console.error);
                }}
                className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700"
              >
                Fix Strategies
              </button>
              <button
                onClick={() => logout()}
                className="px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Active Positions</h2>
          
          {isLoading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-2 text-gray-600">Loading positions...</p>
            </div>
          ) : tickers.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-600">No active positions</p>
              <button
                onClick={() => {
                  // Add ticker functionality
                  console.log('Add ticker clicked');
                }}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Add Position
              </button>
            </div>
          ) : (
            <>
              {/* Add Ticker Section */}
              <div className="mb-6">
                <AddTickerForm />
              </div>
              
              {/* Tickers Grid */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {tickers.map((ticker) => (
                  <TickerCard key={ticker.id} ticker={ticker} />
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

// Simple Login Form
function LoginForm() {
  const { login, isLoginLoading } = useAuth();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    login({
      email: formData.get('email') as string,
      password: formData.get('password') as string,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700">
          Email
        </label>
        <input
          type="email"
          id="email"
          name="email"
          required
          defaultValue="demo@options.com"
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700">
          Password
        </label>
        <input
          type="password"
          id="password"
          name="password"
          required
          defaultValue="password123"
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
      <button
        type="submit"
        disabled={isLoginLoading}
        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
      >
        {isLoginLoading ? 'Logging in...' : 'Login'}
      </button>
      
      {/* Quick demo login */}
      <div className="mt-4 text-center">
        <button
          type="button"
          onClick={() => login({ email: 'demo@options.com', password: 'password123' })}
          disabled={isLoginLoading}
          className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
        >
          Quick Demo Login
        </button>
      </div>
    </form>
  );
}

// Add Ticker Form
function AddTickerForm() {
  const [symbol, setSymbol] = useState('');
  const queryClient = useQueryClient();

  const addTickerMutation = useMutation({
    mutationFn: async (symbol: string) => {
      return apiCall('/api/tickers', {
        method: 'POST',
        body: JSON.stringify({ 
          symbol: symbol.toUpperCase(),
          strategyType: 'long_strangle'
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['tickers']);
      setSymbol('');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (symbol.trim()) {
      addTickerMutation.mutate(symbol.trim());
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-4">
      <h3 className="text-lg font-semibold mb-4">Add New Position</h3>
      <form onSubmit={handleSubmit} className="flex space-x-4">
        <input
          type="text"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          placeholder="Enter ticker symbol (e.g., AAPL)"
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={addTickerMutation.isLoading}
        />
        <button
          type="submit"
          disabled={addTickerMutation.isLoading || !symbol.trim()}
          className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
        >
          {addTickerMutation.isLoading ? 'Adding...' : 'Add Long Strangle'}
        </button>
      </form>
      {addTickerMutation.error && (
        <p className="mt-2 text-sm text-red-600">
          Error: {(addTickerMutation.error as Error).message}
        </p>
      )}
    </div>
  );
}

// Enhanced Ticker Card with charts and full features
function TickerCard({ ticker }: { ticker: TickerWithPosition }) {
  const { position } = ticker;
  const [activeTab, setActiveTab] = useState<'pl' | 'probability'>('pl');
  const [showOptions, setShowOptions] = useState(false);
  const queryClient = useQueryClient();
  
  // Strategy type display
  const getStrategyDisplayName = (strategyType: string) => {
    switch (strategyType) {
      case 'long_strangle': return 'Long Strangle';
      case 'short_strangle': return 'Short Strangle';
      case 'iron_condor': return 'Iron Condor';
      case 'butterfly_spread': return 'Butterfly Spread';
      default: return strategyType.replace('_', ' ').toUpperCase();
    }
  };

  // Force strategy update to long_strangle
  const updateStrategyMutation = useMutation({
    mutationFn: async () => {
      return apiCall(`/api/positions/${position.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          strategyType: 'long_strangle',
          expirationDate: position.expirationDate,
          recalculateWithNewStrategy: true
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['tickers']);
    },
  });
  
  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-semibold">{ticker.symbol}</h3>
          <p className="text-sm text-gray-600">{ticker.companyName}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold">${ticker.currentPrice?.toFixed(2)}</p>
          <p className={`text-sm ${ticker.priceChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {ticker.priceChange >= 0 ? '+' : ''}${ticker.priceChange?.toFixed(2)} ({ticker.priceChangePercent?.toFixed(2)}%)
          </p>
        </div>
      </div>

      {position && (
        <>
          {/* Strategy Info */}
          <div className="mb-4 p-3 bg-gray-50 rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-700">Strategy</span>
              <button
                onClick={() => updateStrategyMutation.mutate()}
                disabled={updateStrategyMutation.isLoading}
                className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {updateStrategyMutation.isLoading ? 'Updating...' : 'Fix to Long Strangle'}
              </button>
            </div>
            <p className="text-sm font-semibold">{getStrategyDisplayName(position.strategyType)}</p>
          </div>

          {/* Charts */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-3">
              <h4 className="text-sm font-medium text-gray-700">
                {activeTab === 'pl' ? 'PROFIT/LOSS' : 'PROBABILITY'}
              </h4>
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    activeTab === 'pl' 
                      ? 'bg-white text-gray-900 shadow-sm' 
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                  onClick={() => setActiveTab('pl')}
                >
                  P&L
                </button>
                <button
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    activeTab === 'probability' 
                      ? 'bg-white text-gray-900 shadow-sm' 
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                  onClick={() => setActiveTab('probability')}
                >
                  Probability
                </button>
              </div>
            </div>
            <div className="h-48 bg-gray-50 rounded-lg border border-gray-200 flex items-center justify-center">
              {activeTab === 'pl' ? (
                <PLChart ticker={ticker} />
              ) : (
                <ProbabilityChart ticker={ticker} />
              )}
            </div>
          </div>

          {/* Position Details */}
          <div className="border-t pt-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-600">Max Loss</p>
                <p className="font-medium text-red-600">${position.maxLoss?.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-gray-600">Max Profit</p>
                <p className="font-medium text-green-600">
                  {position.maxProfit ? `$${position.maxProfit.toFixed(2)}` : 'Unlimited'}
                </p>
              </div>
              <div>
                <p className="text-gray-600">Put Strike</p>
                <p className="font-medium">${position.longPutStrike}</p>
              </div>
              <div>
                <p className="text-gray-600">Call Strike</p>
                <p className="font-medium">${position.longCallStrike}</p>
              </div>
              <div>
                <p className="text-gray-600">Lower Breakeven</p>
                <p className="font-medium">${position.lowerBreakeven?.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-gray-600">Upper Breakeven</p>
                <p className="font-medium">${position.upperBreakeven?.toFixed(2)}</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-4 flex space-x-2">
            <button
              onClick={() => setShowOptions(!showOptions)}
              className="flex-1 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
            >
              {showOptions ? 'Hide Options' : 'View Options Chain'}
            </button>
            <button
              onClick={() => {
                // Remove ticker functionality
                apiCall(`/api/tickers/${ticker.symbol}`, { method: 'DELETE' })
                  .then(() => queryClient.invalidateQueries(['tickers']));
              }}
              className="px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
            >
              Remove
            </button>
          </div>
        </>
      )}
    </div>
  );
}
