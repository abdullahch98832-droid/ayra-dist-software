/**
 * The newest migration this version of the application needs. Every migration records its own
 * number in app_settings.schema_version (database.test.ts checks this).
 */
export const REQUIRED_MIGRATION = "20261127100000_sol_vehicles.sql";
export const REQUIRED_VERSION = REQUIRED_MIGRATION.slice(0, 14);
