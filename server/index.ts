import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes/index";
import { setupVite, serveStatic, log } from "./vite";
import { env } from "./config/environment";
import { initializeSecrets } from "./config/secrets";
import { SupabaseSecrets } from "./config/supabaseSecrets";
import { rateLimitRules } from "./middleware/rateLimiter";
import { errorHandler, notFoundHandler, timeoutHandler } from "./middleware/errorHandler";
import { requestLogger, logger } from "./middleware/logger";
import { initializeDevelopmentConfig } from "./config/development";
import { marketDataApiService } from "./marketDataApi";

const app = express();

// Trust proxy for accurate client IPs (important for rate limiting)
app.set('trust proxy', true);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

// Request timeout middleware (30 second timeout)
app.use(timeoutHandler(30000));

// Request logging middleware
app.use(requestLogger);

// Apply rate limiting to all API routes
app.use('/api/', rateLimitRules.general);

(async () => {
  try {
    log("Starting server initialization...");
    
    // Initialize development configuration first
    if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
      log("Initializing development configuration...");
      initializeDevelopmentConfig();
    }
    
    // Initialize configuration and secrets
    log(`Environment: ${env.get('NODE_ENV')}`);
    log(`Configuration: ${JSON.stringify(env.getSummary(), null, 2)}`);
    
    // Initialize secrets - try Supabase Vault first, then AWS, then environment variables
    log("Initializing secret management...");
    try {
      // Try Supabase Vault first
      await SupabaseSecrets.initialize();
      const vaultSecrets = await SupabaseSecrets.getAllSecrets();
      
      // Apply vault secrets to environment
      Object.entries(vaultSecrets).forEach(([key, value]) => {
        if (value && !process.env[key]) {
          process.env[key] = value;
          log(`🔐 Loaded ${key} from Supabase Vault`);
        }
      });
      
      log("🔐 Using Supabase Vault for secret management");
    } catch (vaultError) {
      log("⚠️  Supabase Vault not available, trying AWS Secrets Manager...");
      
      if (env.shouldUseSecretsManager()) {
        try {
          await initializeSecrets();
          log("🔐 Using AWS Secrets Manager for secret management");
        } catch (awsError) {
          log("⚠️  AWS Secrets Manager not available, using environment variables");
        }
      } else {
        log("🔐 Using environment variables for configuration");
      }
    }
    
    // Initialize MarketData API service with secrets from Vault
    log("Initializing MarketData API service...");
    try {
      await marketDataApiService.initialize();
      if (marketDataApiService.isConfigured()) {
        log("✅ MarketData API service configured and ready");
      } else {
        log("⚠️  MarketData API service not configured - check API key in Supabase Vault");
      }
    } catch (error) {
      log("❌ Failed to initialize MarketData API service:", error);
    }
    
    const server = await registerRoutes(app);
    log("Routes registered successfully");

    // Setup frontend serving BEFORE 404 handler
    if (env.get('NODE_ENV') === "development") {
      log("Setting up Vite for development...");
      await setupVite(app, server);
      log("Vite setup completed");
    } else {
      log("Setting up static file serving for production...");
      serveStatic(app);
      log("Static file serving setup completed");
    }

    // 404 handler for unknown routes (after frontend setup)
    app.use(notFoundHandler);

    // Global error handler (must be last)
    app.use(errorHandler);

    // ALWAYS serve the app on the port specified in the environment variable PORT
    // Other ports are firewalled. Default to 5000 if not specified.
    // this serves both the API and the client.
    // It is the only port that is not firewalled.
    const port = env.getPort();
    
    log(`Attempting to start server on host: 0.0.0.0, port: ${port}`);
    
    server.listen(port, "0.0.0.0", () => {
      log(`✅ Server successfully started and listening on 0.0.0.0:${port}`);
      log(`Environment: ${env.get('NODE_ENV')}`);
      log(`🔐 Using ${env.shouldUseSecretsManager() ? 'AWS Secrets Manager' : 'Environment Variables'} for secrets`);
      
      // Log startup with structured logging
      logger.info('Server started successfully', {
        port,
        environment: env.get('NODE_ENV'),
        secretsSource: env.shouldUseSecretsManager() ? 'AWS Secrets Manager' : 'Environment Variables',
        features: {
          rateLimiting: true,
          errorHandling: true,
          structuredLogging: true,
          healthChecks: true,
          performanceOptimization: true,
          dailyATMValidation: true
        }
      });

      // ATM validation scheduler temporarily disabled for debugging
    });

    server.on('error', (error: any) => {
      log(`❌ Server error: ${error.message}`);
      console.error('Server startup error:', error);
      process.exit(1);
    });

  } catch (error: any) {
    log(`❌ Failed to initialize server: ${error.message}`);
    console.error('Server initialization error:', error);
    process.exit(1);
  }
})();
