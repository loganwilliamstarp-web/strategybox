/**
 * Debug utility to check what expiration dates are in the database
 */

import { db } from "../db";
import { longStranglePositions } from "@shared/schema";
import { isNotNull } from "drizzle-orm";

export async function debugExpirationDates() {
  try {
    console.log("🔍 Debug: Checking expiration dates in database...");
    
    // Get all positions that have expiration dates
    const positions = await db
      .select({
        id: longStranglePositions.id,
        expirationDate: longStranglePositions.expirationDate,
        daysToExpiry: longStranglePositions.daysToExpiry,
      })
      .from(longStranglePositions)
      .where(isNotNull(longStranglePositions.expirationDate));

    console.log(`Found ${positions.length} positions with expiration dates:`);
    
    positions.forEach((position, index) => {
      const date = new Date(position.expirationDate!);
      const dayOfWeek = date.getDay();
      const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek];
      
      console.log(`  ${index + 1}. Position ${position.id}: ${position.expirationDate} (${dayName}, ${position.daysToExpiry}d)`);
    });
    
    // Check for any Saturday dates
    const saturdayPositions = positions.filter(p => {
      const date = new Date(p.expirationDate!);
      return date.getDay() === 6; // Saturday
    });
    
    if (saturdayPositions.length > 0) {
      console.log(`⚠️ Found ${saturdayPositions.length} positions with Saturday expiration dates:`);
      saturdayPositions.forEach(pos => {
        console.log(`  - Position ${pos.id}: ${pos.expirationDate}`);
      });
    } else {
      console.log("✅ No Saturday expiration dates found - migration may have already run");
    }
    
  } catch (error) {
    console.error("❌ Error debugging expiration dates:", error);
    throw error;
  }
}
