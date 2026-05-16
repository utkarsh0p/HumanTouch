CREATE SCHEMA IF NOT EXISTS "humantouch";
SET search_path = "humantouch";

CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "role_key" TEXT NOT NULL,
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "auth_provider" TEXT NOT NULL DEFAULT 'local',
    "password_hash" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agents" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "updated_by_user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT '',
    "prompt" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT 'Admin',
    "goal" TEXT NOT NULL DEFAULT '',
    "responsibilities" TEXT NOT NULL DEFAULT '',
    "permissions" TEXT NOT NULL DEFAULT '',
    "guardrails" TEXT NOT NULL DEFAULT '',
    "work_style" TEXT NOT NULL DEFAULT '',
    "agent_info" JSONB NOT NULL DEFAULT '{}',
    "system_prompt" TEXT NOT NULL DEFAULT '',
    "prompt_version" INTEGER NOT NULL DEFAULT 1,
    "system_prompt_generated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_role_assignments" (
    "agent_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "role_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agent_role_assignments_pkey" PRIMARY KEY ("agent_id","role_key")
);

CREATE TABLE "agent_user_assignments" (
    "agent_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agent_user_assignments_pkey" PRIMARY KEY ("agent_id","user_id")
);

CREATE TABLE "agent_sessions" (
    "thread_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "agent_id" UUID NOT NULL,
    "user_prompt" TEXT,
    "system_prompt_used" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agent_sessions_pkey" PRIMARY KEY ("thread_id")
);

CREATE TABLE "agent_messages" (
    "id" BIGSERIAL NOT NULL,
    "company_id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agent_messages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "agent_messages_role_check" CHECK ("role" IN ('user', 'assistant'))
);

CREATE UNIQUE INDEX "companies_slug_key" ON "companies"("slug");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "auth_sessions_token_hash_key" ON "auth_sessions"("token_hash");
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions"("user_id");
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions"("expires_at");
CREATE UNIQUE INDEX "agents_slug_key" ON "agents"("slug");
CREATE INDEX "agents_slug_idx" ON "agents"("slug");
CREATE INDEX "agents_active_created_at_idx" ON "agents"("company_id", "is_system", "created_at") WHERE "archived_at" IS NULL;
CREATE INDEX "agent_role_assignments_role_key_idx" ON "agent_role_assignments"("role_key");
CREATE INDEX "agent_user_assignments_user_id_idx" ON "agent_user_assignments"("user_id");
CREATE INDEX "agent_sessions_updated_at_idx" ON "agent_sessions"("updated_at" DESC);
CREATE INDEX "agent_messages_thread_created_at_idx" ON "agent_messages"("thread_id", "created_at");

ALTER TABLE "users" ADD CONSTRAINT "users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agents" ADD CONSTRAINT "agents_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agents" ADD CONSTRAINT "agents_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agents" ADD CONSTRAINT "agents_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_role_assignments" ADD CONSTRAINT "agent_role_assignments_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_role_assignments" ADD CONSTRAINT "agent_role_assignments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_user_assignments" ADD CONSTRAINT "agent_user_assignments_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_user_assignments" ADD CONSTRAINT "agent_user_assignments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_user_assignments" ADD CONSTRAINT "agent_user_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "agent_sessions"("thread_id") ON DELETE CASCADE ON UPDATE CASCADE;
