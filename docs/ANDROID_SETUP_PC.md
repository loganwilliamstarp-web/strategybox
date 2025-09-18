# Running Android App on PC - Complete Setup Guide

## Prerequisites

### 1. Install Android Studio
1. Download Android Studio from: https://developer.android.com/studio
2. Run the installer and follow setup wizard
3. Accept all license agreements
4. Install Android SDK, Android SDK Platform-Tools, and Android Virtual Device

### 2. Install Java Development Kit (JDK)
- Android Studio usually includes JDK, but if needed:
- Download JDK 17 from: https://adoptium.net/
- Add JAVA_HOME to environment variables

## Detailed Setup Steps

### Step 1: Download and Install Android Studio
1. **Download Android Studio**
   - Go to https://developer.android.com/studio
   - Click "Download Android Studio"
   - Save the installer file (android-studio-2023.x.x.xx-windows.exe)

2. **Install Android Studio**
   - Run the downloaded installer as Administrator
   - Choose "Standard" installation type
   - Accept all license agreements
   - Wait for download to complete (this may take 15-30 minutes)
   - Click "Finish" when installation completes

3. **Initial Setup Wizard**
   - Launch Android Studio
   - Choose "Do not import settings" (for first-time users)
   - Select "Standard" setup type
   - Choose your UI theme (Light or Dark)
   - Verify Android SDK location: `C:\Users\[YourName]\AppData\Local\Android\Sdk`
   - Click "Next" through all steps
   - Wait for component downloads to finish

### Step 2: Configure Environment Variables (Windows)
1. **Open Environment Variables**
   - Press `Win + R`, type `sysdm.cpl`, press Enter
   - Click "Environment Variables" button
   - Or: Right-click "This PC" → Properties → Advanced system settings → Environment Variables

2. **Add ANDROID_HOME**
   - Under "User variables", click "New"
   - Variable name: `ANDROID_HOME`
   - Variable value: `C:\Users\[YourName]\AppData\Local\Android\Sdk`
   - Click "OK"

3. **Update PATH Variable**
   - Find "Path" in User variables, click "Edit"
   - Click "New" and add: `%ANDROID_HOME%\platform-tools`
   - Click "New" and add: `%ANDROID_HOME%\tools`
   - Click "New" and add: `%ANDROID_HOME%\tools\bin`
   - Click "OK" on all windows

4. **Verify Installation**
   - Open Command Prompt (Win + R, type `cmd`)
   - Type: `adb version` (should show ADB version)
   - Type: `java -version` (should show Java version)

### Step 3: Create Android Virtual Device (Emulator)
1. **Open AVD Manager**
   - In Android Studio, click "More Actions" → "Virtual Device Manager"
   - Or: Tools → AVD Manager

2. **Create New Virtual Device**
   - Click "Create Device" button
   - **Choose Device**: Select "Phone" category → "Pixel 7" or "Pixel 6"
   - Click "Next"

3. **Select System Image**
   - Choose "Tiramisu" (API level 33) or "UpsideDownCake" (API level 34)
   - If not downloaded, click "Download" next to the system image
   - Wait for download to complete
   - Click "Next"

4. **Configure AVD**
   - AVD Name: "Pixel_7_API_33"
   - Startup orientation: Portrait
   - Click "Advanced Settings" for more options:
     - RAM: 4096 MB (minimum)
     - Internal Storage: 8192 MB
     - SD Card: 1024 MB
   - Click "Finish"

### Step 4: Test Emulator
1. **Start Emulator**
   - In AVD Manager, click ▶️ next to your device
   - Wait for emulator to boot (first time may take 5-10 minutes)
   - You should see Android home screen

2. **Verify Emulator**
   - Open Command Prompt
   - Type: `adb devices`
   - Should show: `emulator-5554    device`

### 3. Enable Developer Options (for physical device - optional)
If using real Android phone:
1. Go to Settings → About phone
2. Tap "Build number" 7 times
3. Go back to Settings → Developer options
4. Enable "USB debugging"

## Running Your Options Trading App

### Method 1: Using Capacitor (Recommended)

1. **Open Terminal in Replit**
   - In your Replit project, click the Shell tab
   - Or press `Ctrl + Shift + S`

2. **Build and Open Android Project**
   ```bash
   # Build the web app first
   npm run build
   
   # Sync with Capacitor
   npx cap sync
   
   # Open in Android Studio
   npx cap open android
   ```

3. **In Android Studio**
   - Wait for "Gradle sync" to complete (status bar at bottom)
   - This may take 5-10 minutes on first run
   - Look for "BUILD SUCCESSFUL" in the Build output

4. **Run the App**
   - Make sure your emulator is running (green dot in AVD Manager)
   - In Android Studio toolbar, click the green "Run" button (▶️)
   - Or press `Shift + F10`
   - Select your emulator device from the dropdown
   - Wait for app to install and launch

### Method 2: Manual APK Build and Install

1. **Build APK**
   ```bash
   # Navigate to android directory
   cd android
   
   # Build debug APK
   ./gradlew assembleDebug
   ```

2. **Install APK**
   ```bash
   # Install on emulator/device
   adb install app/build/outputs/apk/debug/app-debug.apk
   
   # Launch the app
   adb shell am start -n com.optionstrader.dashboard/.MainActivity
   ```

### Method 3: Direct Device Testing (If you have Android phone)

1. **Enable Developer Mode on Phone**
   - Go to Settings → About phone
   - Tap "Build number" 7 times rapidly
   - Go back to Settings → Developer options
   - Enable "USB debugging"
   - Enable "Install via USB"

2. **Connect Phone**
   - Connect phone to PC via USB cable
   - Allow USB debugging when prompted
   - Verify connection: `adb devices`

3. **Run App**
   - In Android Studio, select your phone from device dropdown
   - Click Run button
   - App installs directly on your phone

### Method 3: Build and Install APK
```bash
# Build the APK file
cd android
./gradlew assembleDebug

# Install on connected device/emulator
adb install app/build/outputs/apk/debug/app-debug.apk
```

## Testing Your App Features

Once running, verify these work:
- [ ] Live stock prices load (AAPL, NVDA, TSLA, SPY, QQQ)
- [ ] Real-time price updates via WebSocket
- [ ] Realistic strike calculations (160/200 for NVDA, not 169/187)
- [ ] Max loss calculations show put + call premiums
- [ ] Mobile navigation works smoothly
- [ ] Haptic feedback on button presses

## Troubleshooting Common Issues

### Issue 1: "Android SDK not found"
**Solution:**
1. Open Android Studio → File → Settings
2. Navigate to Appearance & Behavior → System Settings → Android SDK
3. Note the SDK path (usually `C:\Users\[YourName]\AppData\Local\Android\Sdk`)
4. Update environment variables with correct path
5. Restart Command Prompt and try again

### Issue 2: "Device not found" or "No devices connected"
**Solution:**
1. **For Emulator:**
   ```bash
   # List available AVDs
   emulator -list-avds
   
   # Start emulator manually
   emulator -avd Pixel_7_API_33
   
   # Check if device is detected
   adb devices
   ```

2. **For Physical Device:**
   - Enable Developer Options and USB Debugging
   - Try different USB cable
   - Install device drivers if needed
   - Check `adb devices` command

### Issue 3: "Gradle build failed"
**Solution:**
1. **Clean and rebuild:**
   ```bash
   cd android
   ./gradlew clean
   ./gradlew build
   ```

2. **Check Java version:**
   ```bash
   java -version
   # Should show Java 17 or later
   ```

3. **Update Gradle wrapper:**
   ```bash
   cd android
   ./gradlew wrapper --gradle-version=8.0
   ```

### Issue 4: "App crashes on startup"
**Solution:**
1. **Check Android Studio Logcat:**
   - In Android Studio: View → Tool Windows → Logcat
   - Look for red error messages
   - Filter by your package name: `com.optionstrader.dashboard`

2. **Common fixes:**
   ```bash
   # Clear app data
   adb shell pm clear com.optionstrader.dashboard
   
   # Restart ADB server
   adb kill-server
   adb start-server
   ```

### Issue 5: "npx cap open android fails"
**Solution:**
1. **Install Capacitor CLI globally:**
   ```bash
   npm install -g @capacitor/cli
   ```

2. **Rebuild and sync:**
   ```bash
   npm run build
   npx cap copy
   npx cap sync
   ```

### Issue 6: Emulator is slow or freezing
**Solution:**
1. **Increase emulator resources:**
   - In AVD Manager, click pencil icon to edit
   - Advanced Settings → RAM: 4096 MB or higher
   - Graphics: Hardware - GLES 2.0

2. **Enable hardware acceleration:**
   - Windows: Install Intel HAXM or AMD-V
   - BIOS: Enable virtualization (VT-x/AMD-V)

### Issue 7: "Command 'adb' not found"
**Solution:**
1. **Add to PATH manually:**
   ```bash
   # Windows (in Command Prompt)
   set PATH=%PATH%;C:\Users\[YourName]\AppData\Local\Android\Sdk\platform-tools
   
   # Or restart computer after setting environment variables
   ```

2. **Verify installation:**
   ```bash
   where adb
   adb version
   ```

## Live Data Features in Mobile App

Your Android app includes:
- **Live Finnhub Stock Data**: Real-time prices for all tickers
- **WebSocket Streaming**: Price updates every 2 minutes  
- **Authentic Strike Calculations**: ±20 with $5 increments
- **Real Market Logic**: Accurate max loss and breakeven calculations
- **Native Performance**: Smooth scrolling and interactions

## Performance Tips

- Use x86_64 emulator image for faster performance on Intel/AMD PCs
- Allocate at least 4GB RAM to Android emulator
- Enable hardware acceleration in emulator settings
- Close other programs while running emulator for best performance

## Complete Testing Checklist

When your app launches, verify these features work:

### Core Functionality
- [ ] App starts without crashing
- [ ] Login screen appears (if authentication enabled)
- [ ] Dashboard loads with 5 tickers (AAPL, NVDA, TSLA, SPY, QQQ)

### Live Data Features
- [ ] Stock prices show current values (not placeholder data)
- [ ] WebSocket connection establishes (check for real-time updates)
- [ ] Price changes reflect in the UI every 2 minutes
- [ ] Strike prices show realistic values:
  - AAPL: 210/250 (not 208/248)
  - NVDA: 160/200 (not 158/198)
  - TSLA: 320/360 (not 318/358)

### Options Trading Calculations
- [ ] Max Loss = Put Premium + Call Premium
- [ ] Breakevens calculate correctly
- [ ] P&L curves display properly
- [ ] Position values update with live prices

### Mobile-Specific Features
- [ ] Touch navigation works smoothly
- [ ] Haptic feedback on button presses
- [ ] Screen orientation changes properly
- [ ] App performance is smooth (no lag)
- [ ] Native Android UI elements display correctly

### Debugging Commands
If issues occur, use these commands:

```bash
# View app logs
adb logcat | grep -i "optionstrader"

# Check app info
adb shell dumpsys package com.optionstrader.dashboard

# Force stop and restart
adb shell am force-stop com.optionstrader.dashboard
adb shell am start -n com.optionstrader.dashboard/.MainActivity

# Check device storage
adb shell df /data

# Monitor memory usage
adb shell top | grep optionstrader
```

## Success! 
Your professional options trading dashboard is now running natively on Android with live market data, authentic strike calculations, and real-time WebSocket updates! 🚀

**Next Steps:**
1. Test thoroughly on emulator
2. Test on physical Android device
3. Consider publishing to Google Play Store
4. Monitor user feedback and performance