import { describe, it, expect, vi } from 'vitest';
import { TelegramAuthorizer } from '../../src/telegram/telegram_authorizer.js';

describe('TelegramAuthorizer', () => {
  it('allows authorized user IDs', () => {
    const authorizer = new TelegramAuthorizer('12345678, 87654321, 99999');
    expect(authorizer.isAuthorized(12345678)).toBe(true);
    expect(authorizer.isAuthorized(87654321)).toBe(true);
    expect(authorizer.isAuthorized(99999)).toBe(true);
  });

  it('rejects unauthorized user IDs with structured log warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const authorizer = new TelegramAuthorizer('12345678');

    const result = authorizer.isAuthorized(99999999, 'intruder_bot');
    expect(result).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      'Unauthorized Telegram access attempt',
      expect.objectContaining({
        userId: 99999999,
        username: 'intruder_bot',
      })
    );

    warnSpy.mockRestore();
  });

  it('rejects undefined user ID', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const authorizer = new TelegramAuthorizer('12345678');

    expect(authorizer.isAuthorized(undefined)).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith('Telegram request rejected: missing user ID');

    warnSpy.mockRestore();
  });

  it('handles empty, malformed, or missing configuration safely', () => {
    const emptyAuthorizer = new TelegramAuthorizer('');
    expect(emptyAuthorizer.isAuthorized(12345)).toBe(false);
    expect(emptyAuthorizer.getAuthorizedCount()).toBe(0);

    const undefinedAuthorizer = new TelegramAuthorizer(undefined);
    expect(undefinedAuthorizer.isAuthorized(12345)).toBe(false);

    const malformedAuthorizer = new TelegramAuthorizer('abc,   , 12345, not-a-number');
    expect(malformedAuthorizer.getAuthorizedCount()).toBe(1);
    expect(malformedAuthorizer.isAuthorized(12345)).toBe(true);
  });
});
