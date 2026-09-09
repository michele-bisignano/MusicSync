export class TelegramAuthorizer {
  private readonly authorizedIds: Set<number>;

  constructor(authorizedIdsConfig: string | undefined) {
    this.authorizedIds = new Set<number>();
    if (authorizedIdsConfig) {
      const parts = authorizedIdsConfig.split(',');
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed) {
          const num = Number(trimmed);
          if (!Number.isNaN(num)) {
            this.authorizedIds.add(num);
          }
        }
      }
    }
  }

  isAuthorized(userId: number | undefined, username?: string): boolean {
    if (userId === undefined) {
      console.warn('Telegram request rejected: missing user ID');
      return false;
    }

    const isAllowed = this.authorizedIds.has(userId);
    if (!isAllowed) {
      console.warn('Unauthorized Telegram access attempt', {
        userId,
        username: username || 'unknown',
        timestamp: new Date().toISOString(),
      });
      return false;
    }

    return true;
  }

  getAuthorizedCount(): number {
    return this.authorizedIds.size;
  }
}
