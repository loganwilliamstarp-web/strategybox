import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './useAuth';
import { useQueryClient } from '@tanstack/react-query';

interface WebSocketMessage {
  type: 'authenticated' | 'initial_data' | 'price_update' | 'premium_update' | 'options_update' | 'error';
  connectionId?: string;
  tickers?: any[];
  symbol?: string;
  callPremium?: number;
  putPremium?: number;
  optionsData?: any;
  message?: string;
}

export function useRealtimeDataV3() {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Debounced invalidation to prevent request storms
  const debouncedInvalidateTickersCache = useCallback(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    debounceTimeoutRef.current = setTimeout(() => {
      console.log('🔄 WebSocket: Debounced cache invalidation executing...');
      // Use refetchType: "inactive" to mark stale without immediate refetch
      queryClient.invalidateQueries({ 
        queryKey: ["/api/tickers"], 
        refetchType: "inactive" 
      });
      queryClient.invalidateQueries({ 
        queryKey: ["/api/portfolio/summary"], 
        refetchType: "inactive" 
      });
    }, 2000); // 2 second debounce to prevent spam
  }, [queryClient]);

  const connect = () => {
    if (!user?.id) {
      console.log('🔌 WebSocket: No user ID available, skipping connection');
      return;
    }

    try {
      // Get the current host and port from the browser
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.hostname;
      const port = window.location.port; // Use same port as current page
      const wsUrl = port 
        ? `${protocol}//${host}:${port}/websocket-v4-cache-bypass?token=${user.id}`
        : `${protocol}//${host}/websocket-v4-cache-bypass?token=${user.id}`;
      
      console.log('🔌 WebSocket: Connecting to', wsUrl);
      
      wsRef.current = new WebSocket(wsUrl);
      
      wsRef.current.onopen = () => {
        console.log('✅ WebSocket: Connected successfully');
        setIsConnected(true);
        setConnectionError(null);
        
        // Send authentication message
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'authenticate',
            userId: user.id
          }));
        }
      };
      
      wsRef.current.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          console.log('📨 WebSocket: Received message', message.type);
          
          switch (message.type) {
            case 'authenticated':
              console.log('🔐 WebSocket: Authenticated successfully');
              break;
            case 'initial_data':
              console.log('📊 WebSocket: Received initial data');
              // Use debounced invalidation to prevent request storms
              debouncedInvalidateTickersCache();
              break;
            case 'price_update':
              // Handle both message formats: individual symbol updates and batch ticker updates
              if (message.tickers && Array.isArray(message.tickers)) {
                console.log('💰 WebSocket: Batch price update received', message.tickers.length, 'tickers');
                // Use debounced invalidation to prevent request storms
                debouncedInvalidateTickersCache();
                // Invalidate options chain cache for all tickers (these are less frequent)
                message.tickers.forEach((ticker: any) => {
                  if (ticker.symbol) {
                    queryClient.invalidateQueries({ 
                      queryKey: ["/api/market-data/options-chain", ticker.symbol],
                      refetchType: "inactive"
                    });
                  }
                });
              } else if (message.symbol) {
                console.log('💰 WebSocket: Individual price update for', message.symbol);
                // Use debounced invalidation to prevent request storms
                debouncedInvalidateTickersCache();
                // Invalidate options chain cache for the specific symbol
                queryClient.invalidateQueries({ 
                  queryKey: ["/api/market-data/options-chain", message.symbol],
                  refetchType: "inactive"
                });
              }
              break;
            case 'premium_update':
              console.log('💎 WebSocket: Premium update received');
              // Use debounced invalidation to prevent request storms
              debouncedInvalidateTickersCache();
              // Invalidate options chain cache for all symbols
              queryClient.invalidateQueries({ 
                predicate: (query) => {
                  const queryKey = query.queryKey[0];
                  return typeof queryKey === 'string' && queryKey.includes('/api/market-data/options-chain');
                },
                refetchType: "inactive"
              });
              break;
            case 'options_update':
              console.log('📊 WebSocket: Options update received for', message.symbol);
              // Use debounced invalidation to prevent request storms
              debouncedInvalidateTickersCache();
              if (message.symbol) {
                queryClient.invalidateQueries({ 
                  queryKey: ["/api/market-data/options-chain", message.symbol],
                  refetchType: "inactive"
                });
              }
              break;
            case 'error':
              console.error('❌ WebSocket: Server error', message.message);
              setConnectionError(message.message || 'Unknown server error');
              break;
            default:
              console.log('📨 WebSocket: Unknown message type', message.type);
          }
        } catch (error) {
          console.error('❌ WebSocket: Failed to parse message', error);
        }
      };
      
      wsRef.current.onclose = (event) => {
        console.log('🔌 WebSocket: Connection closed', event.code, event.reason);
        setIsConnected(false);
        
        // Attempt to reconnect after a delay if it wasn't a manual close
        if (event.code !== 1000 && user?.id) {
          console.log('🔄 WebSocket: Attempting to reconnect in 5 seconds...');
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, 5000);
        }
      };
      
      wsRef.current.onerror = (error) => {
        console.error('❌ WebSocket: Connection error', error);
        setConnectionError('Failed to connect to real-time data server');
        setIsConnected(false);
      };
      
    } catch (error) {
      console.error('❌ WebSocket: Failed to create connection', error);
      setConnectionError('Failed to create WebSocket connection');
    }
  };

  const disconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.close(1000, 'Manual disconnect');
      wsRef.current = null;
    }
    
    setIsConnected(false);
    setConnectionError(null);
  };

  useEffect(() => {
    if (user?.id) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [user?.id]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  return {
    isConnected,
    connectionError,
    connect,
    disconnect
  };
}
