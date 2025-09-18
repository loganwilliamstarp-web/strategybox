import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "../auth";
import { setupSimpleAuth } from "../simpleAuth";
import { setupTokenAuth } from "../tokenAuth";
import { storage } from "../storage";

// Import all route modules
import { registerHealthRoutes } from "./health";
import { registerTickerRoutes } from "./tickers";
import { registerPositionRoutes } from "./positions";
import { registerMarketDataRoutes } from "./marketData";
import { registerPortfolioRoutes } from "./portfolio";
import { registerAlertsRoutes } from "./alerts";
import { registerRefreshRoutes } from "./refresh";
import { registerStrategyRoutes } from "./strategies";
import { setupWebSocket } from "./websocket";

// Import remaining routes from original file that haven't been split yet
import { registerLegacyRoutes } from "./legacy";
import { setupDebugRoutes } from "./debug";

/**
 * Register all application routes
 */
export function registerRoutes(app: Express): Server {
  // Auth middleware
  setupAuth(app);
  
  // Simple auth for development/testing
  setupSimpleAuth(app);
  
  // Token auth for bypassing session issues
  setupTokenAuth(app);
  
  // Pass storage to app locals for use in routes
  app.locals.storage = storage;

  // Register all route modules
  registerHealthRoutes(app);
  registerTickerRoutes(app);
  registerPositionRoutes(app);
  registerMarketDataRoutes(app);
  registerPortfolioRoutes(app);
  registerAlertsRoutes(app);
  registerRefreshRoutes(app);
  registerStrategyRoutes(app);
  
  // Register remaining legacy routes (to be split further)
  registerLegacyRoutes(app);
  
  // Debug routes for troubleshooting
  setupDebugRoutes(app);

  // Create HTTP server
  const httpServer = createServer(app);
  
  // Set up WebSocket with performance optimization
  setupWebSocket(httpServer);
  
  console.log('✅ All routes registered successfully');
  return httpServer;
}
