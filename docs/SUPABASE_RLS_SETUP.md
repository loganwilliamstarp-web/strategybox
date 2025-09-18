# 🔐 **Supabase Row Level Security (RLS) Setup Guide**

## ⚠️ **CRITICAL SECURITY ISSUE FIXED**

**API keys were exposed in source code and have been removed.** You need to:

1. **Immediately revoke and regenerate your API keys** at:
   - MarketData.app: https://marketdata.app/dashboard
   - Finnhub: https://finnhub.io/dashboard

2. **Store new keys securely** in environment variables or Supabase Vault

## 🛡️ **Required RLS Policies for Options Tracker**

### **1. Users Table**
```sql
-- Enable RLS on users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own data
CREATE POLICY "Users can view own data" ON users
    FOR SELECT USING (auth.uid()::text = id);

-- Policy: Users can update their own data
CREATE POLICY "Users can update own data" ON users
    FOR UPDATE USING (auth.uid()::text = id);

-- Policy: Allow user registration (insert)
CREATE POLICY "Allow user registration" ON users
    FOR INSERT WITH CHECK (true);
```

### **2. Tickers Table**
```sql
-- Enable RLS on tickers table
ALTER TABLE tickers ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own tickers
CREATE POLICY "Users can view own tickers" ON tickers
    FOR SELECT USING (auth.uid()::text = user_id);

-- Policy: Users can insert their own tickers
CREATE POLICY "Users can insert own tickers" ON tickers
    FOR INSERT WITH CHECK (auth.uid()::text = user_id);

-- Policy: Users can update their own tickers
CREATE POLICY "Users can update own tickers" ON tickers
    FOR UPDATE USING (auth.uid()::text = user_id);

-- Policy: Users can delete their own tickers
CREATE POLICY "Users can delete own tickers" ON tickers
    FOR DELETE USING (auth.uid()::text = user_id);
```

### **3. Long Strangle Positions Table**
```sql
-- Enable RLS on longStranglePositions table
ALTER TABLE "longStranglePositions" ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view positions for their own tickers
CREATE POLICY "Users can view own positions" ON "longStranglePositions"
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM tickers 
            WHERE tickers.id = "longStranglePositions".ticker_id 
            AND tickers.user_id = auth.uid()::text
        )
    );

-- Policy: Users can insert positions for their own tickers
CREATE POLICY "Users can insert own positions" ON "longStranglePositions"
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM tickers 
            WHERE tickers.id = "longStranglePositions".ticker_id 
            AND tickers.user_id = auth.uid()::text
        )
    );

-- Policy: Users can update positions for their own tickers
CREATE POLICY "Users can update own positions" ON "longStranglePositions"
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM tickers 
            WHERE tickers.id = "longStranglePositions".ticker_id 
            AND tickers.user_id = auth.uid()::text
        )
    );

-- Policy: Users can delete positions for their own tickers
CREATE POLICY "Users can delete own positions" ON "longStranglePositions"
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM tickers 
            WHERE tickers.id = "longStranglePositions".ticker_id 
            AND tickers.user_id = auth.uid()::text
        )
    );
```

### **4. Options Chains Table**
```sql
-- Enable RLS on optionsChains table
ALTER TABLE "optionsChains" ENABLE ROW LEVEL SECURITY;

-- Policy: All authenticated users can read options chains (market data is public)
CREATE POLICY "Authenticated users can view options chains" ON "optionsChains"
    FOR SELECT USING (auth.role() = 'authenticated');

-- Policy: Only system can insert options chains (server-side only)
CREATE POLICY "System can insert options chains" ON "optionsChains"
    FOR INSERT WITH CHECK (false); -- Block all inserts via RLS, only server can insert

-- Policy: Only system can update options chains
CREATE POLICY "System can update options chains" ON "optionsChains"
    FOR UPDATE USING (false);

-- Policy: Only system can delete options chains
CREATE POLICY "System can delete options chains" ON "optionsChains"
    FOR DELETE USING (false);
```

### **5. Price Alerts Table**
```sql
-- Enable RLS on priceAlerts table
ALTER TABLE "priceAlerts" ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own alerts
CREATE POLICY "Users can view own alerts" ON "priceAlerts"
    FOR SELECT USING (auth.uid()::text = user_id);

-- Policy: Users can create their own alerts
CREATE POLICY "Users can create own alerts" ON "priceAlerts"
    FOR INSERT WITH CHECK (auth.uid()::text = user_id);

-- Policy: Users can update their own alerts
CREATE POLICY "Users can update own alerts" ON "priceAlerts"
    FOR UPDATE USING (auth.uid()::text = user_id);

-- Policy: Users can delete their own alerts
CREATE POLICY "Users can delete own alerts" ON "priceAlerts"
    FOR DELETE USING (auth.uid()::text = user_id);
```

### **6. Exit Recommendations Table**
```sql
-- Enable RLS on exitRecommendations table
ALTER TABLE "exitRecommendations" ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view recommendations for their own tickers
CREATE POLICY "Users can view own recommendations" ON "exitRecommendations"
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM tickers 
            WHERE tickers.id = "exitRecommendations".ticker_id 
            AND tickers.user_id = auth.uid()::text
        )
    );

-- Policy: System can insert recommendations
CREATE POLICY "System can insert recommendations" ON "exitRecommendations"
    FOR INSERT WITH CHECK (true);

-- Policy: Users can update recommendations for their own tickers
CREATE POLICY "Users can update own recommendations" ON "exitRecommendations"
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM tickers 
            WHERE tickers.id = "exitRecommendations".ticker_id 
            AND tickers.user_id = auth.uid()::text
        )
    );

-- Policy: Users can delete recommendations for their own tickers
CREATE POLICY "Users can delete own recommendations" ON "exitRecommendations"
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM tickers 
            WHERE tickers.id = "exitRecommendations".ticker_id 
            AND tickers.user_id = auth.uid()::text
        )
    );
```

## 🔧 **How to Apply These Policies**

### **Method 1: Supabase Dashboard (Recommended)**
1. Go to your Supabase dashboard: https://supabase.com/dashboard
2. Select your Options Tracker project
3. Navigate to **Authentication** → **Policies**
4. Click **"New Policy"** for each table
5. Copy and paste each policy SQL above

### **Method 2: SQL Editor**
1. Go to **SQL Editor** in your Supabase dashboard
2. Copy and paste all the SQL policies above
3. Click **"Run"** to execute

### **Method 3: Database Migration**
Add these policies to your Drizzle migration files for version control.

## 🎯 **What These Policies Do**

### **Data Isolation:**
- **Users** can only access their own data
- **Tickers** are isolated per user
- **Positions** are accessible only through user's tickers
- **Alerts** are user-specific

### **Market Data Security:**
- **Options Chains** are readable by all authenticated users (public market data)
- **Options Chains** can only be written by the server (not through client)

### **System Operations:**
- Server can bypass RLS for system operations
- Recommendations can be created by system algorithms

## ⚠️ **Important Security Notes**

### **1. Service Role Key**
Your server needs to use the **Service Role Key** (not anon key) for:
- Writing options chain data
- System operations that bypass RLS

### **2. Authentication Required**
All policies require `auth.uid()` - users must be authenticated to access data.

### **3. API Key Security**
- **Never hardcode API keys** in source code
- Store in environment variables or Supabase Vault
- Regenerate exposed keys immediately

## 🧪 **Testing RLS Policies**

### **Test User Data Isolation:**
```sql
-- This should only return current user's data
SELECT * FROM tickers;
SELECT * FROM "longStranglePositions";
SELECT * FROM "priceAlerts";
```

### **Test Options Chain Access:**
```sql
-- This should work for all authenticated users
SELECT * FROM "optionsChains" WHERE symbol = 'AAPL';
```

## 🚨 **Next Steps After Setup**

1. **✅ Apply all RLS policies above**
2. **🔑 Regenerate exposed API keys**
3. **🔒 Store new keys in environment variables**
4. **🧪 Test user data isolation**
5. **📊 Verify options chain access**

Your Options Tracker will now have **enterprise-grade security** with proper data isolation and access controls! 🛡️
