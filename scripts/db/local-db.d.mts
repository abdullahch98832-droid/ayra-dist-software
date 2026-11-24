import type EmbeddedPostgres from "embedded-postgres";

export interface PgConnection {
  host: string;
  port: number;
  user: string;
  password: string;
}

export const MIGRATIONS_DIR: string;
export const TEMPLATE_DB: string;
export function startLocalPostgres(): Promise<{ server: EmbeddedPostgres; connection: PgConnection }>;
export function migrationFiles(): Promise<string[]>;
export function createMigratedDatabase(connection: PgConnection, name?: string, options?: { autoExpose?: boolean }): Promise<void>;
