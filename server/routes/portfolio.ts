import type { Express } from "express";
import { requireSupabaseAuth } from "../supabaseAuth";
import { storage } from "../storage";
import { rateLimitRules } from "../middleware/rateLimiter";

/**
 * Register portfolio-related routes
 */
export function registerPortfolioRoutes(app: Express): void {

  // Get portfolio summary
  app.get("/api/portfolio/summary", requireSupabaseAuth, rateLimitRules.general, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const summary = await storage.getPortfolioSummaryForUser(userId);
      res.json(summary);
    } catch (error) {
      console.error('Error fetching portfolio summary:', error);
      res.status(500).json({ 
        message: "Failed to fetch portfolio summary",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}
