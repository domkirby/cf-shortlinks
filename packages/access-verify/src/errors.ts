export type AccessErrorCode =
  | 'missing_token'
  | 'invalid_token'
  | 'expired_token'
  | 'wrong_audience'
  | 'wrong_issuer'
  | 'jwks_unavailable'
  | 'misconfigured';

export class AccessVerifyError extends Error {
  readonly code: AccessErrorCode;
  /** HTTP status this error should surface as. */
  readonly status: number;

  constructor(code: AccessErrorCode, message: string, status = 401) {
    super(message);
    this.name = 'AccessVerifyError';
    this.code = code;
    this.status = status;
  }
}
