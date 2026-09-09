import { describe, it, expect } from 'vitest';
import worker from '../src/index.js';
import { Env } from '../src/types.js';

describe('GET /api/v1/health', () => {
  const dummyEnv: Env = {};
  const dummyCtx = {} as ExecutionContext;

  it('should return 200 OK with valid health payload', async () => {
    const request = new Request('https://worker.local/api/v1/health', {
      method: 'GET',
    });

    const response = await worker.fetch(request, dummyEnv, dummyCtx);
    expect(response.status).toBe(200);

    const body = (await response.json()) as { status: string; timestamp: string };
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
    expect(new Date(body.timestamp).getTime()).not.toBeNaN();
  });

  it('should return 405 Method Not Allowed for POST requests', async () => {
    const request = new Request('https://worker.local/api/v1/health', {
      method: 'POST',
    });

    const response = await worker.fetch(request, dummyEnv, dummyCtx);
    expect(response.status).toBe(405);

    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('METHOD_NOT_ALLOWED');
  });

  it('should return 404 for unknown endpoints', async () => {
    const request = new Request('https://worker.local/api/v1/nonexistent', {
      method: 'GET',
    });

    const response = await worker.fetch(request, dummyEnv, dummyCtx);
    expect(response.status).toBe(404);

    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
  });
});
