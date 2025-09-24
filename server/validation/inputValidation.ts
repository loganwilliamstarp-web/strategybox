import { z } from 'zod';
import { strategyTypes } from '@shared/schema';

// Enhanced validation schemas
export const symbolSchema = z.string()
  .min(1, 'Symbol is required')
  .max(10, 'Symbol too long')
  .regex(/^[A-Z]+$/, 'Symbol must contain only uppercase letters')
  .transform(val => val.toUpperCase());

export const priceSchema = z.number()
  .positive('Price must be positive')
  .max(10000, 'Price seems unrealistic')
  .refine(val => !isNaN(val), 'Price must be a valid number');

export const strikeSchema = z.number()
  .positive('Strike must be positive')
  .max(10000, 'Strike seems unrealistic');

export const premiumSchema = z.number()
  .min(0.01, 'Premium must be at least $0.01')
  .max(1000, 'Premium seems unrealistic');

export const daysToExpirySchema = z.number()
  .min(0, 'Days to expiry cannot be negative')
  .max(1000, 'Days to expiry seems unrealistic');

export const strategyTypeSchema = z.enum([
  strategyTypes.LONG_STRANGLE,
  strategyTypes.SHORT_STRANGLE,
  strategyTypes.IRON_CONDOR,
  strategyTypes.BUTTERFLY_SPREAD,
  strategyTypes.DIAGONAL_CALENDAR
]);

export const expirationDateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
  .refine(val => {
    const date = new Date(val);
    return date > new Date();
  }, 'Expiration date must be in the future');

// Strategy calculation input validation
export const strategyCalculationSchema = z.object({
  strategyType: strategyTypeSchema,
  symbol: symbolSchema,
  currentPrice: priceSchema,
  expirationDate: expirationDateSchema.optional(),
  daysToExpiry: daysToExpirySchema.optional(),
  impliedVolatility: z.number().min(0).max(200).optional(),
  ivPercentile: z.number().min(0).max(100).optional()
});

// Position update validation
export const positionUpdateSchema = z.object({
  longPutStrike: strikeSchema.optional(),
  longCallStrike: strikeSchema.optional(),
  longPutPremium: premiumSchema.optional(),
  longCallPremium: premiumSchema.optional(),
  shortPutStrike: strikeSchema.optional(),
  shortCallStrike: strikeSchema.optional(),
  shortPutPremium: premiumSchema.optional(),
  shortCallPremium: premiumSchema.optional(),
  strategyType: strategyTypeSchema.optional(),
  expirationDate: expirationDateSchema.optional(),
  recalculateWithNewStrategy: z.boolean().optional()
});
// REMOVED: Strike relationship validation - allows flexible positioning strategies

// Custom strikes validation
export const customStrikesSchema = z.object({
  customPutStrike: strikeSchema,
  customCallStrike: strikeSchema,
  expirationDate: expirationDateSchema
});
// REMOVED: Custom strike validation - allows flexible positioning strategies

// Ticker creation validation
export const createTickerSchema = z.object({
  symbol: symbolSchema,
  strategyType: strategyTypeSchema.default(strategyTypes.LONG_STRANGLE),
  expirationDate: expirationDateSchema.optional()
});

// Portfolio query validation
export const portfolioQuerySchema = z.object({
  userId: z.string().uuid('Invalid user ID format'),
  includeInactive: z.boolean().default(false),
  dateFilter: expirationDateSchema.optional()
});

// Market data query validation
export const marketDataQuerySchema = z.object({
  symbol: symbolSchema,
  expirationDate: expirationDateSchema.optional(),
  strikeRange: z.object({
    min: strikeSchema,
    max: strikeSchema
  }).optional(),
  includeGreeks: z.boolean().default(true)
});

// Batch operations validation
export const batchUpdateSchema = z.object({
  updates: z.array(z.object({
    id: z.string().uuid(),
    data: z.record(z.any())
  })).min(1, 'At least one update required').max(50, 'Too many updates in batch')
});

// Price alert validation
export const priceAlertSchema = z.object({
  tickerId: z.string().uuid(),
  alertType: z.enum(['price_above', 'price_below', 'profit_target', 'stop_loss']),
  targetValue: priceSchema,
  notificationMethod: z.enum(['in_app', 'email', 'sms']).default('in_app'),
  message: z.string().max(200, 'Message too long').optional()
});

// Validation middleware factory
export function validateBody<T>(schema: z.ZodSchema<T>) {
  return (req: any, res: any, next: any) => {
    try {
      const validated = schema.parse(req.body);
      req.validatedBody = validated;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code,
            received: err.received
          }))
        });
      }
      next(error);
    }
  };
}

// Validation middleware for query parameters
export function validateQuery<T>(schema: z.ZodSchema<T>) {
  return (req: any, res: any, next: any) => {
    try {
      const validated = schema.parse(req.query);
      req.validatedQuery = validated;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Query validation failed',
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code
          }))
        });
      }
      next(error);
    }
  };
}

// Validation middleware for URL parameters
export function validateParams<T>(schema: z.ZodSchema<T>) {
  return (req: any, res: any, next: any) => {
    try {
      const validated = schema.parse(req.params);
      req.validatedParams = validated;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Parameter validation failed',
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code
          }))
        });
      }
      next(error);
    }
  };
}
