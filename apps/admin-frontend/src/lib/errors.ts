import { ApiRequestError } from '../api';

/** A human-readable message for any thrown value from the API layer. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Field-level validation detail, when the API returned any. */
export function errorDetails(err: unknown): Record<string, string> | undefined {
  return err instanceof ApiRequestError ? err.details : undefined;
}
