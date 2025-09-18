# PowerShell script to set up Git repository for StrategyBox

# Add Git to PATH if it exists
$gitPaths = @(
    "C:\Program Files\Git\bin",
    "C:\Program Files (x86)\Git\bin", 
    "$env:USERPROFILE\AppData\Local\Programs\Git\bin"
)

foreach ($path in $gitPaths) {
    if (Test-Path $path) {
        $env:PATH += ";$path"
        Write-Host "✅ Added Git to PATH: $path"
        break
    }
}

# Test if Git is now available
try {
    $gitVersion = & git --version
    Write-Host "✅ Git is available: $gitVersion"
    
    # Initialize repository
    Write-Host "🔧 Initializing Git repository..."
    & git init
    
    # Add all files
    Write-Host "📁 Adding files to Git..."
    & git add .
    
    # Create initial commit
    Write-Host "💾 Creating initial commit..."
    & git commit -m "Initial commit: StrategyBox - Professional Options Trading Platform

- 5 options strategies with accurate calculations
- Real-time WebSocket data streaming  
- Enterprise security with Supabase Vault
- Mobile-optimized with Capacitor
- 90% API cost optimization
- Comprehensive documentation"

    # Set main branch
    Write-Host "🌿 Setting main branch..."
    & git branch -M main
    
    # Add remote
    Write-Host "🔗 Adding GitHub remote..."
    & git remote add origin https://github.com/loganwilliamstarp-web/strategybox.git
    
    # Push to GitHub
    Write-Host "🚀 Pushing to GitHub..."
    & git push -u origin main
    
    Write-Host "🎉 StrategyBox successfully pushed to GitHub!"
    Write-Host "🌐 Repository: https://github.com/loganwilliamstarp-web/strategybox"
    
} catch {
    Write-Host "❌ Git not found. Please install Git for Windows from: https://git-scm.com/download/win"
    Write-Host "📥 Or use GitHub Desktop: https://desktop.github.com/"
    Write-Host ""
    Write-Host "🔧 Alternative: Manual upload to GitHub"
    Write-Host "1. Go to https://github.com/loganwilliamstarp-web/strategybox"
    Write-Host "2. Click 'uploading an existing file'"
    Write-Host "3. Drag and drop your project folder"
    Write-Host "4. Commit the files"
}
