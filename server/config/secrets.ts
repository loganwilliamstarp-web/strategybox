import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

interface AppSecrets {
  MARKETDATA_API_KEY: string;
  DATABASE_URL: string;
  SESSION_SECRET: string;
  REPL_ID?: string;
  ISSUER_URL?: string;
}

class SecretsManager {
  private client: SecretsManagerClient;
  private cachedSecrets: AppSecrets | null = null;
  private cacheExpiry: number = 0;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  constructor() {
    // Initialize AWS Secrets Manager client
    this.client = new SecretsManagerClient({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      }
    });
  }

  /**
   * Get secrets from AWS Secrets Manager with caching
   */
  async getSecrets(): Promise<AppSecrets> {
    // Return cached secrets if still valid
    if (this.cachedSecrets && Date.now() < this.cacheExpiry) {
      return this.cachedSecrets;
    }

    try {
      console.log('🔐 Fetching secrets from AWS Secrets Manager...');
      
      const command = new GetSecretValueCommand({
        SecretId: process.env.AWS_SECRET_NAME || 'options-tracker/secrets',
      });

      const response = await this.client.send(command);
      
      if (!response.SecretString) {
        throw new Error('No secret string found in AWS Secrets Manager');
      }

      const secrets = JSON.parse(response.SecretString) as AppSecrets;
      
      // Validate required secrets
      this.validateSecrets(secrets);
      
      // Cache the secrets
      this.cachedSecrets = secrets;
      this.cacheExpiry = Date.now() + this.CACHE_DURATION;
      
      console.log('✅ Successfully loaded secrets from AWS Secrets Manager');
      return secrets;
      
    } catch (error) {
      console.error('❌ Failed to fetch secrets from AWS:', error);
      
      // Fallback to environment variables for development
      if (process.env.NODE_ENV === 'development') {
        console.log('🔄 Falling back to environment variables for development');
        return this.getSecretsFromEnv();
      }
      
      throw new Error('Failed to load application secrets');
    }
  }

  /**
   * Get individual secret by key
   */
  async getSecret(key: keyof AppSecrets): Promise<string> {
    const secrets = await this.getSecrets();
    const value = secrets[key];
    
    if (!value) {
      throw new Error(`Secret ${key} not found`);
    }
    
    return value;
  }

  /**
   * Fallback to environment variables (development only)
   */
  private getSecretsFromEnv(): AppSecrets {
    return {
      MARKETDATA_API_KEY: process.env.MARKETDATA_API_KEY || '',
      DATABASE_URL: process.env.DATABASE_URL || '',
      SESSION_SECRET: process.env.SESSION_SECRET || 'dev-secret',
      REPL_ID: process.env.REPL_ID,
      ISSUER_URL: process.env.ISSUER_URL,
    };
  }

  /**
   * Validate that all required secrets are present
   */
  private validateSecrets(secrets: AppSecrets): void {
    const required: (keyof AppSecrets)[] = [
      'MARKETDATA_API_KEY',
      'DATABASE_URL', 
      'SESSION_SECRET'
    ];

    for (const key of required) {
      if (!secrets[key]) {
        throw new Error(`Required secret ${key} is missing`);
      }
    }
  }

  /**
   * Clear cached secrets (useful for testing or forced refresh)
   */
  clearCache(): void {
    this.cachedSecrets = null;
    this.cacheExpiry = 0;
  }

  /**
   * Health check for secrets availability
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.getSecrets();
      return true;
    } catch (error) {
      console.error('Secrets health check failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const secretsManager = new SecretsManager();

// Convenience function for backward compatibility
export async function getSecret(key: keyof AppSecrets): Promise<string> {
  return secretsManager.getSecret(key);
}

// Initialize secrets on startup
export async function initializeSecrets(): Promise<AppSecrets> {
  return secretsManager.getSecrets();
}
