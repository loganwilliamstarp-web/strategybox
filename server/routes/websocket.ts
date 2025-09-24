import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "../storage";
import { performanceOptimizer } from "../services/performanceOptimizer";
import { marketDataApiService } from "../marketDataApi";
import { logger } from "../middleware/logger";
import { getOptimalApiIntervals, logMarketSession } from "../utils/marketHours";

// Simple cached calculation for expected weekly price range
function calculateExpectedMove(currentPrice: number, impliedVolatility: number, daysToExpiry: number): {
  weeklyLow: number;
  weeklyHigh: number;
  dailyMove: number;
  weeklyMove: number;
  movePercentage: number;
} {
  // Check if IV is already in decimal form (0.2) or percentage form (20)
  const ivDecimal = impliedVolatility > 1 ? impliedVolatility / 100 : impliedVolatility;
  
  // Handle edge cases for performance  
  if (impliedVolatility <= 0 || currentPrice <= 0) {
    return {
      weeklyLow: currentPrice * 0.95,
      weeklyHigh: currentPrice * 1.05,
      dailyMove: currentPrice * 0.01,
      weeklyMove: currentPrice * 0.025,
      movePercentage: 2.5
    };
  }
  
  // Fast calculation for normal cases
  const weeklyMove = currentPrice * ivDecimal * 0.14; // Pre-calculated constant
  const dailyMove = weeklyMove / 7;
  
  const movePercentage = (weeklyMove / currentPrice) * 100;
  
  return {
    weeklyLow: currentPrice - weeklyMove,
    weeklyHigh: currentPrice + weeklyMove,
    dailyMove: dailyMove,
    weeklyMove: weeklyMove,
    movePercentage: movePercentage
  };
}

/**
 * Set up optimized WebSocket server with dual-interval updates
 * Prices: Every 1 minute | Options/Strikes: Every 15 minutes
 */
export function setupWebSocket(httpServer: Server): void {
  
  // Set up WebSocket server for real-time price streaming
  const wss = new WebSocketServer({ server: httpServer, path: '/websocket-v4-cache-bypass' });
  
  // Track update intervals
  let priceUpdateInterval: NodeJS.Timeout | null = null;
  let optionsUpdateInterval: NodeJS.Timeout | null = null;
  
  wss.on('connection', async (ws, req) => {
    console.log('WebSocket connection established');
    
    let connectionId: string | null = null;
    let userId: string | null = null;
    
    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        if (data.type === 'authenticate' && data.userId) {
          userId = data.userId;
          connectionId = `${userId}-${Date.now()}`;
          
          // Register with performance optimizer
          performanceOptimizer.addConnection(connectionId, ws, userId);
          
          ws.send(JSON.stringify({
            type: 'authenticated',
            connectionId
          }));
          
          // Send initial data
          if (userId) {
            const tickers = await storage.getActiveTickersWithPositionsForUser(userId);
            
            ws.send(JSON.stringify({
              type: 'initial_data',
              tickers: tickers // expectedMove now comes from database
            }));
            
            console.log(`User ${userId} authenticated for real-time updates`);
          }
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Invalid message format'
        }));
      }
    });
    
    ws.on('close', () => {
      if (connectionId) {
        performanceOptimizer.removeConnection(connectionId);
        console.log(`WebSocket connection closed for user ${userId}`);
      }
    });
    
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      if (connectionId) {
        performanceOptimizer.removeConnection(connectionId);
      }
    });

    // Send ping every 30 seconds to keep connection alive
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      } else {
        clearInterval(pingInterval);
      }
    }, 30000);

    ws.on('pong', () => {
      // Connection is alive
    });
  });

  // Start dual-interval update system
  const startDualIntervalUpdates = () => {
    if (priceUpdateInterval || optionsUpdateInterval) return; // Already running
    
    console.log('🚀 Starting dual-interval update system...');
    
    // PRICE UPDATES: Every 1 minute
    priceUpdateInterval = setInterval(async () => {
      if (performanceOptimizer.getMetrics().activeConnections === 0) return;
      
      try {
        console.log('💰 1-MINUTE PRICE UPDATE: Refreshing stock prices...');
        
        // Get all unique user IDs from active connections
        const userIds = Array.from(new Set(
          Array.from(performanceOptimizer['connections'].values()).map((conn: any) => conn.userId)
        ));
        
        for (const userId of userIds) {
          const tickers = await storage.getActiveTickersWithPositionsForUser(userId);
          
          // Batch update prices for all user's symbols
          for (const ticker of tickers) {
            try {
              await performanceOptimizer.refreshSymbol(ticker.symbol, false); // Price only
            } catch (error) {
              console.warn(`Failed to update price for ${ticker.symbol}:`, error);
            }
          }
          
          // Get updated tickers with fresh prices and broadcast to WebSocket clients
          const updatedTickers = await storage.getActiveTickersWithPositionsForUser(userId);
          console.log(`📡 Broadcasting price updates to user ${userId}: ${updatedTickers.length} tickers`);
          
          // Send to all connections for this user
          const userConnections = Array.from(performanceOptimizer['connections'].values())
            .filter((conn: any) => conn.userId === userId);
          
          userConnections.forEach((connection: any) => {
            if (connection.ws && connection.ws.readyState === WebSocket.OPEN) {
              connection.ws.send(JSON.stringify({
                type: 'price_update',
                tickers: updatedTickers,
                timestamp: new Date().toISOString()
              }));
            }
          });
        }
        
        logger.info('Price update cycle completed', {
          userCount: userIds.length,
          interval: '1_minute'
        });
        
      } catch (error) {
        logger.error('Price update cycle failed', { error: error instanceof Error ? error.message : 'Unknown error' });
      }
    }, 60 * 1000); // 1 minute
    
    // OPTIONS UPDATES: Every 15 minutes
    optionsUpdateInterval = setInterval(async () => {
      if (performanceOptimizer.getMetrics().activeConnections === 0) return;
      
      try {
        console.log('📊 15-MINUTE OPTIONS UPDATE: Refreshing strikes and premiums...');
        
        // Get all unique user IDs from active connections
        const userIds = Array.from(new Set(
          Array.from(performanceOptimizer['connections'].values()).map((conn: any) => conn.userId)
        ));
        
        for (const userId of userIds) {
          const tickers = await storage.getActiveTickersWithPositionsForUser(userId);
          
          // Update options data for all user's symbols
          for (const ticker of tickers) {
            try {
              await performanceOptimizer.refreshSymbol(ticker.symbol, true); // Price + Options
              
              // Update position with fresh market data
              if (ticker.position) {
                const freshOptionsData = await performanceOptimizer.getOptionsData(ticker.symbol, ticker.position.expirationDate);
                
                if (freshOptionsData && freshOptionsData.options) {
                  // Find current strikes in fresh data
                  const filteredOptions = freshOptionsData.options.filter((opt: any) => 
                    opt.expiration_date === ticker.position.expirationDate
                  );
                  
                  const currentCallOption = filteredOptions.find((opt: any) => 
                    opt.contract_type === 'call' && opt.strike === ticker.position.longCallStrike
                  );
                  const currentPutOption = filteredOptions.find((opt: any) => 
                    opt.contract_type === 'put' && opt.strike === ticker.position.longPutStrike
                  );
                  
                  if (currentCallOption && currentPutOption) {
                    const callPremium = (currentCallOption.bid + currentCallOption.ask) / 2;
                    const putPremium = (currentPutOption.bid + currentPutOption.ask) / 2;
                    
                    // Update position with fresh premiums and current ATM value
                    await storage.updatePosition(ticker.position.id, userId, {
                      longCallPremium: Math.round(callPremium * 100) / 100,
                      longPutPremium: Math.round(putPremium * 100) / 100,
                      maxLoss: Math.round((callPremium + putPremium) * 100),
                      lowerBreakeven: Math.round((ticker.position.longPutStrike - (callPremium + putPremium)) * 100) / 100,
                      upperBreakeven: Math.round((ticker.position.longCallStrike + (callPremium + putPremium)) * 100) / 100,
                      // Update ATM value on Fridays (expiration day) to reset baseline for next cycle
                      ...(new Date().getDay() === 5 ? { atmValue: ticker.currentPrice } : {})
                    });
                    
                    console.log(`✅ 15-min update: ${ticker.symbol} premiums refreshed`);
                  }
                }
              }
            } catch (error) {
              console.warn(`Failed to update options for ${ticker.symbol}:`, error);
            }
          }
        }
        
        logger.info('Options update cycle completed', {
          userCount: userIds.length,
          interval: '15_minutes'
        });
        
      } catch (error) {
        logger.error('Options update cycle failed', { error: error instanceof Error ? error.message : 'Unknown error' });
      }
    }, getOptimalApiIntervals().optionsChain); // Market-aware interval
    
    // Restart intervals when market session changes (every hour check)
    setInterval(() => {
      const newIntervals = getOptimalApiIntervals();
      console.log(`🔄 Market session check - updating to ${newIntervals.description}`);
      
      // Clear and restart with new intervals
      if (optionsUpdateInterval) {
        clearInterval(optionsUpdateInterval);
        
        // Restart options update with new interval
        optionsUpdateInterval = setInterval(async () => {
          try {
            const userIds = performanceOptimizer.getActiveUserIds();
            
            for (const userId of userIds) {
              const tickers = await storage.getActiveTickersWithPositionsForUser(userId);
              
              // Update options data for all user's symbols
              for (const ticker of tickers) {
                try {
                  await performanceOptimizer.refreshSymbol(ticker.symbol, true);
                  // ... rest of options update logic
                } catch (error) {
                  console.error(`❌ Error refreshing ${ticker.symbol}:`, error);
                }
              }
            }
            
          } catch (error) {
            logger.error('Options update cycle failed', { error: error instanceof Error ? error.message : 'Unknown error' });
          }
        }, newIntervals.optionsChain);
      }
    }, 60 * 60 * 1000); // Check every hour
    
    // Log initial market session and intervals
    logMarketSession();
    console.log('✅ Market-aware dual-interval update system started:');
    console.log('   💰 Prices: Dynamic based on market hours');
    console.log('   📊 Options/Strikes: Dynamic based on market hours');
  };

  const stopDualIntervalUpdates = () => {
    if (priceUpdateInterval) {
      clearInterval(priceUpdateInterval);
      priceUpdateInterval = null;
      console.log('⏹️ Price updates stopped');
    }
    if (optionsUpdateInterval) {
      clearInterval(optionsUpdateInterval);
      optionsUpdateInterval = null;
      console.log('⏹️ Options updates stopped');
    }
  };

  // Start updates when first connection is made
  wss.on('connection', () => {
    startDualIntervalUpdates();
  });

  // Stop updates when no connections remain
  const checkConnections = () => {
    if (performanceOptimizer.getMetrics().activeConnections === 0) {
      stopDualIntervalUpdates();
    }
  };
  
  setInterval(checkConnections, 60000); // Check every minute

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('Shutting down WebSocket server...');
    stopDualIntervalUpdates();
    wss.close(() => {
      console.log('WebSocket server closed');
    });
  });

  console.log('✅ WebSocket server initialized with dual-interval optimization');
}
