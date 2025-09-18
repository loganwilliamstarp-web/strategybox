// Clean WebSocket hook for frontend rebuild
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function useWebSocket(user: any) {
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!user?.id) return;

    // Simple WebSocket connection - hardcoded for development
    const wsUrl = 'ws://localhost:5000/ws';
    console.log('🔌 Connecting to WebSocket:', wsUrl);

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('✅ WebSocket connected');
        setIsConnected(true);
        
        // Send authentication
        ws.send(JSON.stringify({
          type: 'authenticate',
          userId: user.id
        }));
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('📨 WebSocket message:', message.type);

          if (message.type === 'price_update' && message.tickers) {
            // Update ticker data
            queryClient.setQueryData(['tickers'], message.tickers);
            console.log('🔄 Updated ticker data via WebSocket');
          }
        } catch (error) {
          console.error('WebSocket message error:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        setIsConnected(false);
      };

      ws.onclose = () => {
        console.log('🔌 WebSocket disconnected');
        setIsConnected(false);
      };

    } catch (error) {
      console.error('❌ WebSocket connection failed:', error);
      setIsConnected(false);
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [user?.id, queryClient]);

  return { isConnected };
}
