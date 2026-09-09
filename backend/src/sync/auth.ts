import { ApiErrorPayload } from '../types.js';

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

export function errorResponse(
  code: string,
  message: string,
  status: number,
  details: Record<string, unknown> = {}
): Response {
  const payload: ApiErrorPayload = {
    error: {
      code,
      message,
      ...(Object.keys(details).length > 0 ? { details } : {}),
    },
  };

  return jsonResponse(payload, status);
}

/**
 * Compares two strings in constant time to prevent timing attacks.
 * Hashes both strings with SHA-256 first so that comparisons are always
 * performed on equal-length 32-byte buffers regardless of string length.
 */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const aBuf = encoder.encode(a);
  const bBuf = encoder.encode(b);

  const aHash = await crypto.subtle.digest('SHA-256', aBuf);
  const bHash = await crypto.subtle.digest('SHA-256', bBuf);

  const aView = new Uint8Array(aHash);
  const bView = new Uint8Array(bHash);

  let diff = 0;
  for (let i = 0; i < aView.length; i++) {
    diff |= aView[i] ^ bView[i];
  }

  return diff === 0;
}

/**
 * Validates the Authorization Bearer token on sync API endpoints.
 */
export async function validateSyncAuth(
  request: Request,
  expectedToken?: string
): Promise<{ authorized: boolean; errorResponse?: Response }> {
  if (!expectedToken) {
    return {
      authorized: false,
      errorResponse: errorResponse(
        'UNAUTHORIZED',
        'Sync token is not configured on server',
        401
      ),
    };
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      authorized: false,
      errorResponse: errorResponse(
        'UNAUTHORIZED',
        'Missing or malformed Authorization header. Expected Bearer <token>',
        401
      ),
    };
  }

  const token = authHeader.slice('Bearer '.length).trim();
  const isValid = await timingSafeEqual(token, expectedToken);

  if (!isValid) {
    return {
      authorized: false,
      errorResponse: errorResponse('UNAUTHORIZED', 'Invalid sync token', 401),
    };
  }

  return { authorized: true };
}

/**
 * Validates the Telegram Webhook secret token header.
 */
export async function validateTelegramWebhook(
  request: Request,
  expectedSecret?: string
): Promise<{ authorized: boolean; errorResponse?: Response }> {
  if (!expectedSecret) {
    return {
      authorized: false,
      errorResponse: errorResponse(
        'UNAUTHORIZED',
        'Telegram webhook secret is not configured on server',
        401
      ),
    };
  }

  const secretHeader = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (!secretHeader) {
    return {
      authorized: false,
      errorResponse: errorResponse(
        'UNAUTHORIZED',
        'Missing X-Telegram-Bot-Api-Secret-Token header',
        401
      ),
    };
  }

  const isValid = await timingSafeEqual(secretHeader, expectedSecret);
  if (!isValid) {
    return {
      authorized: false,
      errorResponse: errorResponse(
        'UNAUTHORIZED',
        'Invalid Telegram webhook secret token',
        401
      ),
    };
  }

  return { authorized: true };
}
