/**
 * Migration script to populate expected move data for existing positions
 * This should be run once to update existing positions that don't have expected move data
 */

import { db } from "../db";
import { longStranglePositions } from "@shared/schema";
import { calculateExpectedMove } from "./expectedMove";
import { isNull, isNotNull, eq } from "drizzle-orm";

export async function migrateExpectedMoveData() {
  try {
    console.log("🔄 Starting expected move data migration...");
    
    if (!db) {
      console.warn("Database not available, skipping migration");
      return;
    }

    // Find positions that don't have expected move data
    const positionsNeedingUpdate = await db
      .select()
      .from(longStranglePositions)
      .where(isNull(longStranglePositions.expectedMoveWeeklyLow));

    console.log(`📊 Found ${positionsNeedingUpdate.length} positions needing expected move data`);

    if (positionsNeedingUpdate.length === 0) {
      console.log("✅ All positions already have expected move data");
      return;
    }

    // Update each position with calculated expected move data
    for (const position of positionsNeedingUpdate) {
      try {
        const expectedMove = calculateExpectedMove(
          position.atmValue,
          position.impliedVolatility,
          position.daysToExpiry
        );

        await db
          .update(longStranglePositions)
          .set({
            expectedMoveWeeklyLow: expectedMove.weeklyLow,
            expectedMoveWeeklyHigh: expectedMove.weeklyHigh,
            expectedMoveDailyMove: expectedMove.dailyMove,
            expectedMoveWeeklyMove: expectedMove.weeklyMove,
            expectedMoveMovePercentage: expectedMove.movePercentage,
          })
          .where(eq(longStranglePositions.id, position.id));

        console.log(`✅ Updated expected move for position ${position.id}`);
      } catch (error) {
        console.error(`❌ Failed to update position ${position.id}:`, error);
      }
    }

    console.log("🎉 Expected move data migration completed!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
  }
}
