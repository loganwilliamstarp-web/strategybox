/**
 * Migration script to update existing positions to use correct Friday expiration dates
 * This fixes positions that were created with the old Saturday expiration logic
 */

import { db } from "../db";
import { longStranglePositions } from "@shared/schema";
import { eq, isNotNull } from "drizzle-orm";

export async function migrateExpirationDates() {
  try {
    console.log("🔄 Starting expiration date migration...");
    
    // Get all positions that have expiration dates
    const positionsToMigrate = await db
      .select()
      .from(longStranglePositions)
      .where(isNotNull(longStranglePositions.expirationDate));

    if (positionsToMigrate.length === 0) {
      console.log("✅ No positions found requiring expiration date migration.");
      return;
    }

    console.log(`Found ${positionsToMigrate.length} positions to check for expiration date migration.`);

    let migratedCount = 0;
    const now = new Date();

    for (const position of positionsToMigrate) {
      if (position.expirationDate) {
        const currentExpDate = new Date(position.expirationDate);
        const dayOfWeek = currentExpDate.getDay(); // 0=Sunday, 6=Saturday
        
        // Check if the expiration date is a Saturday (6)
        if (dayOfWeek === 6) {
          // Calculate the correct Friday date (day before Saturday)
          const correctFridayDate = new Date(currentExpDate);
          correctFridayDate.setDate(currentExpDate.getDate() - 1);
          
          // Recalculate days to expiry
          const msPerDay = 24 * 60 * 60 * 1000;
          const newDaysToExpiry = Math.max(0, Math.round((correctFridayDate.getTime() - now.getTime()) / msPerDay));
          
          // Format as YYYY-MM-DD
          const year = correctFridayDate.getFullYear();
          const month = String(correctFridayDate.getMonth() + 1).padStart(2, '0');
          const day = String(correctFridayDate.getDate()).padStart(2, '0');
          const fridayDateString = `${year}-${month}-${day}`;

          await db
            .update(longStranglePositions)
            .set({
              expirationDate: fridayDateString,
              daysToExpiry: newDaysToExpiry,
            })
            .where(eq(longStranglePositions.id, position.id));
          
          console.log(`✅ Migrated position ${position.id}: ${position.expirationDate} → ${fridayDateString} (${newDaysToExpiry}d)`);
          migratedCount++;
        } else {
          console.log(`⏭️ Position ${position.id} already has correct expiration date: ${position.expirationDate}`);
        }
      }
    }
    
    console.log(`✅ Expiration date migration completed. Updated ${migratedCount} positions.`);
  } catch (error) {
    console.error("❌ Error during expiration date migration:", error);
    throw error;
  }
}
