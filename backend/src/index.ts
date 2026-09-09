import { Env, HealthResponse } from './types.js';
import {
  jsonResponse,
  errorResponse,
  validateSyncAuth,
  validateTelegramWebhook,
} from './sync/auth.js';

export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // 1. Health Check endpoint (Public)
    if (path === '/api/v1/health') {
      if (method !== 'GET') {
        return errorResponse(
          'METHOD_NOT_ALLOWED',
          `Method ${method} not allowed for /api/v1/health`,
          405
        );
      }
      const responseBody: HealthResponse = {
        status: 'ok',
        timestamp: new Date().toISOString(),
      };
      return jsonResponse(responseBody, 200);
    }

    // 2. Telegram Webhook endpoint (Protected by secret token header)
    if (path === '/telegram/webhook') {
      if (method !== 'POST') {
        return errorResponse(
          'METHOD_NOT_ALLOWED',
          `Method ${method} not allowed for /telegram/webhook`,
          405
        );
      }

      const authCheck = await validateTelegramWebhook(
        request,
        env.TELEGRAM_WEBHOOK_SECRET
      );
      if (!authCheck.authorized) {
        return authCheck.errorResponse!;
      }

      // Handler will be fully implemented in Phase 7 (Telegram Bot)
      return jsonResponse({ ok: true }, 200);
    }

    // 3. Sync API endpoints (Protected by Bearer SYNC_TOKEN)
    if (path.startsWith('/api/v1/sync/')) {
      const authCheck = await validateSyncAuth(request, env.SYNC_TOKEN);
      if (!authCheck.authorized) {
        return authCheck.errorResponse!;
      }

      if (path === '/api/v1/sync/state') {
        if (method !== 'GET') {
          return errorResponse(
            'METHOD_NOT_ALLOWED',
            `Method ${method} not allowed for /api/v1/sync/state`,
            405
          );
        }
        // Will be connected to persistence in Phase 3/5
        return jsonResponse(
          {
            sync_version: 0,
            desired_tracks: [],
            obsolete_tracks: [],
          },
          200
        );
      }

      if (path === '/api/v1/sync/report') {
        if (method !== 'POST') {
          return errorResponse(
            'METHOD_NOT_ALLOWED',
            `Method ${method} not allowed for /api/v1/sync/report`,
            405
          );
        }
        // Will be connected to persistence in Phase 3/5
        return jsonResponse(
          {
            status: 'accepted',
            sync_version: 0,
          },
          200
        );
      }

      return errorResponse('NOT_FOUND', `Unknown sync endpoint: ${path}`, 404);
    }

    // 4. Fallback for any unknown route
    return errorResponse(
      'NOT_FOUND',
      `Route not found: ${method} ${path}`,
      404
    );
  },
};
