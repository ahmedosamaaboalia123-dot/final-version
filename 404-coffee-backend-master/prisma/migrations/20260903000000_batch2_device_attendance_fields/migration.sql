-- AlterTable: EmployeeDevice - add audit fields (idempotent)
DO $$ BEGIN
  ALTER TABLE "employee_devices" ADD COLUMN "approvedByUserId" INTEGER;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "employee_devices" ADD COLUMN "approvedAt" TIMESTAMP(3);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "employee_devices" ADD COLUMN "rejectedAt" TIMESTAMP(3);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- AlterTable: Attendance - add device fingerprint (idempotent)
DO $$ BEGIN
  ALTER TABLE "attendance" ADD COLUMN "deviceFingerprint" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- AddForeignKey for approvedByUserId
ALTER TABLE "employee_devices" DROP CONSTRAINT IF EXISTS "employee_devices_approvedByUserId_fkey";
ALTER TABLE "employee_devices" ADD CONSTRAINT "employee_devices_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
