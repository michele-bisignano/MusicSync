export interface Env {
  DB?: D1Database;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  AUTHORIZED_TELEGRAM_IDS?: string;
  SYNC_TOKEN?: string;
  YOUTUBE_API_KEY?: string;
  ENVIRONMENT?: string;
}

export interface ApiErrorPayload {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface HealthResponse {
  status: 'ok';
  timestamp: string;
}
