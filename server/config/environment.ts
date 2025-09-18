import { z } from 'zod';

// Environment schema validation
const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  PORT: z.string().transform(val => parseInt(val, 10)).default('5000'),
  
  // AWS Configuration
  AWS_REGION: z.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_SECRET_NAME: z.string().default('options-tracker/secrets'),
  
  // Database Configuration
  DATABASE_URL: z.string().optional(), // Will come from secrets manager in production
  
  // Replit Configuration (optional)
  REPL_ID: z.string().optional(),
  REPLIT_DOMAINS: z.string().optional(),
  ISSUER_URL: z.string().optional(),
  
  // Development overrides
  MARKETDATA_API_KEY: z.string().optional(), // Dev override
  SESSION_SECRET: z.string().optional(), // Dev override
});

export type Environment = z.infer<typeof environmentSchema>;

class EnvironmentConfig {
  private config: Environment;

  constructor() {
    try {
      this.config = environmentSchema.parse(process.env);
      console.log('✅ Environment configuration validated successfully');
    } catch (error) {
      console.error('❌ Environment validation failed:', error);
      throw new Error('Invalid environment configuration');
    }
  }

  get<K extends keyof Environment>(key: K): Environment[K] {
    return this.config[key];
  }

  isDevelopment(): boolean {
    return this.config.NODE_ENV === 'development';
  }

  isProduction(): boolean {
    return this.config.NODE_ENV === 'production';
  }

  isTest(): boolean {
    return this.config.NODE_ENV === 'test';
  }

  getPort(): number {
    return this.config.PORT;
  }

  shouldUseSecretsManager(): boolean {
    // Use AWS Secrets Manager in production or when explicitly configured
    return this.isProduction() || (
      !!this.config.AWS_ACCESS_KEY_ID && 
      !!this.config.AWS_SECRET_ACCESS_KEY
    );
  }

  /**
   * Get configuration summary for logging (without sensitive data)
   */
  getSummary(): Record<string, any> {
    return {
      NODE_ENV: this.config.NODE_ENV,
      PORT: this.config.PORT,
      AWS_REGION: this.config.AWS_REGION,
      AWS_SECRET_NAME: this.config.AWS_SECRET_NAME,
      HAS_AWS_CREDENTIALS: !!(this.config.AWS_ACCESS_KEY_ID && this.config.AWS_SECRET_ACCESS_KEY),
      HAS_DATABASE_URL: !!this.config.DATABASE_URL,
      IS_REPLIT: !!this.config.REPL_ID,
      USE_SECRETS_MANAGER: this.shouldUseSecretsManager(),
    };
  }
}

// Export singleton instance
export const env = new EnvironmentConfig();

// Export types for use in other modules
export { environmentSchema };
