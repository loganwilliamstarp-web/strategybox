# ☕ **Install Java 17 - Quick Steps**

## 🎯 **Direct Installation (Easiest)**

### **Step 1: Download Java 17**
1. **Open this link**: https://download.oracle.com/java/17/latest/jdk-17_windows-x64_bin.exe
2. **Download will start automatically** (about 150MB)

### **Step 2: Install Java 17**
1. **Run the downloaded file**: `jdk-17_windows-x64_bin.exe`
2. **Click "Next"** through the installer
3. **Use default installation path**: `C:\Program Files\Java\jdk-17`
4. **Click "Install"** and wait for completion
5. **Click "Close"** when finished

### **Step 3: Set Environment Variables**
1. **Press Windows + R** → type `sysdm.cpl` → Enter
2. **Click "Environment Variables"** button
3. **Under "System Variables"**, click **"New"**:
   - **Variable name**: `JAVA_HOME`
   - **Variable value**: `C:\Program Files\Java\jdk-17`
4. **Find "Path"** in System Variables → **"Edit"**
5. **Click "New"** → Add: `%JAVA_HOME%\bin`
6. **Click "OK"** on all dialogs

### **Step 4: Restart PowerShell**
1. **Close** current PowerShell window
2. **Open new PowerShell** as Administrator
3. **Navigate** to your project:
   ```powershell
   cd C:\Users\ISG-10\Desktop\Options-Tracker
   ```

### **Step 5: Verify Installation**
```powershell
java -version
```
**Should show**: `openjdk version "17.x.x"`

### **Step 6: Run Your Mobile App**
```powershell
npx cap run android
```

## 🚀 **Alternative: Use Chocolatey (If Available)**

**If you have Chocolatey package manager:**
```powershell
# Install Java 17 via Chocolatey
choco install openjdk17 -y

# Verify installation
java -version

# Run mobile app
npx cap run android
```

## ⚡ **Quick Test While Installing**

**While Java 17 downloads, test mobile features in browser:**

1. **Start app**:
   ```powershell
   npm run dev
   ```

2. **Open browser**: `http://localhost:5000`

3. **Enable mobile view**:
   - Press **F12**
   - Click **📱 device icon**
   - Select **iPhone 14 Pro**
   - **Refresh page**

You'll see:
- ✅ **Mobile-optimized ticker cards**
- ✅ **Touch-friendly strategy selector**
- ✅ **Responsive charts and UI**
- ✅ **All 5 strategy types working**

## 🎯 **After Java 17 Installation**

Your **native mobile app** will launch with:
- ✅ **Professional performance** with all optimizations
- ✅ **All strategy types** working natively
- ✅ **Real-time market data** updates
- ✅ **Touch-optimized interface**
- ✅ **Haptic feedback** and native features
- ✅ **Offline capability** with caching

**Download Java 17 now** and your Options Tracker mobile app will be running in minutes! 📱🚀
