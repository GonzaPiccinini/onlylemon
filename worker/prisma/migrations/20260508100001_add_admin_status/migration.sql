-- Migration: add_admin_status

CREATE TYPE "AdminStatus" AS ENUM ('ACTIVE', 'DISABLED');

ALTER TABLE "Admin"
  ADD COLUMN "status" "AdminStatus" NOT NULL DEFAULT 'ACTIVE';
