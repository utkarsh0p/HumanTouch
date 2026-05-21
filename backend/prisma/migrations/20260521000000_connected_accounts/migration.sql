SET search_path = "humantouch";

CREATE TABLE "connected_accounts" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "provider_email" TEXT NOT NULL,
    "encrypted_access_token" TEXT,
    "encrypted_refresh_token" TEXT,
    "scopes" TEXT[] NOT NULL,
    "expires_at" TIMESTAMPTZ,
    "status" TEXT NOT NULL DEFAULT 'connected',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "connected_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "connected_accounts_user_provider_account_key"
ON "connected_accounts"("user_id", "provider", "provider_account_id");

CREATE INDEX "connected_accounts_company_provider_idx"
ON "connected_accounts"("company_id", "provider");

CREATE INDEX "connected_accounts_user_provider_idx"
ON "connected_accounts"("user_id", "provider");

ALTER TABLE "connected_accounts"
ADD CONSTRAINT "connected_accounts_company_id_fkey"
FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "connected_accounts"
ADD CONSTRAINT "connected_accounts_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
