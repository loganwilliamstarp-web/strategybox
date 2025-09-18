import { beforeAll, afterAll } from 'vitest';

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/options_tracker_test';
process.env.SESSION_SECRET = 'test-secret-key';
process.env.MARKETDATA_API_KEY = 'test-api-key';

// Global test setup
beforeAll(async () => {
  console.log('🧪 Setting up test environment...');
});

afterAll(async () => {
  console.log('🧪 Cleaning up test environment...');
});
