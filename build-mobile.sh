#!/bin/bash
# Build and sync mobile app
echo "Building app..."
npm run build
echo "Copying web assets..."
cp -r dist/public/* dist/
echo "Syncing to mobile platforms..."
npx cap sync
echo "Mobile app ready! You can now:"
echo "- Open Android Studio: npx cap open android"
echo "- Open Xcode: npx cap open ios"
echo "- Build for production deployment"
