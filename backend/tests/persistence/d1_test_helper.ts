import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface TestD1PreparedStatement {
  bind(...params: unknown[]): TestD1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[]; meta: { changes: number; last_row_id: number } }>;
  run<T = unknown>(): Promise<{ success: boolean; meta: { changes: number; last_row_id: number } }>;
  _sql: string;
  _params: unknown[];
}

export function createMockD1Database(initialSql?: string): D1Database {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON;');

  if (initialSql) {
    sqlite.exec(initialSql);
  }

  function createPreparedStatement(sql: string, params: unknown[] = []): D1PreparedStatement {
    return {
      _sql: sql,
      _params: params,
      bind(...newParams: unknown[]): D1PreparedStatement {
        // Sanitize undefined to null for SQLite compatibility
        const sanitized = newParams.map((p) => (p === undefined ? null : p));
        return createPreparedStatement(sql, sanitized);
      },
      async first<T = unknown>(colName?: string): Promise<T | null> {
        const stmt = sqlite.prepare(sql);
        const row = stmt.get(...(params as never[])) as Record<string, unknown> | undefined;
        if (!row) return null;
        if (colName) return (row[colName] as T) ?? null;
        return row as T;
      },
      async all<T = unknown>(): Promise<D1Result<T>> {
        const stmt = sqlite.prepare(sql);
        const rows = stmt.all(...(params as never[])) as T[];
        return {
          results: rows,
          success: true,
          meta: {
            changes: 0,
            last_row_id: 0,
            duration: 0,
            rows_read: rows.length,
            rows_written: 0,
          },
        } as unknown as D1Result<T>;
      },
      async run<T = unknown>(): Promise<D1Result<T>> {
        const stmt = sqlite.prepare(sql);
        const info = stmt.run(...(params as never[]));
        return {
          success: true,
          meta: {
            changes: Number(info.changes),
            last_row_id: Number(info.lastInsertRowid),
            duration: 0,
            rows_read: 0,
            rows_written: Number(info.changes),
          },
        } as unknown as D1Result<T>;
      },
    } as unknown as D1PreparedStatement;
  }

  const d1Mock: D1Database = {
    prepare(query: string): D1PreparedStatement {
      return createPreparedStatement(query);
    },
    async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
      sqlite.exec('BEGIN TRANSACTION;');
      const results: D1Result<T>[] = [];
      try {
        for (const stmt of statements) {
          const s = stmt as unknown as { _sql: string; _params: unknown[] };
          const prepared = sqlite.prepare(s._sql);
          let resultRows: unknown[] = [];
          let changes = 0;
          let lastRowId = 0;

          if (s._sql.trim().toUpperCase().includes('RETURNING') || s._sql.trim().toUpperCase().startsWith('SELECT')) {
            const rows = prepared.all(...((s._params || []) as never[]));
            resultRows = rows;
          } else {
            const info = prepared.run(...((s._params || []) as never[]));
            changes = Number(info.changes);
            lastRowId = Number(info.lastInsertRowid);
          }

          results.push({
            results: resultRows,
            success: true,
            meta: {
              changes,
              last_row_id: lastRowId,
              duration: 0,
              rows_read: resultRows.length,
              rows_written: changes,
            },
          } as unknown as D1Result<T>);
        }
        sqlite.exec('COMMIT;');
        return results;
      } catch (err) {
        sqlite.exec('ROLLBACK;');
        throw err;
      }
    },
    async exec(query: string): Promise<D1ExecResult> {
      sqlite.exec(query);
      return { count: 0, duration: 0 };
    },
    withSession(_token?: string): unknown {
      return d1Mock;
    },
    dump(): Promise<ArrayBuffer> {
      throw new Error('dump() not implemented in test mock');
    },
  } as unknown as D1Database;

  return d1Mock;
}

export function loadInitialMigrationSql(): string {
  const migrationPath = path.resolve(__dirname, '../../migrations/0001_initial.sql');
  return fs.readFileSync(migrationPath, 'utf8');
}

export function createInMemoryD1Database(): D1Database {
  return createMockD1Database(loadInitialMigrationSql());
}
