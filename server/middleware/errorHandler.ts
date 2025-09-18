import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

// Error types for better categorization
export enum ErrorType {
  VALIDATION = 'VALIDATION_ERROR',
  AUTHENTICATION = 'AUTHENTICATION_ERROR',
  AUTHORIZATION = 'AUTHORIZATION_ERROR',
  NOT_FOUND = 'NOT_FOUND_ERROR',
  RATE_LIMIT = 'RATE_LIMIT_ERROR',
  EXTERNAL_API = 'EXTERNAL_API_ERROR',
  DATABASE = 'DATABASE_ERROR',
  INTERNAL = 'INTERNAL_SERVER_ERROR'
}

// Structured error interface
export interface AppError extends Error {
  type: ErrorType;
  statusCode: number;
  userMessage: string;
  details?: any;
  correlationId?: string;
}

// Create structured error
export function createAppError(
  type: ErrorType,
  message: string,
  userMessage: string,
  statusCode: number,
  details?: any
): AppError {
  const error = new Error(message) as AppError;
  error.type = type;
  error.statusCode = statusCode;
  error.userMessage = userMessage;
  error.details = details;
  error.correlationId = generateCorrelationId();
  return error;
}

// Generate correlation ID for request tracing
function generateCorrelationId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Enhanced error handler middleware
export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Generate correlation ID if not present
  const correlationId = err.correlationId || generateCorrelationId();
  
  // Log error with structured data
  const errorLog = {
    correlationId,
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    userId: (req as any).user?.id,
    error: {
      name: err.name,
      message: err.message,
      stack: err.stack,
      type: err.type || ErrorType.INTERNAL,
      details: err.details
    }
  };

  // Log based on severity
  if (err.statusCode >= 500) {
    console.error('🚨 SERVER ERROR:', JSON.stringify(errorLog, null, 2));
  } else if (err.statusCode >= 400) {
    console.warn('⚠️ CLIENT ERROR:', JSON.stringify(errorLog, null, 2));
  } else {
    console.info('ℹ️ INFO:', JSON.stringify(errorLog, null, 2));
  }

  // Handle different error types
  let statusCode = 500;
  let userMessage = 'An unexpected error occurred';
  let errorType = ErrorType.INTERNAL;
  let details: any = undefined;

  if (err instanceof ZodError) {
    // Zod validation errors
    statusCode = 400;
    errorType = ErrorType.VALIDATION;
    userMessage = 'Invalid input data';
    details = {
      validationErrors: err.errors.map(error => ({
        field: error.path.join('.'),
        message: error.message,
        code: error.code
      }))
    };
  } else if (err.type) {
    // Custom app errors
    statusCode = err.statusCode || 500;
    userMessage = err.userMessage || userMessage;
    errorType = err.type;
    details = err.details;
  } else if (err.name === 'UnauthorizedError') {
    // JWT/Auth errors
    statusCode = 401;
    errorType = ErrorType.AUTHENTICATION;
    userMessage = 'Authentication required';
  } else if (err.status || err.statusCode) {
    // HTTP errors
    statusCode = err.status || err.statusCode;
    if (statusCode === 404) {
      errorType = ErrorType.NOT_FOUND;
      userMessage = 'Resource not found';
    } else if (statusCode === 429) {
      errorType = ErrorType.RATE_LIMIT;
      userMessage = 'Too many requests. Please try again later.';
    }
  }

  // Prepare response
  const errorResponse: any = {
    error: true,
    type: errorType,
    message: userMessage,
    correlationId,
    timestamp: new Date().toISOString()
  };

  // Add details in development mode
  if (process.env.NODE_ENV === 'development') {
    errorResponse.details = details;
    errorResponse.stack = err.stack;
    errorResponse.originalMessage = err.message;
  } else if (details) {
    // Only add safe details in production
    errorResponse.details = details;
  }

  // Send error response
  res.status(statusCode).json(errorResponse);
}

// Async error wrapper for route handlers
export function asyncHandler<T extends Request, U extends Response>(
  fn: (req: T, res: U, next: NextFunction) => Promise<any>
) {
  return (req: T, res: U, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Not found handler
export function notFoundHandler(req: Request, res: Response, next: NextFunction): void {
  const error = createAppError(
    ErrorType.NOT_FOUND,
    `Route ${req.method} ${req.url} not found`,
    `The requested resource was not found`,
    404,
    {
      method: req.method,
      url: req.url,
      availableRoutes: [
        'GET /api/health',
        'GET /api/tickers',
        'POST /api/tickers',
        'GET /api/market-data/status'
      ]
    }
  );
  
  next(error);
}

// Request timeout handler
export function timeoutHandler(timeout: number = 30000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const timer = setTimeout(() => {
      const error = createAppError(
        ErrorType.INTERNAL,
        `Request timeout after ${timeout}ms`,
        'Request took too long to process',
        408
      );
      next(error);
    }, timeout);

    // Clear timeout when response finishes
    res.on('finish', () => clearTimeout(timer));
    res.on('close', () => clearTimeout(timer));
    
    next();
  };
}

// Validation error helper
export function validationError(message: string, details?: any): AppError {
  return createAppError(
    ErrorType.VALIDATION,
    message,
    'Invalid input provided',
    400,
    details
  );
}

// External API error helper
export function externalApiError(service: string, originalError: any): AppError {
  return createAppError(
    ErrorType.EXTERNAL_API,
    `External API error from ${service}: ${originalError.message}`,
    `${service} service is temporarily unavailable`,
    503,
    {
      service,
      originalError: originalError.message,
      statusCode: originalError.status || originalError.statusCode
    }
  );
}

// Database error helper
export function databaseError(operation: string, originalError: any): AppError {
  return createAppError(
    ErrorType.DATABASE,
    `Database error during ${operation}: ${originalError.message}`,
    'Database operation failed',
    500,
    {
      operation,
      originalError: originalError.message
    }
  );
}
