import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";
import connectPg from "connect-pg-simple";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function setupAuth(app: Express) {
  // Session configuration - ALWAYS use memory store for stability
  console.log('🔧 Using in-memory session store for maximum stability');
  const sessionStore = undefined; // Force memory store to avoid database session issues

  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || "default-secret-key",
    resave: true, // Force session save on every request
    saveUninitialized: true, // Save uninitialized sessions
    store: sessionStore, // undefined = memory store
    cookie: {
      httpOnly: false, // Allow JavaScript access for debugging
      secure: false, // Always false for development to avoid HTTPS issues
      maxAge: 24 * 60 * 60 * 1000, // 24 hours for stability
      sameSite: 'lax', // Add sameSite for better compatibility
    },
    rolling: true, // Extend session on each request
    name: 'options-tracker-session', // Explicit session name
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  // Local strategy for email/password authentication
  passport.use(
    new LocalStrategy(
      {
        usernameField: "email",
        passwordField: "password",
      },
      async (email, password, done) => {
        try {
          const user = await storage.getUserByEmail(email);
          if (!user || !(await comparePasswords(password, user.password))) {
            return done(null, false);
          }
          return done(null, user);
        } catch (error) {
          return done(error);
        }
      }
    )
  );

  passport.serializeUser((user, done) => done(null, user.id));
  
  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      if (user) {
        done(null, user);
      } else {
        // If user not found, clear the session
        done(null, false);
      }
    } catch (error) {
      console.warn('Session deserialization error, clearing session:', error);
      // Don't pass the error, just clear the session
      done(null, false);
    }
  });

  // Registration endpoint
  app.post("/api/register", async (req, res, next) => {
    try {
      const { email, password, firstName, lastName } = req.body;

      // Validate input
      if (!email || !password || !firstName || !lastName) {
        return res.status(400).json({ message: "All fields are required" });
      }

      if (password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters long" });
      }

      // Check if user already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "Email already registered" });
      }

      // Create new user
      const hashedPassword = await hashPassword(password);
      const user = await storage.createUser({
        email,
        password: hashedPassword,
        firstName,
        lastName,
      });

      // Log in the user automatically after registration
      req.login(user, (err) => {
        if (err) return next(err);
        res.status(201).json({
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        });
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  // Login endpoint
  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: SelectUser, info: any) => {
      if (err) {
        return res.status(500).json({ message: "Authentication error" });
      }
      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      req.login(user, (err) => {
        if (err) {
          return res.status(500).json({ message: "Login failed" });
        }
        res.json({
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        });
      });
    })(req, res, next);
  });

  // Logout endpoint (POST)
  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  // Logout endpoint (GET) - for direct navigation
  app.get("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      // Clear session and redirect to home
      req.session.destroy((destroyErr) => {
        if (destroyErr) {
          console.error('Session destruction error:', destroyErr);
        }
        // Clear session cookie
        res.clearCookie('connect.sid');
        // Redirect to home page
        res.redirect('/');
      });
    });
  });

  // Get current user endpoint
  app.get("/api/auth/user", (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    const user = req.user as SelectUser;
    res.json({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  });

  // Demo authentication for testing real-time updates
  app.post("/api/demo-auth", async (req, res) => {
    try {
      // Create a demo user for immediate testing
      const demoUser = {
        id: 'demo-user-12345',
        email: 'demo@options.com',
        firstName: 'Demo',
        lastName: 'User',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Manually create session
      req.login(demoUser, (err) => {
        if (err) {
          console.error('Demo auth error:', err);
          return res.status(500).json({ error: 'Demo auth failed' });
        }
        console.log('✅ Demo user authenticated for real-time testing');
        res.json(demoUser);
      });
    } catch (error) {
      console.error('Demo auth error:', error);
      res.status(500).json({ error: 'Demo auth failed' });
    }
  });
}

// Middleware to protect routes
export function requireAuth(req: any, res: any, next: any) {
  // Check both Passport auth and simple session auth
  const session = req.session as any;
  const isPassportAuth = req.isAuthenticated();
  const isSimpleAuth = session?.userId && session?.user;
  
  console.log('🔐 Auth check:', {
    hasSession: !!req.session,
    sessionId: req.sessionID,
    userId: session?.userId,
    hasUser: !!session?.user,
    isPassportAuth,
    isSimpleAuth,
    hasReqUser: !!req.user,
    cookies: req.headers.cookie,
    sessionKeys: Object.keys(session || {})
  });
  
  if (isPassportAuth || isSimpleAuth) {
    // Set req.user for compatibility
    if (isSimpleAuth && !req.user) {
      req.user = session.user;
    }
    console.log('✅ Auth successful for user:', req.user?.id || req.user?.email);
    next();
  } else {
    console.log('❌ Auth failed - no valid session or passport auth');
    return res.status(401).json({ message: "Unauthorized" });
  }
}