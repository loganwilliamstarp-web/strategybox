import type { Express } from "express";
import { requireSupabaseAuth } from "../supabaseAuth";
import { storage } from "../storage";
import { rateLimitRules } from "../middleware/rateLimiter";

/**
 * Register price alert and recommendation routes
 */
export function registerAlertsRoutes(app: Express): void {

  // Price Alert routes
  app.get("/api/alerts", requireSupabaseAuth, rateLimitRules.general, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const alerts = await storage.getPriceAlertsForUser(userId);
      res.json(alerts);
    } catch (error) {
      console.error('Error fetching alerts:', error);
      res.status(500).json({ 
        message: "Failed to fetch alerts",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.post("/api/alerts", requireSupabaseAuth, rateLimitRules.general, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { createPriceAlertSchema } = await import("@shared/schema");
      const alertData = createPriceAlertSchema.parse(req.body);
      
      const alert = await storage.createPriceAlert(userId, alertData);
      res.json(alert);
    } catch (error) {
      console.error('Error creating alert:', error);
      res.status(400).json({ 
        message: "Failed to create alert",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.delete("/api/alerts/:id", requireSupabaseAuth, rateLimitRules.general, async (req: any, res) => {
    try {
      const { id } = req.params;
      await storage.deletePriceAlert(id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting alert:', error);
      res.status(500).json({ 
        message: "Failed to delete alert",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Exit Recommendations routes
  app.get("/api/recommendations", requireSupabaseAuth, rateLimitRules.general, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const recommendations = await storage.getExitRecommendationsForUser(userId);
      res.json(recommendations);
    } catch (error) {
      console.error('Error fetching recommendations:', error);
      res.status(500).json({ 
        message: "Failed to fetch recommendations",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.post("/api/recommendations/:id/dismiss", requireSupabaseAuth, rateLimitRules.general, async (req: any, res) => {
    try {
      const { id } = req.params;
      await storage.dismissRecommendation(id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error dismissing recommendation:', error);
      res.status(500).json({ 
        message: "Failed to dismiss recommendation",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Enhanced ticker route with alerts and recommendations
  app.get("/api/tickers/enhanced", requireSupabaseAuth, rateLimitRules.general, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const tickersWithAlertsAndRecs = await storage.getActiveTickersWithAlertsAndRecsForUser(userId);
      res.json(tickersWithAlertsAndRecs);
    } catch (error) {
      console.error('Error fetching enhanced ticker data:', error);
      res.status(500).json({ 
        message: "Failed to fetch enhanced ticker data",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // AI-powered exit recommendations generation endpoint
  app.post("/api/recommendations/generate", requireSupabaseAuth, rateLimitRules.general, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const tickers = await storage.getActiveTickersWithPositionsForUser(userId);
      
      // Generate AI-powered recommendations for each position
      const recommendations = [];
      
      for (const ticker of tickers) {
        const { position } = ticker;
        
        // Analyze position for exit recommendations
        const daysToExpiry = position.daysToExpiry;
        const ivPercentile = position.ivPercentile;
        const currentPL = ((ticker.currentPrice - position.atmValue) / position.atmValue) * 100;
        
        let recommendationType: 'take_profit' | 'cut_loss' | 'roll_position' | 'hold' = 'hold';
        let confidence = 50;
        let reasoning = '';
        let targetAction = '';
        let priority: 'low' | 'medium' | 'high' | 'urgent' = 'medium';
        let profitLossImpact = 0;
        let riskLevel: 'low' | 'medium' | 'high' = 'medium';
        
        // High IV percentile suggests taking profits
        if (ivPercentile > 75 && Math.abs(currentPL) > 15) {
          recommendationType = 'take_profit';
          confidence = 80;
          reasoning = `High IV percentile (${ivPercentile}%) indicates elevated volatility. Consider taking profits as volatility may normalize.`;
          targetAction = `Close position to capture ${Math.abs(currentPL).toFixed(1)}% volatility premium`;
          priority = 'high';
          profitLossImpact = position.maxLoss * 0.3; // Estimate 30% profit
          riskLevel = 'low';
        }
        
        // Time decay acceleration
        else if (daysToExpiry < 7) {
          if (Math.abs(currentPL) < 5) {
            recommendationType = 'cut_loss';
            confidence = 90;
            reasoning = `Position expiring in ${daysToExpiry} days with minimal movement. Theta decay accelerating rapidly.`;
            targetAction = 'Close position to minimize time decay losses';
            priority = 'urgent';
            profitLossImpact = -position.maxLoss * 0.8; // Estimate 80% of max loss
            riskLevel = 'high';
          } else {
            recommendationType = 'take_profit';
            confidence = 85;
            reasoning = `Strong directional move with ${daysToExpiry} days to expiry. Lock in gains before time decay.`;
            targetAction = `Close profitable side, let profitable leg run to expiration`;
            priority = 'high';
            profitLossImpact = position.maxLoss * 0.4;
            riskLevel = 'medium';
          }
        }
        
        // Low IV suggests rolling
        else if (ivPercentile < 25 && daysToExpiry > 14) {
          recommendationType = 'roll_position';
          confidence = 70;
          reasoning = `Low IV percentile (${ivPercentile}%) suggests waiting for volatility expansion before taking action.`;
          targetAction = 'Consider rolling to later expiration to capture future volatility';
          priority = 'medium';
          profitLossImpact = position.maxLoss * 0.1; // Small benefit from rolling
          riskLevel = 'low';
        }
        
        // Strong directional movement
        else if (Math.abs(currentPL) > 20) {
          recommendationType = 'take_profit';
          confidence = 75;
          reasoning = `Significant ${currentPL > 0 ? 'upward' : 'downward'} movement (${Math.abs(currentPL).toFixed(1)}%). Consider partial profit taking.`;
          targetAction = 'Close profitable leg, adjust remaining position';
          priority = 'high';
          profitLossImpact = position.maxLoss * 0.4;
          riskLevel = 'medium';
        }
        
        // Only create recommendation if not holding
        if (recommendationType !== 'hold') {
          const recommendation = await storage.createExitRecommendation({
            userId,
            tickerId: ticker.id,
            positionId: position.id,
            recommendationType,
            confidence,
            reasoning,
            targetAction,
            priority,
            profitLossImpact,
            riskLevel
          });
          recommendations.push(recommendation);
        }
      }
      
      res.json(recommendations);
    } catch (error) {
      console.error('Error generating recommendations:', error);
      res.status(500).json({ 
        message: "Failed to generate recommendations",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}
