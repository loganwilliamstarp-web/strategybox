import { sql } from "drizzle-orm";
import { pgTable, text, varchar, real, integer, boolean, timestamp, index, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const tickers = pgTable("tickers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  symbol: text("symbol").notNull(),
  companyName: text("company_name").notNull(),
  currentPrice: real("current_price").notNull(),
  priceChange: real("price_change").notNull(),
  priceChangePercent: real("price_change_percent").notNull(),
  earningsDate: text("earnings_date"), // Next earnings announcement date
  isActive: boolean("is_active").notNull().default(true),
});

// Session storage table (required for Replit Auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table - updated for email/password auth
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").notNull().unique(),
  password: varchar("password").notNull(), // Hashed password
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name").notNull(),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const longStranglePositions = pgTable("long_strangle_positions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tickerId: varchar("ticker_id").notNull().references(() => tickers.id),
  strategyType: text("strategy_type").notNull().default('long_strangle'), // 'long_strangle', 'short_strangle', 'iron_condor', 'diagonal_calendar', 'butterfly_spread'
  // Strike prices - flexible for different strategies
  longPutStrike: real("long_put_strike").notNull(),
  longCallStrike: real("long_call_strike").notNull(),
  longPutPremium: real("long_put_premium").notNull(),
  longCallPremium: real("long_call_premium").notNull(),
  // Additional strikes for complex strategies
  shortPutStrike: real("short_put_strike"), // For butterfly spreads
  shortCallStrike: real("short_call_strike"), // For butterfly spreads  
  shortPutPremium: real("short_put_premium"), // For short strangles/butterflies
  shortCallPremium: real("short_call_premium"), // For short strangles/butterflies
  // Expiration dates - for diagonal strategies
  longExpiration: text("long_expiration"), // Primary expiration - nullable for backward compatibility
  shortExpiration: text("short_expiration"), // For diagonal calendars
  // P&L calculations
  lowerBreakeven: real("lower_breakeven").notNull(),
  upperBreakeven: real("upper_breakeven").notNull(),
  maxLoss: real("max_loss").notNull(),
  maxProfit: real("max_profit"), // For strategies with defined max profit
  atmValue: real("atm_value").notNull(),
  impliedVolatility: real("implied_volatility").notNull(),
  ivPercentile: real("iv_percentile").notNull().default(50),
  daysToExpiry: integer("days_to_expiry").notNull(),
  expirationDate: text("expiration_date").notNull(), // Keep for backward compatibility
  // Individual leg IV values for accurate display (temporarily disabled)
  // callIV: real("call_iv"),
  // putIV: real("put_iv"),
  // Expected move data for performance (temporarily disabled)
  // expectedMoveWeeklyLow: real("expected_move_weekly_low"),
  // expectedMoveWeeklyHigh: real("expected_move_weekly_high"),
  // expectedMoveDailyMove: real("expected_move_daily_move"),
  // expectedMoveWeeklyMove: real("expected_move_weekly_move"),
  // expectedMoveMovePercentage: real("expected_move_move_percentage"),
  strikesManuallySelected: boolean("strikes_manually_selected").notNull().default(false),
  // Custom strike fields for manual selection
  customCallStrike: real("custom_call_strike"), // User-selected call strike
  customPutStrike: real("custom_put_strike"), // User-selected put strike
  expirationCycleForCustomStrikes: text("expiration_cycle_for_custom_strikes"), // Expiration date when custom strikes were set
});

// Options chain data for browsing available strikes and expirations
export const optionsChains = pgTable("options_chains", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  symbol: text("symbol").notNull(),
  expirationDate: text("expiration_date").notNull(),
  strike: real("strike").notNull(),
  optionType: text("option_type").notNull(), // 'call' or 'put'
  bid: real("bid").notNull(),
  ask: real("ask").notNull(),
  lastPrice: real("last_price").notNull(),
  volume: integer("volume").notNull(),
  openInterest: integer("open_interest").notNull(),
  impliedVolatility: real("implied_volatility").notNull(),
  delta: real("delta").notNull(),
  gamma: real("gamma").notNull(),
  theta: real("theta").notNull(),
  vega: real("vega").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Price alerts for notifications
export const priceAlerts = pgTable("price_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  tickerId: varchar("ticker_id").notNull().references(() => tickers.id),
  alertType: text("alert_type").notNull(), // 'price_above', 'price_below', 'profit_target', 'stop_loss'
  targetValue: real("target_value").notNull(),
  currentValue: real("current_value").notNull(),
  isTriggered: boolean("is_triggered").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  notificationMethod: text("notification_method").notNull().default('in_app'), // 'in_app', 'email', 'sms'
  message: text("message"),
  createdAt: timestamp("created_at").defaultNow(),
  triggeredAt: timestamp("triggered_at"),
});

// Exit recommendations based on AI analysis
export const exitRecommendations = pgTable("exit_recommendations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  tickerId: varchar("ticker_id").notNull().references(() => tickers.id),
  positionId: varchar("position_id").notNull().references(() => longStranglePositions.id),
  recommendationType: text("recommendation_type").notNull(), // 'take_profit', 'cut_loss', 'roll_position', 'hold'
  confidence: real("confidence").notNull(), // 0-100 confidence score
  reasoning: text("reasoning").notNull(),
  targetAction: text("target_action").notNull(), // Specific action to take
  priority: text("priority").notNull().default('medium'), // 'low', 'medium', 'high', 'urgent'
  profitLossImpact: real("profit_loss_impact"), // Expected P&L impact
  riskLevel: text("risk_level").notNull(), // 'low', 'medium', 'high'
  isActive: boolean("is_active").notNull().default(true),
  isDismissed: boolean("is_dismissed").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTickerSchema = createInsertSchema(tickers).omit({
  id: true,
});

export const insertLongStranglePositionSchema = createInsertSchema(longStranglePositions).omit({
  id: true,
});

export const insertOptionsChainSchema = createInsertSchema(optionsChains).omit({
  id: true,
  updatedAt: true,
});

export const insertPriceAlertSchema = createInsertSchema(priceAlerts).omit({
  id: true,
  createdAt: true,
  triggeredAt: true,
});

export const insertExitRecommendationSchema = createInsertSchema(exitRecommendations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Strategy type definitions
export const strategyTypes = {
  LONG_STRANGLE: 'long_strangle',
  SHORT_STRANGLE: 'short_strangle', 
  IRON_CONDOR: 'iron_condor',
  DIAGONAL_CALENDAR: 'diagonal_calendar',
  BUTTERFLY_SPREAD: 'butterfly_spread'
} as const;

export type StrategyType = typeof strategyTypes[keyof typeof strategyTypes];

export const addTickerSchema = z.object({
  symbol: z.string().min(1).max(10).toUpperCase(),
});

export const createPriceAlertSchema = z.object({
  tickerId: z.string(),
  alertType: z.enum(['price_above', 'price_below', 'profit_target', 'stop_loss']),
  targetValue: z.number().positive(),
  notificationMethod: z.enum(['in_app', 'email', 'sms']).default('in_app'),
  message: z.string().optional(),
});

export type InsertTicker = z.infer<typeof insertTickerSchema>;
export type Ticker = typeof tickers.$inferSelect;
export type InsertLongStranglePosition = z.infer<typeof insertLongStranglePositionSchema>;
export type OptionsPosition = typeof longStranglePositions.$inferSelect;
export type AddTickerRequest = z.infer<typeof addTickerSchema>;

export type InsertOptionsChain = z.infer<typeof insertOptionsChainSchema>;
export type OptionsChain = typeof optionsChains.$inferSelect;
export type InsertPriceAlert = z.infer<typeof insertPriceAlertSchema>;
export type PriceAlert = typeof priceAlerts.$inferSelect;
export type InsertExitRecommendation = z.infer<typeof insertExitRecommendationSchema>;
export type ExitRecommendation = typeof exitRecommendations.$inferSelect;
export type CreatePriceAlertRequest = z.infer<typeof createPriceAlertSchema>;

export type TickerWithPosition = Ticker & {
  position: OptionsPosition & {
    expectedMove?: {
      weeklyLow: number;
      weeklyHigh: number;
      dailyMove: number;
      weeklyMove: number;
      movePercentage: number;
    };
  };
};

// WebSocket message types for real-time updates
export type WebSocketMessage = {
  type: 'authenticated' | 'initial_data' | 'price_update' | 'premium_update' | 'error';
  connectionId?: string;
  tickers?: TickerWithPosition[];
  symbol?: string;
  callPremium?: number;
  putPremium?: number;
  updatedTicker?: TickerWithPosition;
  timestamp?: string;
  error?: string;
};

export type TickerWithAlertsAndRecs = TickerWithPosition & {
  alerts: PriceAlert[];
  recommendations: ExitRecommendation[];
};

export type PortfolioSummary = {
  totalPremiumPaid: number;
  activePositions: number;
  avgDaysToExpiry: number;
  totalMaxLoss: number;
  avgImpliedVolatility: number;
};

export type OptionsChainData = {
  symbol: string;
  expirationDates: string[];
  chains: {
    [expiration: string]: {
      calls: OptionsChain[];
      puts: OptionsChain[];
    };
  };
};

// Auth types for email/password authentication
export type InsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// Schema for user registration
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  profileImageUrl: true,
  createdAt: true,
  updatedAt: true,
});

// Schema for user login
export const loginUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
