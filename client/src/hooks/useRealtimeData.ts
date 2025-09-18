import { useEffect, useRef, useState } from 'react';
import { useAuth } from './useAuth';
import { useQueryClient } from '@tanstack/react-query';
import type { TickerWithPosition, WebSocketMessage } from '@shared/schema';

export function useRealtimeData() {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [updateCount, setUpdateCount] = useState(0);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      return;
    }

    // Determine WebSocket URL with proper fallbacks
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    
    // Force localhost:5000 for development to avoid undefined port issues
    const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    let wsUrl;
    
    if (isDevelopment) {
      // Explicitly construct WebSocket URL for development
      wsUrl = `ws://localhost:5000/ws`; // Hard-coded for development
    } else {
      // Use dynamic construction for production
      const host = window.location.host;
      wsUrl = `${protocol}//${host}/ws`;
    }
    
    console.log('🔌 Final WebSocket URL:', wsUrl);
    
    console.log('WebSocket URL construction:', {
      protocol,
      windowHost: window.location.host,
      isDevelopment,
      wsUrl
    });

    console.log('Connecting to WebSocket for real-time updates:', wsUrl);
    console.log('Window location details:', {
      protocol: window.location.protocol,
      host: window.location.host,
      hostname: window.location.hostname,
      port: window.location.port
    });

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected, authenticating...');
        ws.send(JSON.stringify({
          type: 'authenticate',
          userId: user.id
        }));
      };

      ws.onerror = (error) => {
        console.error('WebSocket connection error:', error);
        console.error('Failed to connect to:', wsUrl);
        setIsConnected(false);
      };

      ws.onclose = (event) => {
        console.log('WebSocket connection closed:', event.code, event.reason);
        setIsConnected(false);
        
        // Attempt to reconnect after a delay if not a normal closure
        if (event.code !== 1000) {
          console.log('Attempting to reconnect WebSocket in 5 seconds...');
          setTimeout(() => {
            if (wsRef.current?.readyState === WebSocket.CLOSED) {
              console.log('Reconnecting WebSocket...');
              // The useEffect will run again and create a new connection
            }
          }, 5000);
        }
      };

      ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        
        switch (message.type) {
          case 'authenticated':
            console.log('WebSocket authenticated with connection ID:', message.connectionId);
            setIsConnected(true);
            break;
            
          case 'initial_data':
            console.log('Received initial data via WebSocket:', message.tickers?.length, 'tickers');
            if (message.tickers) {
              // Update the tickers cache with initial data
              queryClient.setQueryData(['/api/tickers'], message.tickers);
            }
            break;
            
          case 'price_update':
            console.log('Received live price update via WebSocket:', message.tickers?.length, 'tickers');
            if (message.tickers) {
              // Debug all ticker prices
              message.tickers.forEach(ticker => {
                console.log(`📊 WebSocket Price Update: ${ticker.symbol} = $${ticker.currentPrice} (${ticker.priceChange >= 0 ? '+' : ''}$${ticker.priceChange})`);
              });
              
              // Update the tickers cache with live data AND invalidate to force re-render
              console.log('🔄 Updating React Query cache with new ticker data');
              queryClient.setQueryData(['/api/tickers'], message.tickers);
              
              // Force invalidation to ensure UI updates
              queryClient.invalidateQueries({ queryKey: ['/api/tickers'] });
              queryClient.refetchQueries({ queryKey: ['/api/tickers'] });
              
              // Force a complete cache clear and refetch to bypass any React caching issues
              queryClient.removeQueries({ queryKey: ['/api/tickers'] });
              setTimeout(() => {
                queryClient.refetchQueries({ queryKey: ['/api/tickers'] });
              }, 100);
              
              queryClient.setQueryData(['/api/portfolio/summary'], (old: any) => {
                // Update portfolio summary cache if it exists
                return old ? { ...old, lastUpdated: new Date().toISOString() } : old;
              });
              
              setLastUpdate(message.timestamp || new Date().toISOString());
              setUpdateCount(prev => prev + 1);
            }
            break;
            
          case 'premium_update':
            console.log('Received premium update via WebSocket:', message.symbol, `Call: $${message.callPremium}, Put: $${message.putPremium}`);
            
            // Update ticker data with new premiums if provided
            if (message.updatedTicker) {
              console.log('🔄 Updating ticker data with new premiums:', message.symbol);
              console.log('📊 Updated ticker data:', message.updatedTicker);
              queryClient.setQueryData(['/api/tickers'], (old: any) => {
                if (!old) return old;
                const updated = old.map((ticker: any) => 
                  ticker.symbol === message.symbol ? message.updatedTicker : ticker
                );
                console.log('🔄 Cache updated for tickers:', updated);
                return updated;
              });
            } else {
              console.warn('⚠️ Premium update received but no updatedTicker data provided');
            }
            
            // Invalidate options chain cache to force refresh
            queryClient.invalidateQueries({ 
              queryKey: ["/api/market-data/options-chain", message.symbol] 
            });
            queryClient.invalidateQueries({ 
              queryKey: [`/api/market-data/options-chain/${message.symbol}`] 
            });
            
            setLastUpdate(message.timestamp || new Date().toISOString());
            setUpdateCount(prev => prev + 1);
            break;
            
          case 'error':
            console.error('WebSocket error:', message.error);
            break;
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      console.error('WebSocket URL was:', wsUrl);
      setIsConnected(false);
    }

    // Cleanup on unmount
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [isAuthenticated, user?.id, queryClient]);

  return {
    isConnected,
    lastUpdate,
    updateCount
  };
}