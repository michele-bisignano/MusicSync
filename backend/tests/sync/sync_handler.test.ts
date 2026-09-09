import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleSyncState, handleSyncReport } from '../../src/sync/sync_handler.js';
import { createInMemoryD1Database } from '../persistence/d1_test_helper.js';
import { Env } from '../../src/types.js';

describe('Sync Handlers', () => {
  let env: Env;

  beforeEach(async () => {
    const db = await createInMemoryD1Database();
    env = { DB: db } as Env;
  });

  describe('handleSyncState', () => {
    it('returns 405 for non-GET methods', async () => {
      const req = new Request('http://localhost/api/v1/sync/state', { method: 'POST' });
      const res = await handleSyncState(req, env);
      expect(res.status).toBe(405);
    });

    it('returns 503 if DB is missing', async () => {
      const req = new Request('http://localhost/api/v1/sync/state', { method: 'GET' });
      const res = await handleSyncState(req, {} as Env);
      expect(res.status).toBe(503);
    });

    it('returns 200 and initial state', async () => {
      const req = new Request('http://localhost/api/v1/sync/state', { method: 'GET' });
      const res = await handleSyncState(req, env);
      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.sync_version).toBe(0);
      expect(data.desired_tracks).toEqual([]);
      expect(data.obsolete_tracks).toEqual([]);
    });
  });

  describe('handleSyncReport', () => {
    it('returns 405 for non-POST methods', async () => {
      const req = new Request('http://localhost/api/v1/sync/report', { method: 'GET' });
      const res = await handleSyncReport(req, env);
      expect(res.status).toBe(405);
    });

    it('returns 400 for empty body', async () => {
      const req = new Request('http://localhost/api/v1/sync/report', { method: 'POST', body: '' });
      const res = await handleSyncReport(req, env);
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid JSON', async () => {
      const req = new Request('http://localhost/api/v1/sync/report', { method: 'POST', body: 'invalid JSON' });
      const res = await handleSyncReport(req, env);
      expect(res.status).toBe(400);
    });

    it('returns 400 for validation errors', async () => {
      const req = new Request('http://localhost/api/v1/sync/report', { 
        method: 'POST', 
        body: JSON.stringify({ sync_version: -1, status: 'success', operations: [] }) 
      });
      const res = await handleSyncReport(req, env);
      expect(res.status).toBe(400);
    });

    it('returns 200 for valid report', async () => {
      const req = new Request('http://localhost/api/v1/sync/report', { 
        method: 'POST', 
        body: JSON.stringify({ sync_version: 0, status: 'success', operations: [] }) 
      });
      const res = await handleSyncReport(req, env);
      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.acknowledged).toBe(true);
      expect(data.sync_version).toBe(0);
    });
  });
});
