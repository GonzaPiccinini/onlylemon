-- This migration is intentionally non-transactional (Postgres restriction on ALTER TYPE ... ADD VALUE).

ALTER TYPE "Role" ADD VALUE 'SUPER_ADMIN';
