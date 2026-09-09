import { Env } from '../types.js';
import { errorResponse, jsonResponse } from './auth.js';
import {
  SyncConflictError,
  SyncService,
  SyncValidationError,
} from './sync_service.js';

export async function handleSyncState(
  request: Request,
  env: Env
): Promise<Response> {
  if (request.method !== 'GET') {
    return errorResponse(
      'METHOD_NOT_ALLOWED',
      `Method ${request.method} not allowed for /api/v1/sync/state`,
      405
    );
  }

  if (!env.DB) {
    return errorResponse(
      'SERVICE_UNAVAILABLE',
      'Database connection is not configured',
      503
    );
  }

  try {
    const syncService = new SyncService(env.DB);
    const state = await syncService.getSyncState();
    return jsonResponse(state, 200);
  } catch (err) {
    console.error('Error handling /api/v1/sync/state:', err);
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to retrieve synchronization state',
      500
    );
  }
}

export async function handleSyncReport(
  request: Request,
  env: Env
): Promise<Response> {
  if (request.method !== 'POST') {
    return errorResponse(
      'METHOD_NOT_ALLOWED',
      `Method ${request.method} not allowed for /api/v1/sync/report`,
      405
    );
  }

  if (!env.DB) {
    return errorResponse(
      'SERVICE_UNAVAILABLE',
      'Database connection is not configured',
      503
    );
  }

  let body: unknown;
  try {
    const text = await request.text();
    if (!text || !text.trim()) {
      return errorResponse(
        'INVALID_PAYLOAD',
        'Request body must not be empty',
        400
      );
    }
    body = JSON.parse(text);
  } catch (_err) {
    return errorResponse(
      'INVALID_PAYLOAD',
      'Malformed JSON payload in request body',
      400
    );
  }

  try {
    const syncService = new SyncService(env.DB);
    const reportResponse = await syncService.processReport(body);
    return jsonResponse(reportResponse, 200);
  } catch (err) {
    if (err instanceof SyncValidationError) {
      return errorResponse('INVALID_PAYLOAD', err.message, 400, err.details);
    }
    if (err instanceof SyncConflictError) {
      return errorResponse(err.code, err.message, 409, err.details);
    }

    console.error('Error handling /api/v1/sync/report:', err);
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to process synchronization report',
      500
    );
  }
}
