import type { Request, Response, NextFunction } from 'express';

// Log levels
export enum LogLevel {
  ERROR = 'ERROR',
  WARN = 'WARN', 
  INFO = 'INFO',
  DEBUG = 'DEBUG'
}

// Structured log interface
interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  correlationId?: string;
  userId?: string;
  method?: string;
  url?: string;
  statusCode?: number;
  responseTime?: number;
  ip?: string;
  userAgent?: string;
  data?: any;
}

// Logger class
class Logger {
  private isDevelopment = process.env.NODE_ENV === 'development';
  
  private createLogEntry(
    level: LogLevel,
    message: string,
    data?: any,
    req?: Request,
    res?: Response
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message
    };

    // Add request context if available
    if (req) {
      entry.method = req.method;
      entry.url = req.url;
      entry.ip = req.ip;
      entry.userAgent = req.get('User-Agent');
      entry.userId = (req as any).user?.id;
      entry.correlationId = (req as any).correlationId;
    }

    // Add response context if available
    if (res) {
      entry.statusCode = res.statusCode;
      entry.responseTime = (req as any).startTime ? Date.now() - (req as any).startTime : undefined;
    }

    // Add additional data
    if (data) {
      entry.data = data;
    }

    return entry;
  }

  private output(entry: LogEntry): void {
    const logString = JSON.stringify(entry, null, this.isDevelopment ? 2 : 0);
    
    switch (entry.level) {
      case LogLevel.ERROR:
        console.error(logString);
        break;
      case LogLevel.WARN:
        console.warn(logString);
        break;
      case LogLevel.INFO:
        console.info(logString);
        break;
      case LogLevel.DEBUG:
        if (this.isDevelopment) {
          console.debug(logString);
        }
        break;
    }
  }

  error(message: string, data?: any, req?: Request, res?: Response): void {
    const entry = this.createLogEntry(LogLevel.ERROR, message, data, req, res);
    this.output(entry);
  }

  warn(message: string, data?: any, req?: Request, res?: Response): void {
    const entry = this.createLogEntry(LogLevel.WARN, message, data, req, res);
    this.output(entry);
  }

  info(message: string, data?: any, req?: Request, res?: Response): void {
    const entry = this.createLogEntry(LogLevel.INFO, message, data, req, res);
    this.output(entry);
  }

  debug(message: string, data?: any, req?: Request, res?: Response): void {
    if (this.isDevelopment) {
      const entry = this.createLogEntry(LogLevel.DEBUG, message, data, req, res);
      this.output(entry);
    }
  }

  // API-specific logging methods
  apiRequest(req: Request, message?: string): void {
    this.info(message || 'API Request', {
      endpoint: `${req.method} ${req.url}`,
      query: req.query,
      body: this.sanitizeBody(req.body)
    }, req);
  }

  apiResponse(req: Request, res: Response, message?: string): void {
    const responseTime = (req as any).startTime ? Date.now() - (req as any).startTime : undefined;
    
    this.info(message || 'API Response', {
      endpoint: `${req.method} ${req.url}`,
      statusCode: res.statusCode,
      responseTime: responseTime ? `${responseTime}ms` : undefined
    }, req, res);
  }

  marketDataCall(symbol: string, operation: string, success: boolean, data?: any): void {
    this.info(`Market Data API: ${operation}`, {
      symbol,
      operation,
      success,
      ...data
    });
  }

  databaseOperation(operation: string, table: string, success: boolean, data?: any): void {
    this.debug(`Database: ${operation}`, {
      table,
      operation,
      success,
      ...data
    });
  }

  websocketEvent(event: string, userId?: string, data?: any): void {
    this.debug(`WebSocket: ${event}`, {
      event,
      userId,
      ...data
    });
  }

  performanceMetric(operation: string, duration: number, data?: any): void {
    const level = duration > 5000 ? LogLevel.WARN : LogLevel.INFO;
    const entry = this.createLogEntry(level, `Performance: ${operation}`, {
      operation,
      duration: `${duration}ms`,
      ...data
    });
    this.output(entry);
  }

  // Sanitize sensitive data from request bodies
  private sanitizeBody(body: any): any {
    if (!body || typeof body !== 'object') {
      return body;
    }

    const sensitiveFields = ['password', 'token', 'apiKey', 'secret', 'authorization'];
    const sanitized = { ...body };

    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }
}

// Export singleton logger instance
export const logger = new Logger();

// Request logging middleware
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  // Add start time for response time calculation
  (req as any).startTime = Date.now();
  
  // Generate correlation ID for request tracing
  (req as any).correlationId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Log API requests (skip health checks and static assets)
  if (req.path.startsWith('/api') && !req.path.includes('/health')) {
    logger.apiRequest(req);
  }

  // Log response when finished
  res.on('finish', () => {
    if (req.path.startsWith('/api') && !req.path.includes('/health')) {
      // Determine log level based on status code
      const statusCode = res.statusCode;
      if (statusCode >= 500) {
        logger.error('API Response Error', { statusCode }, req, res);
      } else if (statusCode >= 400) {
        logger.warn('API Response Warning', { statusCode }, req, res);
      } else {
        logger.apiResponse(req, res);
      }
    }
  });

  next();
}

// Performance monitoring middleware
export function performanceLogger(operation: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      logger.performanceMetric(operation, duration, {
        endpoint: `${req.method} ${req.url}`,
        statusCode: res.statusCode
      });
    });

    next();
  };
}
