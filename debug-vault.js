// Debug script to investigate Supabase Vault issues
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nogazoggoluvgarfvizo.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vZ2F6b2dnb2x1dmdhcmZ2aXpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxMjYyMDAsImV4cCI6MjA3MzcwMjIwMH0.ar0rWErOFGv6bvIPlniKKbcQZ6-fVv6NvbGjHkd0HxE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugVault() {
  console.log('🔍 SUPABASE VAULT DIAGNOSTIC');
  console.log('=============================\n');

  // Test 1: Check if vault schema exists
  console.log('1. Testing vault schema access...');
  try {
    const { data: schemas, error: schemaError } = await supabase
      .rpc('exec_sql', { query: "SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'vault';" });
    
    if (schemaError) {
      console.log('❌ Vault schema check failed:', schemaError.message);
    } else {
      console.log('✅ Vault schema accessible');
    }
  } catch (error) {
    console.log('❌ Cannot check vault schema:', error.message);
  }

  console.log('\n2. Testing vault.secrets table...');
  try {
    const { data: secrets, error: secretsError } = await supabase
      .from('vault.secrets')
      .select('id, name, description, created_at')
      .limit(10);
    
    if (secretsError) {
      console.log('❌ vault.secrets table error:', secretsError.message);
    } else {
      console.log('✅ vault.secrets table accessible');
      console.log(`📊 Found ${secrets?.length || 0} secrets in vault.secrets:`);
      secrets?.forEach(s => {
        console.log(`   🔑 ${s.name}: ${s.description} (created: ${s.created_at})`);
      });
    }
  } catch (error) {
    console.log('❌ vault.secrets table access failed:', error.message);
  }

  console.log('\n3. Testing vault.decrypted_secrets view...');
  try {
    const { data: decrypted, error: decryptedError } = await supabase
      .from('vault.decrypted_secrets')
      .select('name, description, created_at')
      .limit(10);
    
    if (decryptedError) {
      console.log('❌ vault.decrypted_secrets view error:', decryptedError.message);
    } else {
      console.log('✅ vault.decrypted_secrets view accessible');
      console.log(`📊 Found ${decrypted?.length || 0} secrets in decrypted view:`);
      decrypted?.forEach(s => {
        console.log(`   🔑 ${s.name}: ${s.description} (created: ${s.created_at})`);
      });
    }
  } catch (error) {
    console.log('❌ vault.decrypted_secrets view access failed:', error.message);
  }

  console.log('\n4. Testing alternative table names...');
  try {
    const { data: alt, error: altError } = await supabase
      .from('decrypted_secrets')
      .select('name, description, created_at')
      .limit(10);
    
    if (altError) {
      console.log('❌ decrypted_secrets table error:', altError.message);
    } else {
      console.log('✅ decrypted_secrets table accessible');
      console.log(`📊 Found ${alt?.length || 0} secrets in decrypted_secrets:`);
      alt?.forEach(s => {
        console.log(`   🔑 ${s.name}: ${s.description} (created: ${s.created_at})`);
      });
    }
  } catch (error) {
    console.log('❌ decrypted_secrets table access failed:', error.message);
  }

  console.log('\n5. Testing specific secret retrieval...');
  const secretsToTest = ['MARKETDATA_API_KEY', 'FINNHUB_API_KEY'];
  
  for (const secretName of secretsToTest) {
    console.log(`\n   Testing ${secretName}:`);
    
    // Method 1: vault.decrypted_secrets
    try {
      const { data: method1, error: error1 } = await supabase
        .from('vault.decrypted_secrets')
        .select('decrypted_secret')
        .eq('name', secretName)
        .maybeSingle();
      
      if (error1) {
        console.log(`   ❌ Method 1 (vault.decrypted_secrets): ${error1.message}`);
      } else if (method1?.decrypted_secret) {
        const preview = method1.decrypted_secret.substring(0, 8) + '...';
        console.log(`   ✅ Method 1: Found key (${preview})`);
      } else {
        console.log(`   ⚠️  Method 1: No data returned`);
      }
    } catch (error) {
      console.log(`   ❌ Method 1 exception: ${error.message}`);
    }

    // Method 2: decrypted_secrets
    try {
      const { data: method2, error: error2 } = await supabase
        .from('decrypted_secrets')
        .select('secret')
        .eq('name', secretName)
        .maybeSingle();
      
      if (error2) {
        console.log(`   ❌ Method 2 (decrypted_secrets): ${error2.message}`);
      } else if (method2?.secret) {
        const preview = method2.secret.substring(0, 8) + '...';
        console.log(`   ✅ Method 2: Found key (${preview})`);
      } else {
        console.log(`   ⚠️  Method 2: No data returned`);
      }
    } catch (error) {
      console.log(`   ❌ Method 2 exception: ${error.message}`);
    }
  }

  console.log('\n🎯 VAULT DIAGNOSTIC COMPLETE');
  console.log('=============================');
}

debugVault().catch(console.error);
