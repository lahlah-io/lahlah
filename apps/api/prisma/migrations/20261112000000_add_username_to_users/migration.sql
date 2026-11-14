-- Add required unique username to users.
ALTER TABLE "users" ADD COLUMN "username" VARCHAR NOT NULL DEFAULT '';

-- Drop the temporary default; the column stays NOT NULL with no default.
ALTER TABLE "users" ALTER COLUMN "username" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
