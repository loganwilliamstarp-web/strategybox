// Direct Supabase Vault diagnostic
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nogazoggoluvgarfvizo.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vZ2F6b2dnb2x1dmdhcmZ2aXpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxMjYyMDAsImV4cCI6MjA3MzcwMjIwMH0.ar0rWErOFGv6bvIPlniKKbcQZ6-fVv6NvbGjHkd0HxE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function runVaultDiagnostic() {
  console.log('🔍 SUPABASE VAULT DIAGNOSTIC');
  console.log('============================\n');

  // Test 1: Check vault extension
  console.log('1. Checking vault extension...');
  try {
    const { data, error } = await supabase.rpc('exec_sql', {
      query: "SELECT extname FROM pg_extension WHERE extname = 'supabase_vault';"
    });
    
    if (error) {
      console.log('❌ Vault extension check failed:', error.message);
      console.log('   This means supabase_vault extension is not enabled');
    } else {
      console.log('✅ Vault extension query successful');
      console.log('   Extension data:', data);
    }
  } catch (error) {
    console.log('❌ Cannot check vault extension:', error.message);
  }

  console.log('\n2. Checking vault.secrets table...');
  try {
    const { data, error } = await supabase
      .from('vault.secrets')
      .select('id, name, description, created_at')
      .limit(10);
    
    if (error) {
      console.log('❌ vault.secrets error:', error.message);
    } else {
      console.log(`✅ Found ${data?.length || 0} secrets in vault.secrets:`);
      data?.forEach(secret => {
        console.log(`   🔑 ${secret.name}: ${secret.description}`);
        console.log(`      Created: ${secret.created_at}`);
      });
    }
  } catch (error) {
    console.log('❌ vault.secrets access failed:', error.message);
  }

  console.log('\n3. Checking vault.decrypted_secrets view...');
  try {
    const { data, error } = await supabase
      .from('vault.decrypted_secrets')
      .select('name, description, created_at')
      .limit(10);
    
    if (error) {
      console.log('❌ vault.decrypted_secrets error:', error.message);
    } else {
      console.log(`✅ Found ${data?.length || 0} secrets in decrypted view:`);
      data?.forEach(secret => {
        console.log(`   🔑 ${secret.name}: ${secret.description}`);
        console.log(`      Created: ${secret.created_at}`);
      });
    }
  } catch (error) {
    console.log('❌ vault.decrypted_secrets access failed:', error.message);
  }

  console.log('\n4. Testing specific secret retrieval...');
  const secretsToTest = ['MARKETDATA_API_KEY', 'FINNHUB_API_KEY'];
  
  for (const secretName of secretsToTest) {
    console.log(`\n   🔍 Testing ${secretName}:`);
    
    try {
      const { data, error } = await supabase
        .from('vault.decrypted_secrets')
        .select('decrypted_secret')
        .eq('name', secretName)
        .maybeSingle();
      
      if (error) {
        console.log(`   ❌ Error: ${error.message}`);
      } else if (data?.decrypted_secret) {
        const keyLength = data.decrypted_secret.length;
        const preview = data.decrypted_secret.substring(0, 8) + '...';
        console.log(`   ✅ Found key: ${preview} (${keyLength} chars)`);
        
        // Test if it looks like a valid API key
        if (keyLength < 10) {
          console.log(`   ⚠️  WARNING: Key seems too short (${keyLength} chars)`);
        } else if (data.decrypted_secret.includes('YOUR_ACTUAL')) {
          console.log(`   ⚠️  WARNING: Key contains placeholder text`);
        } else {
          console.log(`   ✅ Key format looks valid`);
        }
      } else {
        console.log(`   ⚠️  No secret found with name: ${secretName}`);
      }
    } catch (error) {
      console.log(`   ❌ Exception: ${error.message}`);
    }
  }

  console.log('\n🎯 DIAGNOSTIC COMPLETE');
  console.log('======================');
}

runVaultDiagnostic().catch(console.error);
