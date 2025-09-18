// Supabase configuration for Options Tracker
import { createClient } from '@supabase/supabase-js';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from "../../shared/schema";

// Supabase configuration from environment variables (using NEXT_PUBLIC_ prefix)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://nogazoggoluvgarfvizo.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vZ2F6b2dnb2x1dmdhcmZ2aXpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxMjYyMDAsImV4cCI6MjA3MzcwMjIwMH0.ar0rWErOFGv6bvIPlniKKbcQZ6-fVv6NvbGjHkd0HxE';

// Database connection string - use DATABASE_URL (not SUPABASE_DATABASE_URL)
const databaseUrl = process.env.DATABASE_URL || 
  `postgresql://postgres.nogazoggoluvgarfvizo:aUVsD3%25%25w-8%2Atev@aws-1-us-east-2.pooler.supabase.com:6543/postgres`;

// Create Supabase client for auth and real-time features
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Create PostgreSQL connection for Drizzle ORM
let client: any;
let db: any;

try {
  console.log(`🔗 Connecting to Supabase database...`);
  console.log(`📍 Database URL: ${databaseUrl.substring(0, 50)}...`);
  
  // Use postgres-js for better Supabase compatibility
  client = postgres(databaseUrl, {
    prepare: false,
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  
  db = drizzle(client, { schema });
  
  // Test the connection asynchronously
  console.log(`🧪 Testing Supabase database connection...`);
  client`SELECT 1 as test`.then(() => {
    console.log('✅ Supabase database connection CONFIRMED and working');
  }).catch((error: any) => {
    console.error('❌ Supabase database connection test failed:', error);
  });
  
} catch (error) {
  console.error('❌ Supabase database connection failed:', error);
  console.error(`❌ Failed URL: ${databaseUrl.substring(0, 50)}...`);
  console.error('❌ This will cause fallback to mock database');
  client = null;
  db = null;
}

export { client, db };

// Supabase Vault functions for secret management
export class SupabaseVault {
  
  /**
   * Enable Supabase Vault extension
   */
  static async enableVault(): Promise<void> {
    try {
      const { error } = await supabase.rpc('exec_sql', {
        sql: 'CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;'
      });
      
      if (error) {
        console.warn('Vault extension may already be enabled:', error.message);
      } else {
        console.log('✅ Supabase Vault extension enabled');
      }
    } catch (error) {
      console.error('❌ Failed to enable Vault extension:', error);
    }
  }

  /**
   * Store a secret in Supabase Vault
   */
  static async storeSecret(secretValue: string, secretName: string, description?: string): Promise<boolean> {
    try {
      const { error } = await supabase.rpc('vault_create_secret', {
        secret: secretValue,
        name: secretName,
        description: description || `Secret: ${secretName}`
      });

      if (error) {
        console.error(`❌ Failed to store secret ${secretName}:`, error);
        return false;
      }

      console.log(`✅ Secret ${secretName} stored in Supabase Vault`);
      return true;
    } catch (error) {
      console.error(`❌ Error storing secret ${secretName}:`, error);
      return false;
    }
  }

  /**
   * Retrieve a secret from Supabase Vault
   */
  static async getSecret(secretName: string): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from('vault.decrypted_secrets')
        .select('decrypted_secret')
        .eq('name', secretName)
        .single();

      if (error || !data) {
        console.warn(`⚠️  Secret ${secretName} not found in Vault, using environment variable`);
        return process.env[secretName] || null;
      }

      console.log(`✅ Retrieved secret ${secretName} from Supabase Vault`);
      return data.decrypted_secret;
    } catch (error) {
      console.warn(`⚠️  Error retrieving secret ${secretName}, using environment variable:`, error);
      return process.env[secretName] || null;
    }
  }

  /**
   * Initialize secrets in Vault (run once)
   */
  static async initializeSecrets(): Promise<void> {
    try {
      console.log('🔐 Initializing Supabase Vault secrets...');
      
      // Enable Vault extension
      await this.enableVault();

      // Store MarketData API key
      const marketDataKey = process.env.MARKETDATA_API_KEY;
      if (marketDataKey && marketDataKey !== 'demo-key') {
        await this.storeSecret(marketDataKey, 'MARKETDATA_API_KEY', 'MarketData.app API key for real-time market data');
      }

      // Store session secret
      const sessionSecret = process.env.SESSION_SECRET;
      if (sessionSecret && sessionSecret !== 'development-secret-key-change-in-production') {
        await this.storeSecret(sessionSecret, 'SESSION_SECRET', 'Session secret for user authentication');
      }

      console.log('✅ Supabase Vault secrets initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Supabase Vault:', error);
    }
  }

  /**
   * Get all secrets for application startup
   */
  static async getAllSecrets(): Promise<Record<string, string>> {
    try {
      const secrets: Record<string, string> = {};

      // Get MarketData API key
      const marketDataKey = await this.getSecret('MARKETDATA_API_KEY');
      if (marketDataKey) secrets.MARKETDATA_API_KEY = marketDataKey;

      // Get session secret
      const sessionSecret = await this.getSecret('SESSION_SECRET');
      if (sessionSecret) secrets.SESSION_SECRET = sessionSecret;

      console.log(`✅ Retrieved ${Object.keys(secrets).length} secrets from Supabase Vault`);
      return secrets;
    } catch (error) {
      console.error('❌ Failed to retrieve secrets from Vault:', error);
      return {};
    }
  }
}

// Health check for Supabase connection
export async function checkSupabaseHealth(): Promise<{ status: string; details: any }> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('count')
      .limit(1);

    if (error) {
      return {
        status: 'unhealthy',
        details: { error: error.message }
      };
    }

    return {
      status: 'healthy',
      details: { 
        connection: 'active',
        url: supabaseUrl,
        tables_accessible: true
      }
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      details: { error: error instanceof Error ? error.message : 'Unknown error' }
    };
  }
}
