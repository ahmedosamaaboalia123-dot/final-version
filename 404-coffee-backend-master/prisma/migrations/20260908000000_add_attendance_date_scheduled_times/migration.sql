-- AlterTable: Add attendanceDate, scheduledStart, scheduledEnd to Attendance
ALTER TABLE "attendance" ADD COLUMN "attendanceDate" TEXT NOT NULL DEFAULT '';
ALTER TABLE "attendance" ADD COLUMN "scheduledStart" TEXT;
ALTER TABLE "attendance" ADD COLUMN "scheduledEnd" TEXT;

-- Backfill attendanceDate from existing checkInAt (Cairo timezone)
UPDATE "attendance" SET "attendanceDate" = TO_CHAR("checkInAt" AT TIME ZONE 'Africa/Cairo', 'YYYY-MM-DD');

-- Remove the default now that all rows are populated
ALTER TABLE "attendance" ALTER COLUMN "attendanceDate" DROP DEFAULT;

-- CreateIndex: Unique constraint on (userId, attendanceDate)
CREATE UNIQUE INDEX "attendance_userId_attendanceDate_key" ON "attendance"("userId", "attendanceDate");
