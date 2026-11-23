import type { TestProject } from "vitest/node";
import {
  createMigratedDatabase,
  startLocalPostgres,
  type PgConnection,
} from "../../scripts/db/local-db.mjs";

declare module "vitest" {
  export interface ProvidedContext {
    pgConnection: PgConnection;
  }
}

export default async function setup(project: TestProject) {
  const { server, connection } = await startLocalPostgres();
  try {
    await createMigratedDatabase(connection);
  } catch (error) {
    await server.stop();
    throw error;
  }
  project.provide("pgConnection", connection);
  return async () => {
    await server.stop();
  };
}
