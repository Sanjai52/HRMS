export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function errorEnvelope(code: string, message: string, details?: unknown): ApiError {
  return { success: false, error: { code, message, details } };
}
