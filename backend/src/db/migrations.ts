import { settings } from "../config.js";
import { getPgPool } from "./postgres.js";

type Migration = {
  id: string;
  run: () => Promise<void>;
};

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function ensureMigrationsTable(): Promise<void> {
  const pool = getPgPool();
  const schema = quoteIdentifier(settings.appSchema);

  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schema}.schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function runMigrations(migrations: Migration[]): Promise<void> {
  const pool = getPgPool();
  const schema = quoteIdentifier(settings.appSchema);

  await ensureMigrationsTable();

  for (const migration of migrations) {
    const existing = await pool.query<{ id: string }>(
      `SELECT id FROM ${schema}.schema_migrations WHERE id = $1`,
      [migration.id],
    );
    if (existing.rowCount && existing.rowCount > 0) {
      continue;
    }

    await migration.run();
    await pool.query(
      `INSERT INTO ${schema}.schema_migrations (id) VALUES ($1)`,
      [migration.id],
    );
  }
}
