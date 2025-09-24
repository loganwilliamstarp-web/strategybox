// Supabase-only authentication system
import { Express } from "express";
import { supabase } from "./config/supabase";
import { storage } from "./storage";

async function exchangeTokenForUser(accessToken: string) {
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error) {
    throw error;
  }
  return data.user;
}

function setAuthCookies(res, session) {
  if (!session?.access_token) return;
  res.cookie('sb-access-token', session.access_token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: session.expires_in * 1000,
  });
  res.cookie('sb-refresh-token', session.refresh_token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30 * 1000,
  });
}

export function setupSupabaseAuth(app: Express) {
  console.log('🔧 Setting up Supabase-only authentication');

  app.use(async (req, res, next) => {
    try {
      const accessToken = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.['sb-access-token'];
      const refreshToken = req.cookies?.['sb-refresh-token'];

      if (!accessToken) {
        return next();
      }

      let user;
      try {
        user = await exchangeTokenForUser(accessToken);
      } catch (error) {
        if (refreshToken) {
          const { data, error: refreshError } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
          if (!refreshError && data.session) {
            setAuthCookies(res, data.session);
            user = data.session.user;
          } else {
            console.warn(`⚠️ Refresh token failed: ${refreshError?.message}`);
          }
        }
        if (!user) {
          console.warn(`⚠️ Supabase token invalid: ${error.message}`);
          return next();
        }
      }

      req.user = {
        id: user.id,
        email: user.email || '',
        firstName: user.user_metadata?.first_name || '',
        lastName: user.user_metadata?.last_name || '',
        createdAt: new Date(user.created_at),
        updatedAt: new Date(user.updated_at || user.created_at),
      };

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

      next();
    } catch (error) {
      console.error('❌ Supabase auth middleware error:', error);
      next();
    }
  });

  app.post("/api/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data.user || !data.session) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      setAuthCookies(res, data.session);

      await storage.createOrUpdateUser({
        id: data.user.id,
        email: data.user.email || '',
        firstName: data.user.user_metadata?.first_name || '',
        lastName: data.user.user_metadata?.last_name || '',
      });

      res.json({
        id: data.user.id,
        email: data.user.email || '',
        firstName: data.user.user_metadata?.first_name || '',
        lastName: data.user.user_metadata?.last_name || '',
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
      });
    } catch (error) {
      console.error("❌ Supabase login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/register", async (req, res) => {
    try {
      const { email, password, firstName, lastName } = req.body;
      if (!email || !password || !firstName || !lastName) {
        return res.status(400).json({ message: "All fields are required" });
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { first_name: firstName, last_name: lastName } },
      });

      if (error || !data.user) {
        return res.status(400).json({ message: error?.message || 'Registration failed' });
      }

      if (data.session) {
        setAuthCookies(res, data.session);
      }

      await storage.createOrUpdateUser({
        id: data.user.id,
        email: data.user.email || '',
        firstName,
        lastName,
      });

      res.status(201).json({
        id: data.user.id,
        email: data.user.email || '',
        firstName,
        lastName,
        message: "Registration successful. Please verify your email.",
      });
    } catch (error) {
      console.error("❌ Supabase registration error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post("/api/logout", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        await supabase.auth.signOut();
      }

      res.clearCookie('sb-access-token');
      res.clearCookie('sb-refresh-token');

      res.json({ message: "Logged out successfully" });
    } catch (error) {
      console.error("❌ Supabase logout error:", error);
      res.status(500).json({ message: "Logout failed" });
    }
  });

  app.get("/api/auth/user", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      res.json(req.user);
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
