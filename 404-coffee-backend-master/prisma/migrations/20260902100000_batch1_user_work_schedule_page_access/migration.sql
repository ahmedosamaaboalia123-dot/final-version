-- AlterTable: Add work schedule fields to users (idempotent)
DO $$ BEGIN
  ALTER TABLE "users" ADD COLUMN "jobTitle" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "users" ADD COLUMN "workStartTime" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "users" ADD COLUMN "workEndTime" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- CreateTable: UserPageAccess (idempotent)
CREATE TABLE IF NOT EXISTS "user_page_access" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "pages" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_page_access_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_page_access_userId_key" ON "user_page_access"("userId");

-- AddForeignKey
ALTER TABLE "user_page_access" DROP CONSTRAINT IF EXISTS "user_page_access_userId_fkey";
ALTER TABLE "user_page_access" ADD CONSTRAINT "user_page_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
