import { describe, it, expect } from 'vitest';
import {
  timingSafeEqual,
  validateSyncAuth,
  validateTelegramWebhook,
} from '../../src/sync/auth.js';
import worker from '../../src/index.js';
import { Env } from '../../src/types.js';

describe('Auth & Timing-Safe Verification', () => {
  describe('timingSafeEqual', () => {
    it('should return true for identical strings', async () => {
      const match = await timingSafeEqual('super_secret_token_123', 'super_secret_token_123');
      expect(match).toBe(true);
    });

    it('should return false for different strings of same length', async () => {
      const match = await timingSafeEqual('token_alpha', 'token_beta_');
      expect(match).toBe(false);
    });

    it('should return false for strings of different lengths', async () => {
      const match = await timingSafeEqual('short', 'much_longer_string');
      expect(match).toBe(false);
    });

    it('should return false if one is empty', async () => {
      const match = await timingSafeEqual('', 'something');
      expect(match).toBe(false);
    });
  });

  describe('validateSyncAuth', () => {
    const expected = 'my_secret_sync_token';

    it('should reject if server token is unconfigured', async () => {
      const req = new Request('https://worker.local/api/v1/sync/state', {
        headers: { Authorization: 'Bearer my_secret_sync_token' },
      });
      const result = await validateSyncAuth(req, undefined);
      expect(result.authorized).toBe(false);
      expect(result.errorResponse?.status).toBe(401);
    });

    it('should reject if Authorization header is missing', async () => {
      const req = new Request('https://worker.local/api/v1/sync/state');
      const result = await validateSyncAuth(req, expected);
      expect(result.authorized).toBe(false);
      expect(result.errorResponse?.status).toBe(401);
    });

    it('should reject if Authorization header format is invalid', async () => {
      const req = new Request('https://worker.local/api/v1/sync/state', {
        headers: { Authorization: 'Basic dXNlcjpwYXNz' },
      });
      const result = await validateSyncAuth(req, expected);
      expect(result.authorized).toBe(false);
      expect(result.errorResponse?.status).toBe(401);
    });

    it('should reject if Bearer token is incorrect', async () => {
      const req = new Request('https://worker.local/api/v1/sync/state', {
        headers: { Authorization: 'Bearer wrong_token' },
      });
      const result = await validateSyncAuth(req, expected);
      expect(result.authorized).toBe(false);
      expect(result.errorResponse?.status).toBe(401);
    });

    it('should accept if Bearer token matches', async () => {
      const req = new Request('https://worker.local/api/v1/sync/state', {
        headers: { Authorization: 'Bearer my_secret_sync_token' },
      });
      const result = await validateSyncAuth(req, expected);
      expect(result.authorized).toBe(true);
      expect(result.errorResponse).toBeUndefined();
    });
  });

  describe('validateTelegramWebhook', () => {
    const secret = 'super_secret_webhook_token';

    it('should reject if webhook secret is unconfigured', async () => {
      const req = new Request('https://worker.local/telegram/webhook', {
        method: 'POST',
        headers: { 'X-Telegram-Bot-Api-Secret-Token': secret },
      });
      const result = await validateTelegramWebhook(req, undefined);
      expect(result.authorized).toBe(false);
      expect(result.errorResponse?.status).toBe(401);
    });

    it('should reject if secret token header is missing', async () => {
      const req = new Request('https://worker.local/telegram/webhook', {
        method: 'POST',
      });
      const result = await validateTelegramWebhook(req, secret);
      expect(result.authorized).toBe(false);
      expect(result.errorResponse?.status).toBe(401);
    });

    it('should reject if secret token is wrong', async () => {
      const req = new Request('https://worker.local/telegram/webhook', {
        method: 'POST',
        headers: { 'X-Telegram-Bot-Api-Secret-Token': 'wrong_secret' },
      });
      const result = await validateTelegramWebhook(req, secret);
      expect(result.authorized).toBe(false);
      expect(result.errorResponse?.status).toBe(401);
    });

    it('should accept if secret token matches', async () => {
      const req = new Request('https://worker.local/telegram/webhook', {
        method: 'POST',
        headers: { 'X-Telegram-Bot-Api-Secret-Token': secret },
      });
      const result = await validateTelegramWebhook(req, secret);
      expect(result.authorized).toBe(true);
    });
  });

  describe('Worker routing & auth integration', () => {
    const env: Env = {
      SYNC_TOKEN: 'test_sync_token',
      TELEGRAM_WEBHOOK_SECRET: 'test_tg_secret',
    };
    const ctx = {} as ExecutionContext;

    it('should reject unauthorized /api/v1/sync/state with 401', async () => {
      const req = new Request('https://worker.local/api/v1/sync/state', {
        method: 'GET',
      });
      const res = await worker.fetch(req, env, ctx);
      expect(res.status).toBe(401);
      const data = (await res.json()) as { error: { code: string } };
      expect(data.error.code).toBe('UNAUTHORIZED');
    });

    it('should accept authorized /api/v1/sync/state with 200', async () => {
      const req = new Request('https://worker.local/api/v1/sync/state', {
        method: 'GET',
        headers: { Authorization: 'Bearer test_sync_token' },
      });
      const res = await worker.fetch(req, env, ctx);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { sync_version: number };
      expect(data.sync_version).toBe(0);
    });

    it('should reject unauthorized /telegram/webhook with 401', async () => {
      const req = new Request('https://worker.local/telegram/webhook', {
        method: 'POST',
      });
      const res = await worker.fetch(req, env, ctx);
      expect(res.status).toBe(401);
    });

    it('should accept authorized /telegram/webhook with 200', async () => {
      const req = new Request('https://worker.local/telegram/webhook', {
        method: 'POST',
        headers: { 'X-Telegram-Bot-Api-Secret-Token': 'test_tg_secret' },
      });
      const res = await worker.fetch(req, env, ctx);
      expect(res.status).toBe(200);
    });
  });
});
