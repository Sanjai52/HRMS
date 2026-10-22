/**
 * Error taxonomy and safe user-facing copy.
 *
 * Rule: backend text never reaches the DOM. `ApiError.message` is the safe
 * `userMessage`; `technicalMessage` is stored for development logging only and
 * must never be rendered.
 */

export type ErrorKind =
  | "network"
  | "auth"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "expired"
  | "validation"
  | "rate_limit"
  | "server"
  | "unknown";

export type UserErrorAction = "retry" | "signin" | "back" | "refresh" | "none";

export interface UserError {
  kind: ErrorKind;
  title: string;
  body: string;
  action: UserErrorAction;
  actionLabel: string;
  retryable: boolean;
  /** Allowlisted field names mapped to a generic message. Never backend copy. */
  fieldErrors?: Record<string, string>;
}

interface ErrorCopy {
  title: string;
  body: string;
  action: UserErrorAction;
  actionLabel: string;
  retryable: boolean;
}

const COPY: Record<ErrorKind, ErrorCopy> = {
  network: {
    title: "We couldn't connect",
    body: "Check your internet connection and try again.",
    action: "retry",
    actionLabel: "Try again",
    retryable: true,
  },
  auth: {
    title: "Your session has expired",
    body: "Sign in again to continue.",
    action: "signin",
    actionLabel: "Sign in",
    retryable: false,
  },
  forbidden: {
    title: "You don't have access",
    body: "Ask your administrator if you think you should have access.",
    action: "back",
    actionLabel: "Go back",
    retryable: false,
  },
  not_found: {
    title: "We couldn't find that record",
    body: "It may have been removed, or the link may be incorrect.",
    action: "back",
    actionLabel: "Back to list",
    retryable: false,
  },
  conflict: {
    title: "This record has changed",
    body: "Refresh the page and try again.",
    action: "refresh",
    actionLabel: "Refresh",
    retryable: false,
  },
  expired: {
    title: "This link has expired",
    body: "Ask the sender for a new link.",
    action: "none",
    actionLabel: "Request a new link",
    retryable: false,
  },
  validation: {
    title: "Check the highlighted fields",
    body: "Some details need attention.",
    action: "none",
    actionLabel: "Fix fields",
    retryable: false,
  },
  rate_limit: {
    title: "Too many attempts",
    body: "Wait a moment and try again.",
    action: "retry",
    actionLabel: "Try again",
    retryable: true,
  },
  server: {
    title: "Something went wrong on our side",
    body: "Try again in a moment. If it continues, contact your administrator.",
    action: "retry",
    actionLabel: "Try again",
    retryable: true,
  },
  unknown: {
    title: "Something went wrong",
    body: "Try again. If it continues, contact your administrator.",
    action: "retry",
    actionLabel: "Try again",
    retryable: true,
  },
};

/**
 * Known API codes override the status-derived kind (and sometimes the copy).
 * Applied before the kind defaults.
 */
const CODE_OVERRIDES: Record<string, Partial<ErrorCopy> & { kind?: ErrorKind }> = {
  UNAUTHENTICATED: { kind: "auth" },
  FORBIDDEN: { kind: "forbidden" },
  NOT_FOUND: { kind: "not_found" },
  VERSION_CONFLICT: { kind: "conflict" },
  INVITATION_EXPIRED: { kind: "expired" },
  TOKEN_INVALID: { kind: "expired" },
  STATUS_EXPIRED: { kind: "expired" },
  VALIDATION_ERROR: { kind: "validation" },
  RATE_LIMITED: { kind: "rate_limit" },
  DUPLICATE_APPLICATION: {
    kind: "conflict",
    title: "You've already applied for this role.",
    body: "We have your application on file. Check your status link for updates.",
    action: "none",
    actionLabel: "Close",
    retryable: false,
  },
  OVERLAP: {
    kind: "validation",
    title: "Those dates overlap an existing request",
    body: "Choose different dates and try again.",
    action: "none",
    actionLabel: "Fix fields",
    retryable: false,
  },
  INSUFFICIENT_BALANCE: {
    kind: "validation",
    title: "Not enough leave balance",
    body: "Reduce the days or choose a different leave type.",
    action: "none",
    actionLabel: "Fix fields",
    retryable: false,
  },
};

const ALLOWED_FIELD_ERROR = "Check this field.";

const ALLOWED_FIELDS = new Set([
  "email",
  "name",
  "start_date",
  "end_date",
  "reason",
  "password",
  "token",
  "title",
  "department",
  "period",
  "amount",
]);

/** Keep only known field names; messages are always the generic one. */
function allowlistFieldErrors(input: unknown): Record<string, string> | undefined {
  if (!input) return undefined;
  let keys: string[] = [];
  if (Array.isArray(input)) {
    keys = input.filter((item): item is string => typeof item === "string");
  } else if (typeof input === "object") {
    keys = Object.keys(input as Record<string, unknown>);
  }
  const out: Record<string, string> = {};
  for (const key of keys) {
    const name = key.trim().toLowerCase();
    if (ALLOWED_FIELDS.has(name)) out[name] = ALLOWED_FIELD_ERROR;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export interface ApiErrorOptions {
  code?: string;
  userMessage: string;
  technicalMessage?: string;
  retryable?: boolean;
  /** Allowlisted field names only; messages are replaced with generic copy. */
  fieldErrors?: Record<string, string>;
}

export class ApiError extends Error {
  readonly kind: ErrorKind;
  readonly status: number;
  readonly code?: string;
  readonly userMessage: string;
  readonly technicalMessage?: string;
  readonly retryable: boolean;
  readonly fieldErrors?: Record<string, string>;

  constructor(kind: ErrorKind, status: number, options: ApiErrorOptions) {
    // The message must stay safe: unmigrated call sites that read `.message`
    // must never be able to print backend text.
    super(options.userMessage);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
    this.code = options.code;
    this.userMessage = options.userMessage;
    this.technicalMessage = options.technicalMessage;
    this.retryable = options.retryable ?? COPY[kind].retryable;
    this.fieldErrors = options.fieldErrors;

    if (this.technicalMessage && process.env.NODE_ENV !== "production") {
      // Development diagnostics only; never rendered and never in production.
      console.error(`[api] ${this.technicalMessage}`);
    }
  }
}

export function statusKind(status: number): ErrorKind {
  if (status === 0) return "network";
  if (status === 401) return "auth";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 410) return "expired";
  if (status === 400 || status === 422) return "validation";
  if (status === 429) return "rate_limit";
  if (status >= 500 && status <= 599) return "server";
  return "unknown";
}

/** Canonical safe message for a kind; used as `ApiError.userMessage`. */
export function defaultUserMessage(kind: ErrorKind): string {
  const copy = COPY[kind];
  return `${copy.title}. ${copy.body}`;
}

export function isApiError(error: unknown): error is ApiError {
  if (error instanceof ApiError) return true;
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "ApiError" &&
    typeof (error as { status?: unknown }).status === "number"
  );
}

function isNetworkFailure(error: unknown): boolean {
  if (error instanceof TypeError || error instanceof DOMException) return true;
  if (error instanceof Error) {
    const name = error.name;
    return name === "TypeError" || name === "NetworkError" || name === "AbortError";
  }
  return false;
}

/**
 * Map any thrown value to safe copy. Precedence for the title is the known
 * code override, then `fallbackTitle`, then the kind's base title. Body/action
 * always come from the override or the taxonomy.
 */
export function toUserMessage(error: unknown, fallbackTitle?: string): UserError {
  let kind: ErrorKind = "unknown";
  let code: string | undefined;
  let fieldErrors: Record<string, string> | undefined;

  if (isApiError(error)) {
    code = error.code;
    const codeKind = code ? CODE_OVERRIDES[code]?.kind : undefined;
    kind = codeKind ?? error.kind;
    fieldErrors = allowlistFieldErrors(error.fieldErrors);
  } else if (isNetworkFailure(error)) {
    kind = "network";
  }

  const override = code ? CODE_OVERRIDES[code] : undefined;
  const resolvedKind = override?.kind ?? kind;
  const base = COPY[resolvedKind];
  // Known-code copy is more specific than a page-level fallback. Only use the
  // fallback when the code has no title of its own.
  const title = override?.title ?? (fallbackTitle && fallbackTitle.trim() ? fallbackTitle : base.title);

  const result: UserError = {
    kind: resolvedKind,
    title,
    body: override?.body ?? base.body,
    action: override?.action ?? base.action,
    actionLabel: override?.actionLabel ?? base.actionLabel,
    retryable: override?.retryable ?? base.retryable,
  };
  if (fieldErrors) result.fieldErrors = fieldErrors;
  return result;
}
