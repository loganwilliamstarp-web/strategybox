// Supabase-only authentication system
import { Express } from "express";
import { supabase } from "./config/supabase";
import { storage } from "./storage";

export function setupSupabaseAuth(app: Express) {
  console.log('🔧 Setting up Supabase-only authentication');

  // Middleware to verify Supabase JWT tokens
  app.use(async (req, res, next) => {
    try {
      // Debug POST requests specifically
      if (req.method === 'POST' && req.path === '/api/tickers') {
        console.log(`🚨 AUTH MIDDLEWARE: POST /api/tickers hit! Headers:`, req.headers.authorization ? 'Bearer token present' : 'No auth header');
        console.log(`🚨 AUTH MIDDLEWARE: Request body:`, req.body);
      }
      
      // Get the Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        if (req.method === 'POST' && req.path === '/api/tickers') {
          console.log(`❌ AUTH MIDDLEWARE: No auth header for POST /api/tickers`);
        }
        return next(); // No auth header, continue without user
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix
      
      // Verify the JWT token with Supabase
      const { data: { user }, error } = await supabase.auth.getUser(token);
      
      if (error || !user) {
        console.log(`❌ Supabase auth failed: ${error?.message || 'No user'}`);
        return next(); // Invalid token, continue without user
      }

      // Set user on request object
      req.user = {
        id: user.id,
        email: user.email || '',
        firstName: user.user_metadata?.first_name || '',
        lastName: user.user_metadata?.last_name || '',
        createdAt: new Date(user.created_at),
        updatedAt: new Date(user.updated_at || user.created_at)
      };

      // Ensure user record exists in local database for foreign key constraints
      try {
        await storage.createOrUpdateUser({
          id: user.id,
          email: user.email || '',
          firstName: user.user_metadata?.first_name || '',
          lastName: user.user_metadata?.last_name || '',
        });
      } catch (dbError) {
        console.warn(`⚠️ Failed to ensure local user record: ${dbError}`);
      }

      console.log(`✅ Supabase auth successful: ${req.user.email} (ID: ${req.user.id})`);
      next();
    } catch (error) {
      console.error('❌ Supabase auth middleware error:', error);
      next(); // Continue without user on error
    }
  });

  // Login endpoint - validates credentials against Supabase
  app.post("/api/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      console.log(`🔍 Attempting Supabase login for email: ${email}`);
      
      // Sign in with Supabase
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error || !data.user) {
        console.log(`❌ Supabase login failed: ${error?.message || 'No user data'}`);
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const user = data.user;
      console.log(`✅ Supabase login successful: ${user.email} (ID: ${user.id})`);

      // Ensure local user exists (idempotent)
      try {
        await storage.createOrUpdateUser({
          id: user.id,
          email: user.email || '',
          firstName: user.user_metadata?.first_name || '',
          lastName: user.user_metadata?.last_name || '',
        });
      } catch (localError) {
        console.warn(`⚠️ Failed to upsert local user during login:`, localError);
      }

      res.json({
        id: user.id,
        email: user.email || '',
        firstName: user.user_metadata?.first_name || '',
        lastName: user.user_metadata?.last_name || '',
        createdAt: new Date(user.created_at),
        updatedAt: new Date(user.updated_at || user.created_at),
        accessToken: data.session?.access_token,
        refreshToken: data.session?.refresh_token
      });

    } catch (error) {
      console.error("❌ Supabase login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Registration endpoint - creates user in Supabase
  app.post("/api/register", async (req, res) => {
    try {
      const { email, password, firstName, lastName } = req.body;
      
      if (!email || !password || !firstName || !lastName) {
        return res.status(400).json({ message: "All fields are required" });
      }

      console.log(`🔍 Attempting Supabase registration for email: ${email}`);
      
      // Sign up with Supabase
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: firstName,
            last_name: lastName,
          }
        }
      });

      if (error) {
        console.log(`❌ Supabase registration failed: ${error.message}`);
        return res.status(400).json({ message: error.message });
      }

      if (!data.user) {
        return res.status(400).json({ message: "Registration failed - no user created" });
      }

      const user = data.user;
      console.log(`✅ Supabase registration successful: ${user.email} (ID: ${user.id})`);

      // Create/Update user record in our database for additional data
      try {
        await storage.createOrUpdateUser({
          id: user.id,
          email: user.email || '',
          firstName,
          lastName,
        });
        console.log(`✅ User record synchronized in local database: ${user.id}`);
      } catch (dbError) {
        console.warn(`⚠️ Failed to upsert user record in local database: ${dbError}`);
        // Don't fail registration if local DB creation fails
      }

      res.status(201).json({
        id: user.id,
        email: user.email || '',
        firstName,
        lastName,
        createdAt: new Date(user.created_at),
        updatedAt: new Date(user.updated_at || user.created_at),
        message: "Registration successful. Please check your email to verify your account."
      });

    } catch (error) {
      console.error("❌ Supabase registration error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  // Logout endpoint
  app.post("/api/logout", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        await supabase.auth.signOut();
      }
      
      res.json({ message: "Logged out successfully" });
    } catch (error) {
      console.error("❌ Supabase logout error:", error);
      res.status(500).json({ message: "Logout failed" });
    }
  });

  // Get current user endpoint
  app.get("/api/auth/user", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: "No authorization token provided" });
      }

      const token = authHeader.substring(7);
      
      // Verify the JWT token with Supabase
      const { data: { user }, error } = await supabase.auth.getUser(token);
      
      if (error || !user) {
        console.log(`❌ Supabase auth check failed: ${error?.message || 'No user'}`);
        return res.status(401).json({ message: "Invalid or expired token" });
      }

      res.json({
        id: user.id,
        email: user.email || '',
        firstName: user.user_metadata?.first_name || '',
        lastName: user.user_metadata?.last_name || '',
        createdAt: new Date(user.created_at),
        updatedAt: new Date(user.updated_at || user.created_at)
      });

    } catch (error) {
      console.error("❌ Supabase auth check error:", error);
      res.status(401).json({ message: "Authentication failed" });
    }
  });

  console.log('✅ Supabase authentication setup complete');
}

// Middleware to require authentication
export function requireSupabaseAuth(req: any, res: any, next: any) {
  if (!req.user) {
    console.log('❌ Supabase auth required but no user found');
    return res.status(401).json({ message: "Authentication required" });
  }
  next();
}
