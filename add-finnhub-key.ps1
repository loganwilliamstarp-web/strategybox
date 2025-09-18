# Add Finnhub API Key to Supabase Vault
param(
    [Parameter(Mandatory=$true)]
    [string]$ApiKey
)

Write-Host "🔐 Adding Finnhub API Key to Supabase Vault..."

# Supabase configuration
$supabaseUrl = "https://nogazoggoluvgarfvizo.supabase.co"
$supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vZ2F6b2dnb2x1dmdhcmZ2aXpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxMjYyMDAsImV4cCI6MjA3MzcwMjIwMH0.ar0rWErOFGv6bvIPlniKKbcQZ6-fVv6NvbGjHkd0HxE"

# Create the secret payload
$secretPayload = @{
    name = "FINNHUB_API_KEY"
    secret = $ApiKey
    description = "Finnhub API key for additional market data"
} | ConvertTo-Json

# Headers for Supabase API
$headers = @{
    "apikey" = $supabaseKey
    "Authorization" = "Bearer $supabaseKey"
    "Content-Type" = "application/json"
}

try {
    # Try to call vault_create_secret function
    $vaultUrl = "$supabaseUrl/rest/v1/rpc/vault_create_secret"
    $result = Invoke-RestMethod -Uri $vaultUrl -Method POST -Body $secretPayload -Headers $headers
    
    Write-Host "✅ SUCCESS! Finnhub API key added to Supabase Vault"
    Write-Host " Key: FINNHUB_API_KEY"
    Write-Host " Description: Finnhub API key for additional market data"
    
} catch {
    Write-Host " Failed to add to Vault: $($_.Exception.Message)"
    Write-Host ""
    Write-Host " ALTERNATIVE: Set as environment variable:"
    Write-Host "   `$env:FINNHUB_API_KEY = '$ApiKey'"
}
