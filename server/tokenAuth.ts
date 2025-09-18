// Token-based authentication system to bypass session issues
import { Express } from "express";
import { randomUUID } from 'crypto';

// In-memory token store
const activeTokens = new Map<string, any>();

// Demo user
const demoUser = {
  id: 'demo-user-12345',
  email: 'demo@options.com',
  firstName: 'Demo',
  lastName: 'User',
  createdAt: new Date(),
  updatedAt: new Date()
};

export function setupTokenAuth(app: Express) {
  // Token-based login endpoint
  app.post("/api/token-login", (req, res) => {
    try {
      // Generate a unique token
      const token = randomUUID();
      
      // Store user data with token
      activeTokens.set(token, {
        user: demoUser,
        createdAt: new Date(),
        lastUsed: new Date()
      });
      
      console.log('✅ Token login successful for demo user, token:', token.substring(0, 8) + '...');
      console.log('✅ Active tokens count:', activeTokens.size);
      
      res.json({
        ...demoUser,
        token: token
      });
    } catch (error) {
      console.error('Token login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  // Token-based auth check endpoint
  app.get("/api/token-auth/user", (req, res) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token as string;
      
      console.log('🔍 Token auth check:', {
        hasToken: !!token,
        tokenPrefix: token?.substring(0, 8) + '...',
        activeTokensCount: activeTokens.size
      });
      
      if (token && activeTokens.has(token)) {
        const tokenData = activeTokens.get(token);
        tokenData.lastUsed = new Date();
        
        console.log('✅ Token auth check successful');
        res.json(tokenData.user);
      } else {
        console.log('❌ Token auth check failed - invalid or missing token');
        res.status(401).json({ message: "Unauthorized" });
      }
    } catch (error) {
      console.error('Token auth check error:', error);
      res.status(401).json({ message: "Unauthorized" });
    }
  });

  // Token-based logout endpoint
  app.post("/api/token-logout", (req, res) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token as string;
      
      if (token && activeTokens.has(token)) {
        activeTokens.delete(token);
        console.log('✅ Token logout successful');
      }
      
      res.json({ message: 'Logged out successfully' });
    } catch (error) {
      console.error('Token logout error:', error);
      res.status(500).json({ error: 'Logout failed' });
    }
  });

  console.log('✅ Token authentication system initialized');
}

// Token-based auth middleware
export function requireTokenAuth(req: any, res: any, next: any) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token as string;
  
  console.log('🔐 Token auth middleware check:', {
    hasToken: !!token,
    tokenPrefix: token?.substring(0, 8) + '...',
    activeTokensCount: activeTokens.size,
    url: req.url
  });
  
  if (token && activeTokens.has(token)) {
    const tokenData = activeTokens.get(token);
    tokenData.lastUsed = new Date();
    req.user = tokenData.user;
    
    console.log('✅ Token auth successful for user:', req.user.id);
    next();
  } else {
    console.log('❌ Token auth failed - invalid or missing token');
    return res.status(401).json({ message: "Unauthorized" });
  }
}

// Clean up old tokens (optional)
setInterval(() => {
  const now = new Date();
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours
  
  for (const [token, data] of activeTokens.entries()) {
    if (data.lastUsed < cutoff) {
      activeTokens.delete(token);
    }
  }
}, 60 * 60 * 1000); // Clean up every hour

export { activeTokens };
