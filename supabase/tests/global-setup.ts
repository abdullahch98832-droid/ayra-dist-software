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
    // Without automatic grants: the strictest project setting, so missing grants fail here first.
    await createMigratedDatabase(connection, undefined, { autoExpose: false });
  } catch (error) {
    await server.stop();
    throw error;
  }
  project.provide("pgConnection", connection);
  return async () => {
    await server.stop();
  };
}
