import type { Express } from "express";
import { secretsManager } from "../config/secrets";
import { env } from "../config/environment";
import { performanceOptimizer } from "../services/performanceOptimizer";
import { rateLimiter } from "../middleware/rateLimiter";
import { storage } from "../storage";
import { marketDataApiService } from "../marketDataApi";

/**
 * Health check routes for monitoring application status
 */
export function registerHealthRoutes(app: Express): void {
  
  // Overall health check
  app.get("/api/health", async (req, res) => {
    try {
      const health = {
        status: "healthy",
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || "unknown",
        environment: env.get('NODE_ENV'),
        uptime: Math.floor(process.uptime()),
        memory: process.memoryUsage(),
        checks: {
          secrets: "unknown",
          database: "unknown", 
          marketData: "unknown"
        }
      };

      // Check secrets
      try {
        const secretsHealthy = await secretsManager.healthCheck();
        health.checks.secrets = secretsHealthy ? "healthy" : "unhealthy";
      } catch (error) {
        health.checks.secrets = "unhealthy";
      }

      // Check database
      try {
        await storage.getUser("health-check-test");
        health.checks.database = "healthy";
      } catch (error) {
        health.checks.database = "unhealthy";
      }

      // Check market data API
      try {
        if (marketDataApiService.isConfigured()) {
          const testQuote = await marketDataApiService.getStockQuote("AAPL");
          health.checks.marketData = testQuote ? "healthy" : "degraded";
        } else {
          health.checks.marketData = "not_configured";
        }
      } catch (error) {
        health.checks.marketData = "unhealthy";
      }

      // Determine overall status
      const unhealthyChecks = Object.values(health.checks).filter(
        status => status === "unhealthy"
      );
      
      if (unhealthyChecks.length > 0) {
        health.status = "unhealthy";
        res.status(503);
      }

      res.json(health);
    } catch (error) {
      res.status(500).json({
        status: "error",
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Secrets health check
  app.get("/api/health/secrets", async (req, res) => {
    try {
      const isHealthy = await secretsManager.healthCheck();
      
      res.json({
        status: isHealthy ? "healthy" : "unhealthy",
        timestamp: new Date().toISOString(),
        source: env.shouldUseSecretsManager() ? "aws_secrets_manager" : "environment_variables",
        cached: !!secretsManager['cachedSecrets'], // Access private property for debugging
      });
    } catch (error) {
      res.status(503).json({
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Performance metrics
  app.get("/api/health/performance", (req, res) => {
    try {
      const metrics = {
        timestamp: new Date().toISOString(),
        optimizer: performanceOptimizer.getMetrics(),
        rateLimiter: rateLimiter.getStats(),
        process: {
          uptime: Math.floor(process.uptime()),
          memory: process.memoryUsage(),
          cpu: process.cpuUsage(),
        }
      };

      res.json(metrics);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString()
      });
    }
  });

  // Database health check
  app.get("/api/health/database", async (req, res) => {
    try {
      const startTime = Date.now();
      
      // Test database connection with a simple query
      await storage.getUser("health-check-test");
      
      const responseTime = Date.now() - startTime;
      
      res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        responseTime: `${responseTime}ms`,
        connectionPool: {
          // Add connection pool stats if available
          status: "active"
        }
      });
    } catch (error) {
      res.status(503).json({
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Market Data API health check
  app.get("/api/health/market-data", async (req, res) => {
    try {
      if (!marketDataApiService.isConfigured()) {
        return res.json({
          status: "not_configured",
          timestamp: new Date().toISOString(),
          message: "MarketData API key not configured"
        });
      }

      const startTime = Date.now();
      const testQuote = await marketDataApiService.getStockQuote("AAPL");
      const responseTime = Date.now() - startTime;

      res.json({
        status: testQuote ? "healthy" : "degraded",
        timestamp: new Date().toISOString(),
        responseTime: `${responseTime}ms`,
        testSymbol: "AAPL",
        price: testQuote?.currentPrice || null
      });
    } catch (error) {
      res.status(503).json({
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Readiness probe (for Kubernetes/container orchestration)
  app.get("/api/ready", async (req, res) => {
    try {
      // Check critical dependencies
      const secretsReady = await secretsManager.healthCheck();
      
      if (!secretsReady) {
        return res.status(503).json({
          ready: false,
          reason: "secrets_not_available"
        });
      }

      res.json({
        ready: true,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(503).json({
        ready: false,
        reason: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Liveness probe (for Kubernetes/container orchestration)
  app.get("/api/live", (req, res) => {
    res.json({
      alive: true,
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime())
    });
  });
}
