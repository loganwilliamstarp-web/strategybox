// Simple authentication system that works without database dependencies
import { Express } from "express";
import session from "express-session";
import { storage } from "./storage";

// In-memory user store for development
const users = new Map<string, any>();
const usersByEmail = new Map<string, any>();

// Create demo users
const demoUser = {
  id: 'demo-user-12345',
  email: 'demo@options.com',
  firstName: 'Demo',
  lastName: 'User',
  createdAt: new Date(),
  updatedAt: new Date()
};

users.set(demoUser.id, demoUser);
usersByEmail.set(demoUser.email, demoUser);

export function setupSimpleAuth(app: Express) {
  // Note: Using the main session store from auth.ts, not creating a separate one

  // Simple login endpoint that works with main auth system
  app.post("/api/simple-login", (req, res) => {
    try {
      // Set session data directly for compatibility
      const session = req.session as any;
      session.userId = demoUser.id;
      session.user = demoUser;
      
      // Force session save before responding
      session.save((saveErr: any) => {
        if (saveErr) {
          console.error('Session save error:', saveErr);
          return res.status(500).json({ error: 'Session save failed' });
        }
        
        // Also use passport login for compatibility with requireAuth middleware
        req.login(demoUser, (err) => {
          if (err) {
            console.error('Simple login error:', err);
            return res.status(500).json({ error: 'Login failed' });
          }
          
          console.log('✅ Simple login successful for demo user');
          console.log('✅ Session set and saved:', { userId: session.userId, hasUser: !!session.user });
          res.json(demoUser);
        });
      });
    } catch (error) {
      console.error('Simple login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  // Simple auth check endpoint
  app.get("/api/simple-auth/user", (req, res) => {
    try {
      const session = req.session as any;
      console.log('🔍 Simple auth check:', {
        hasSession: !!req.session,
        sessionId: req.sessionID,
        userId: session?.userId,
        hasUser: !!session?.user,
        sessionKeys: Object.keys(session || {})
      });
      
      // If Passport already authenticated, return req.user to avoid extra 401s
      if (req.isAuthenticated && req.isAuthenticated() && req.user) {
        console.log('✅ Simple auth check via Passport session');
        return res.json(req.user);
      }

      if (session?.userId && session?.user) {
        console.log('✅ Simple auth check successful');
        res.json(session.user);
      } else {
        console.log('❌ Simple auth check failed - no session data');
        res.status(401).json({ message: "Unauthorized" });
      }
    } catch (error) {
      console.error('Simple auth check error:', error);
      res.status(401).json({ message: "Unauthorized" });
    }
  });

  // Simple logout endpoint
  app.post("/api/simple-logout", (req, res) => {
    try {
      req.session.destroy((err) => {
        if (err) {
          console.error('Simple logout error:', err);
          return res.status(500).json({ error: 'Logout failed' });
        }
        res.json({ message: 'Logged out successfully' });
      });
    } catch (error) {
      console.error('Simple logout error:', error);
      res.status(500).json({ error: 'Logout failed' });
    }
  });

  // Create demo tickers for real-time testing
  app.post("/api/demo-tickers", requireSimpleAuth, async (req, res) => {
    try {
      const demoTickers = [
        { symbol: 'AAPL', userId: req.user.id },
        { symbol: 'TSLA', userId: req.user.id },
        { symbol: 'MSFT', userId: req.user.id },
        { symbol: 'NVDA', userId: req.user.id }
      ];

      // Create demo ticker data in mock database
      const createdTickers = [];
      for (const ticker of demoTickers) {
        try {
          const created = await storage.createTicker(ticker);
          createdTickers.push(created);
        } catch (error) {
          console.warn('Error creating demo ticker:', ticker.symbol, error);
        }
      }

      console.log(`✅ Created ${createdTickers.length} demo tickers for real-time testing`);
      res.json({ 
        message: `Created ${createdTickers.length} demo tickers`,
        tickers: createdTickers 
      });
    } catch (error) {
      console.error('Demo tickers error:', error);
      res.status(500).json({ error: 'Failed to create demo tickers' });
    }
  });

  console.log('✅ Simple authentication system initialized');
}

// Simple auth middleware
export function requireSimpleAuth(req: any, res: any, next: any) {
  const session = req.session as any;
  if (session?.userId && session?.user) {
    req.user = session.user;
    next();
  } else {
    res.status(401).json({ message: "Unauthorized" });
  }
}

export { users, usersByEmail };
