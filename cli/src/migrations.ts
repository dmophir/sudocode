/**
 * Database migration utilities for sudocode
 */

import type Database from "better-sqlite3";

export interface Migration {
  version: number;
  name: string;
  up: (db: Database.Database) => void;
  down?: (db: Database.Database) => void;
}

/**
 * All migrations in order
 */
const MIGRATIONS: Migration[] = [];

/**
 * Get the current migration version from the database
 */
export function getCurrentMigrationVersion(db: Database.Database): number {
  // Create migrations table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const stmt = db.prepare("SELECT MAX(version) as version FROM migrations");
  const result = stmt.get() as { version: number | null };
  return result.version ?? 0;
}

/**
 * Record a migration as applied
 */
export function recordMigration(
  db: Database.Database,
  migration: Migration
): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO migrations (version, name)
    VALUES (?, ?)
  `);
  stmt.run(migration.version, migration.name);
}

/**
 * Run all pending migrations
 */
export function runMigrations(db: Database.Database): void {
  const currentVersion = getCurrentMigrationVersion(db);

  const pendingMigrations = MIGRATIONS.filter(
    (m) => m.version > currentVersion
  );

  if (pendingMigrations.length === 0) {
    return;
  }

  console.log(`Running ${pendingMigrations.length} pending migration(s)...`);

  for (const migration of pendingMigrations) {
    console.log(`  Applying migration ${migration.version}: ${migration.name}`);
    try {
      migration.up(db);
      recordMigration(db, migration);
      console.log(`  ✓ Migration ${migration.version} applied successfully`);
    } catch (error) {
      console.error(`  ✗ Migration ${migration.version} failed:`, error);
      throw error;
    }
  }
}
