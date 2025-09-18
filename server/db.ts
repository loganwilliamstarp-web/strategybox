// Import Supabase configuration instead of Neon
import { db, client } from './config/supabase';

// Re-export for compatibility
export { db, client as pool };