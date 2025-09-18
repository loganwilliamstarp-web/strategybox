import { Pool, PoolConfig } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { env } from '../config/environment';
import { logger } from '../middleware/logger';

// Enhanced connection pool configuration
const poolConfig: PoolConfig = {
  // Connection settings
  connectionString: process.env.DATABASE_URL,
  
  // Pool size configuration
  min: 2,                    // Minimum connections to maintain
  max: 20,                   // Maximum connections allowed
  
  // Connection timing
  idleTimeoutMillis: 30000,  // Close idle connections after 30s
  connectionTimeoutMillis: 5000, // Timeout for new connections
  
  // Query timing
  query_timeout: 10000,      // 10s query timeout
  statement_timeout: 15000,  // 15s statement timeout
  
  // Health checking
  allowExitOnIdle: true,     // Allow process to exit when idle
  
  // SSL configuration for production
  ssl: env.isProduction() ? {
    rejectUnauthorized: false // Allow self-signed certificates in some cloud environments
  } : false
};

// Create connection pool
export const pool = new Pool(poolConfig);

// Create Drizzle instance with pool
export const db = drizzle(pool);

// Pool event handlers for monitoring
pool.on('connect', (client) => {
  logger.debug('Database connection established', {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount
  });
});

pool.on('acquire', (client) => {
  logger.debug('Database connection acquired', {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount
  });
});

pool.on('error', (err, client) => {
  logger.error('Database pool error', {
    error: err.message,
    totalCount: pool.totalCount,
    idleCount: pool.idleCount
  });
});

pool.on('remove', (client) => {
  logger.debug('Database connection removed', {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount
  });
});

// Pool health monitoring
export class DatabasePoolMonitor {
  
  /**
   * Get current pool statistics
   */
  static getPoolStats() {
    return {
      totalConnections: pool.totalCount,
      idleConnections: pool.idleCount,
      waitingClients: pool.waitingCount,
      maxConnections: poolConfig.max,
      minConnections: poolConfig.min,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Health check for database pool
   */
  static async healthCheck(): Promise<{
    healthy: boolean;
    responseTime: number;
    stats: ReturnType<typeof DatabasePoolMonitor.getPoolStats>;
    error?: string;
  }> {
    const startTime = Date.now();
    
    try {
      // Test query
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      
      const responseTime = Date.now() - startTime;
      
      return {
        healthy: true,
        responseTime,
        stats: this.getPoolStats()
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      logger.error('Database health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime
      });
      
      return {
        healthy: false,
        responseTime,
        stats: this.getPoolStats(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Monitor pool for potential issues
   */
  static startMonitoring() {
    setInterval(() => {
      const stats = this.getPoolStats();
      
      // Warn if pool is getting full
      if (stats.totalConnections >= (poolConfig.max || 20) * 0.8) {
        logger.warn('Database pool nearing capacity', stats);
      }
      
      // Warn if many clients are waiting
      if (stats.waitingClients > 5) {
        logger.warn('High database connection wait queue', stats);
      }
      
      // Log periodic stats in development
      if (env.isDevelopment()) {
        logger.debug('Database pool stats', stats);
      }
      
    }, 60000); // Check every minute
  }

  /**
   * Graceful shutdown
   */
  static async shutdown(): Promise<void> {
    try {
      logger.info('Shutting down database pool...');
      await pool.end();
      logger.info('Database pool shutdown complete');
    } catch (error) {
      logger.error('Error during database pool shutdown', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

// Start monitoring
DatabasePoolMonitor.startMonitoring();

// Graceful shutdown on process termination
process.on('SIGTERM', async () => {
  await DatabasePoolMonitor.shutdown();
});

process.on('SIGINT', async () => {
  await DatabasePoolMonitor.shutdown();
});

// Export pool utilities
export { DatabasePoolMonitor };
