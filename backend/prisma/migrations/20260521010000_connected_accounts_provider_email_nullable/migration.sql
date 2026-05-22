SET search_path = "humantouch";

ALTER TABLE "connected_accounts"
ALTER COLUMN "provider_email" DROP NOT NULL;
