// Development configuration for Options Tracker
// This file provides fallback values when environment variables are not set

export const developmentConfig = {
  // Supabase configuration with properly encoded password
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres.nogazoggoluvgarfvizo:aUVsD3%25%25w-8%2Atev@aws-1-us-east-2.pooler.supabase.com:6543/postgres',
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://nogazoggoluvgarfvizo.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vZ2F6b2dnb2x1dmdhcmZ2aXpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxMjYyMDAsImV4cCI6MjA3MzcwMjIwMH0.ar0rWErOFGv6bvIPlniKKbcQZ6-fVv6NvbGjHkd0HxE',
  
  // MarketData.app API Key - replace with your actual key from https://marketdata.app/dashboard
  MARKETDATA_API_KEY: process.env.MARKETDATA_API_KEY || 'YOUR_ACTUAL_API_KEY_HERE',
  
  // Finnhub API Key - replace with your actual key from https://finnhub.io/dashboard
  FINNHUB_API_KEY: process.env.FINNHUB_API_KEY || 'YOUR_ACTUAL_FINNHUB_KEY_HERE',
  
  // Session secret for development
  SESSION_SECRET: process.env.SESSION_SECRET || 'development-secret-key-change-in-production',
  
  // Server configuration
  PORT: process.env.PORT || '5001',
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  // Replit configuration (if using Replit)
  REPL_ID: process.env.REPL_ID || '',
  REPLIT_DOMAINS: process.env.REPLIT_DOMAINS || '',
  ISSUER_URL: process.env.ISSUER_URL || ''
};

// Set environment variables if not already set
export function initializeDevelopmentConfig() {
  Object.entries(developmentConfig).forEach(([key, value]) => {
    if (!process.env[key] && value) {
      process.env[key] = value;
      console.log(`🔧 Set ${key} from development config`);
    }
  });
}
