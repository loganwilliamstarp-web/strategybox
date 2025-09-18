# PowerShell script to install Java 17 for Options Tracker mobile app
# Run this script as Administrator

Write-Host "🚀 Installing Java 17 for Options Tracker Mobile App..." -ForegroundColor Green

# Check if Chocolatey is installed (Windows package manager)
if (Get-Command choco -ErrorAction SilentlyContinue) {
    Write-Host "📦 Using Chocolatey to install Java 17..." -ForegroundColor Yellow
    
    # Install OpenJDK 17 via Chocolatey
    choco install openjdk17 -y
    
    Write-Host "✅ Java 17 installed via Chocolatey!" -ForegroundColor Green
} else {
    Write-Host "⚠️ Chocolatey not found. Please install Java 17 manually:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "1. Download Java 17 from:" -ForegroundColor Cyan
    Write-Host "   https://download.oracle.com/java/17/latest/jdk-17_windows-x64_bin.exe" -ForegroundColor Blue
    Write-Host ""
    Write-Host "2. Run the installer with default settings" -ForegroundColor Cyan
    Write-Host "3. Restart PowerShell and run: java -version" -ForegroundColor Cyan
    Write-Host ""
    
    # Try to open the download page
    try {
        Start-Process "https://download.oracle.com/java/17/latest/jdk-17_windows-x64_bin.exe"
        Write-Host "🌐 Opening download page in your browser..." -ForegroundColor Green
    } catch {
        Write-Host "❌ Could not open browser. Please manually visit the download link above." -ForegroundColor Red
    }
}

# Check current Java version
Write-Host ""
Write-Host "🔍 Checking current Java version..." -ForegroundColor Yellow

try {
    $javaVersion = java -version 2>&1
    Write-Host "Current Java version:" -ForegroundColor Cyan
    Write-Host $javaVersion -ForegroundColor White
} catch {
    Write-Host "❌ Java not found in PATH. Installation may be needed." -ForegroundColor Red
}

Write-Host ""
Write-Host "📱 After Java 17 is installed, run your mobile app with:" -ForegroundColor Green
Write-Host "   npx cap run android" -ForegroundColor Cyan
Write-Host ""
Write-Host "🎯 Your Options Tracker mobile app is ready to launch!" -ForegroundColor Green
