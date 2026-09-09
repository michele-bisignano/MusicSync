/**
 * Returns current timestamp in UTC ISO 8601 format: YYYY-MM-DDTHH:MM:SS.SSSZ
 */
export function getCurrentIsoTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Ensures a D1Database is provided, throwing an error if missing.
 */
export function assertDatabase(db?: D1Database): D1Database {
  if (!db) {
    throw new Error('D1 database binding (env.DB) is not configured.');
  }
  return db;
}
