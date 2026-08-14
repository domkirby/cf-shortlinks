import { HTTPException } from 'hono/http-exception';
import type { ApiError } from '@domk/shared-types';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/**
 * Every error the API emits is an HTTPException carrying an {@link ApiError}
 * body, so clients get one predictable shape whether the failure came from
 * validation, auth, or a conflict.
 */
export function apiError(
  status: ContentfulStatusCode,
  code: string,
  message: string,
  details?: Record<string, string>,
): HTTPException {
  const body: ApiError = { error: { code, message, ...(details ? { details } : {}) } };
  return new HTTPException(status, {
    res: Response.json(body, { status }),
    message,
  });
}

export const badRequest = (message: string, details?: Record<string, string>) =>
  apiError(400, 'bad_request', message, details);

export const unauthorized = (message = 'Authentication required', code = 'unauthorized') =>
  apiError(401, code, message);

export const forbidden = (message = 'Not authorized', code = 'forbidden') =>
  apiError(403, code, message);

export const notFound = (message = 'Not found') => apiError(404, 'not_found', message);

export const conflict = (message: string, details?: Record<string, string>) =>
  apiError(409, 'conflict', message, details);

export const upstreamError = (message: string) => apiError(502, 'upstream_error', message);
