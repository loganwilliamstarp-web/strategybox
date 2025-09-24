// Supabase-only authentication system
import { Express } from "express";
import { supabase } from "./config/supabase";
import { storage } from "./storage";

const ACCESS_COOKIE = 'sb-access-token';
const REFRESH_COOKIE = 'sb-refresh-token';

function setAuthCookies(res, session) {
  if (!session?.access_token) return;
  res.cookie(ACCESS_COOKIE, session.access_token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: session.expires_in * 1000,
  });
  res.cookie(REFRESH_COOKIE, session.refresh_token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 60 * 60 * 24 * 30 * 1000,
  });
}

async function getUserFromTokens(accessToken?: string, refreshToken?: string) {
  if (!accessToken) return null;

  const { data: accessData, error: accessError } = await supabase.auth.getUser(accessToken);
  if (accessData?.user) {
    return { user: accessData.user, session: null };
  }

  if (refreshToken) {
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
    if (!refreshError && refreshData?.session?.user) {
      return { user: refreshData.session.user, session: refreshData.session };
    }
  }

  return null;
}

export function setupSupabaseAuth(app: Express) {
  console.log('🔧 Setting up Supabase-only authentication');

  app.use(async (req, res, next) => {
    try {
      const accessToken = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.[ACCESS_COOKIE];
      const refreshToken = req.cookies?.[REFRESH_COOKIE];

      if (!accessToken) {
        return next();
      }

      const result = await getUserFromTokens(accessToken, refreshToken);
      if (!result?.user) {
        return next();
      }

      if (result.session) {
        setAuthCookies(res, result.session);
      }

      req.user = {
        id: result.user.id,
        email: result.user.email || '',
        firstName: result.user.user_metadata?.first_name || '',
        lastName: result.user.user_metadata?.last_name || '',
        createdAt: new Date(result.user.created_at),
        updatedAt: new Date(result.user.updated_at || result.user.created_at),
      };

      await storage.createOrUpdateUser({
        id: result.user.id,
        email: result.user.email || '',
        firstName: result.user.user_metadata?.first_name || '',
        lastName: result.user.user_metadata?.last_name || '',
      });

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

      res.clearCookie(ACCESS_COOKIE);
      res.clearCookie(REFRESH_COOKIE);

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
