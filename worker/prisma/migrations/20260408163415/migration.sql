DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'AddFunds' AND column_name = 'userName'
  ) THEN
    EXECUTE 'ALTER TABLE "AddFunds" ALTER COLUMN "userName" DROP DEFAULT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'AddFunds' AND column_name = 'phoneId'
  ) THEN
    EXECUTE 'ALTER TABLE "AddFunds" ALTER COLUMN "phoneId" DROP DEFAULT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'AddFunds' AND column_name = 'phoneNumber'
  ) THEN
    EXECUTE 'ALTER TABLE "AddFunds" ALTER COLUMN "phoneNumber" DROP DEFAULT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'User' AND column_name = 'name'
  ) THEN
    EXECUTE 'ALTER TABLE "User" ALTER COLUMN "name" DROP DEFAULT';
  END IF;
END $$;
