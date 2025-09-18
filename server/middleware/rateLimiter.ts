import type { Request, Response, NextFunction } from 'express';

interface RateLimitRule {
  windowMs: number;
  maxRequests: number;
  message?: string;
}

interface ClientRecord {
  requests: number[];
  blocked: boolean;
  blockExpiry?: number;
}

/**
 * In-memory rate limiter with configurable rules per endpoint
 */
export class RateLimiter {
  private clients = new Map<string, ClientRecord>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired records every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  /**
   * Create rate limit middleware
   */
  create(rule: RateLimitRule) {
    return (req: Request, res: Response, next: NextFunction) => {
      const clientId = this.getClientId(req);
      const now = Date.now();

      // Get or create client record
      let client = this.clients.get(clientId);
      if (!client) {
        client = { requests: [], blocked: false };
        this.clients.set(clientId, client);
      }

      // Check if client is currently blocked
      if (client.blocked && client.blockExpiry && now < client.blockExpiry) {
        const remainingMs = client.blockExpiry - now;
        const remainingSeconds = Math.ceil(remainingMs / 1000);
        
        return res.status(429).json({
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Try again in ${remainingSeconds} seconds.`,
          retryAfter: remainingSeconds
        });
      }

      // Clear block if expired
      if (client.blocked && client.blockExpiry && now >= client.blockExpiry) {
        client.blocked = false;
        client.blockExpiry = undefined;
        client.requests = [];
      }

      // Remove old requests outside the window
      const windowStart = now - rule.windowMs;
      client.requests = client.requests.filter(timestamp => timestamp > windowStart);

      // Check if limit exceeded
      if (client.requests.length >= rule.maxRequests) {
        // Block client for the window duration
        client.blocked = true;
        client.blockExpiry = now + rule.windowMs;
        
        const blockSeconds = Math.ceil(rule.windowMs / 1000);
        
        // Log rate limit violation
        console.warn(`🚨 Rate limit exceeded for ${clientId} on ${req.path}`);
        
        return res.status(429).json({
          error: 'Too Many Requests',
          message: rule.message || `Rate limit exceeded. Maximum ${rule.maxRequests} requests per ${blockSeconds} seconds.`,
          retryAfter: blockSeconds
        });
      }

      // Record this request
      client.requests.push(now);

      // Add rate limit headers
      const remaining = Math.max(0, rule.maxRequests - client.requests.length);
      const resetTime = Math.ceil((windowStart + rule.windowMs) / 1000);
      
      res.setHeader('X-RateLimit-Limit', rule.maxRequests);
      res.setHeader('X-RateLimit-Remaining', remaining);
      res.setHeader('X-RateLimit-Reset', resetTime);
      res.setHeader('X-RateLimit-Window', Math.ceil(rule.windowMs / 1000));

      next();
    };
  }

  /**
   * Get client identifier (IP + User-Agent for better uniqueness)
   */
  private getClientId(req: Request): string {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.get('User-Agent') || 'unknown';
    return `${ip}:${userAgent.substring(0, 50)}`;
  }

  /**
   * Clean up expired client records
   */
  private cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [clientId, client] of this.clients.entries()) {
      // Remove clients with no recent requests and not blocked
      const hasRecentRequests = client.requests.some(timestamp => now - timestamp < 60 * 60 * 1000); // 1 hour
      const isBlocked = client.blocked && client.blockExpiry && now < client.blockExpiry;

      if (!hasRecentRequests && !isBlocked) {
        this.clients.delete(clientId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} expired rate limit records`);
    }
  }

  /**
   * Get current stats
   */
  getStats(): Record<string, any> {
    const activeClients = this.clients.size;
    const blockedClients = Array.from(this.clients.values()).filter(c => c.blocked).length;
    
    return {
      activeClients,
      blockedClients,
      timestamp: Date.now()
    };
  }

  /**
   * Reset rate limits for a client (admin function)
   */
  resetClient(clientId: string): boolean {
    const client = this.clients.get(clientId);
    if (client) {
      client.requests = [];
      client.blocked = false;
      client.blockExpiry = undefined;
      return true;
    }
    return false;
  }

  /**
   * Cleanup on shutdown
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.clients.clear();
  }
}

// Create singleton instance
const rateLimiter = new RateLimiter();

// Pre-configured rate limit rules
export const rateLimitRules = {
  // General API endpoints (very lenient for real-time updates)
  general: rateLimiter.create({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 1000, // Much higher for real-time updates
    message: 'Too many requests from this IP, please try again later.'
  }),

  // Market data endpoints (increased for real-time updates)
  marketData: rateLimiter.create({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100, // Increased for frequent updates
    message: 'Market data rate limit exceeded. Please reduce request frequency.'
  }),

  // Authentication endpoints (very restrictive)
  auth: rateLimiter.create({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5,
    message: 'Too many authentication attempts. Please try again later.'
  }),

  // Position updates (much higher for real-time updates)
  positions: rateLimiter.create({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100, // Much higher for strategy changes
    message: 'Too many position updates. Please wait before making more changes.'
  }),

  // Ticker operations (very lenient for real-time updates)
  tickers: rateLimiter.create({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 200, // Much higher for 10-second refresh intervals
    message: 'Too many ticker operations. Please wait before adding more tickers.'
  }),

  // Ticker creation (separate, more restrictive limit for POST operations)
  tickerCreation: rateLimiter.create({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 20, // 20 new tickers per minute should be plenty
    message: 'Too many ticker additions. Please wait before adding more tickers.'
  })
};

export { rateLimiter };
