import {
  cloneElement,
  isValidElement,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { Tray } from "@phosphor-icons/react/dist/ssr";
import { cn } from "../lib/cn";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "icon";
export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-ink-inverse hover:bg-primary-hover",
  secondary: "bg-surface-muted text-ink hover:bg-line",
  // Deprecated alias for `secondary`; kept so existing call sites keep working.
  quiet: "bg-surface-muted text-ink hover:bg-line",
  outline: "border border-line bg-surface text-ink hover:bg-surface-muted",
  ghost: "text-ink-secondary hover:bg-surface-muted hover:text-ink",
  danger: "bg-danger text-ink-inverse hover:bg-danger/90",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-9 px-3.5 text-[13px]",
  lg: "h-10 px-4 text-sm",
  icon: "h-9 w-9 p-0",
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}) {
  return (
    <button
      {...rest}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-control font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        buttonSizes[size],
        buttonVariants[variant],
        className
      )}
      aria-busy={loading || rest["aria-busy"] || undefined}
      disabled={rest.disabled || loading}
    >
      {loading && (
        <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
          <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      )}
      {children}
    </button>
  );
}

export function Card({
  children,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
}) {
  return <Tag className={cn("rounded-card border border-line bg-surface shadow-card", className)}>{children}</Tag>;
}

export function CardHeader({
  title,
  description,
  action,
  divider = false,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  divider?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 px-5 py-4",
        divider && "border-b border-line",
        className
      )}
    >
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] leading-relaxed text-ink-secondary">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const hintId = htmlFor ? `${htmlFor}-hint` : undefined;
  const errorId = htmlFor ? `${htmlFor}-error` : undefined;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  let control = children;
  if (htmlFor && isValidElement<Record<string, unknown>>(children)) {
    const existing = children.props;
    control = cloneElement(children, {
      id: htmlFor,
      "aria-describedby": [existing["aria-describedby"], describedBy].filter(Boolean).join(" ") || undefined,
      "aria-invalid": error ? true : existing["aria-invalid"],
      required: required ?? existing.required,
    });
  }

  const labelContent = (
    <>
      {label}
      {required && (
        <span aria-hidden="true" className="ml-0.5 text-danger">
          *
        </span>
      )}
    </>
  );

  const hintNode = hint ? (
    <p id={hintId} className="text-xs leading-relaxed text-ink-secondary">
      {hint}
    </p>
  ) : null;

  const errorNode = error ? (
    <p id={errorId} role="alert" className="text-xs font-medium leading-relaxed text-danger">
      {error}
    </p>
  ) : null;

  if (htmlFor) {
    return (
      <div className={cn("grid gap-1.5", className)}>
        <label htmlFor={htmlFor} className="text-xs font-medium text-ink">
          {labelContent}
        </label>
        {control}
        {hintNode}
        {errorNode}
      </div>
    );
  }

  return (
    <label className={cn("grid gap-1.5", className)}>
      <span className="text-xs font-medium text-ink">{labelContent}</span>
      {control}
      {hintNode}
      {errorNode}
    </label>
  );
}

function controlClasses(invalid: boolean | undefined, className: string | undefined) {
  return cn(
    "w-full bg-surface text-sm text-ink outline-none transition-colors placeholder:text-ink-muted disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-muted",
    invalid
      ? "border-danger focus:border-danger focus-visible:ring-2 focus-visible:ring-danger/20"
      : "border-line focus:border-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-600/20",
    className
  );
}

export function TextInput({
  invalid,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      {...props}
      aria-invalid={invalid || props["aria-invalid"] || undefined}
      className={cn("h-10 rounded-control border px-3", controlClasses(invalid, className))}
    />
  );
}

export function Select({
  invalid,
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <select
      {...props}
      aria-invalid={invalid || props["aria-invalid"] || undefined}
      className={cn("h-10 rounded-control border px-3 pr-8", controlClasses(invalid, className))}
    />
  );
}

export function Textarea({
  invalid,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      {...props}
      aria-invalid={invalid || props["aria-invalid"] || undefined}
      className={cn("min-h-24 resize-y rounded-control border px-3 py-2", controlClasses(invalid, className))}
    />
  );
}

const statusTones: Record<string, StatusTone> = {
  // Success
  ACTIVE: "success",
  PRESENT: "success",
  APPROVED: "success",
  PAID: "success",
  COMPLETED: "success",
  HIRED: "success",
  SELECTED: "success",
  OFFER: "success",
  OPEN: "success",
  // Warning / in progress
  PENDING: "warning",
  PENDING_MANAGER: "warning",
  PENDING_HR: "warning",
  LATE: "warning",
  HALF_DAY: "warning",
  IN_REVIEW: "warning",
  ON_HOLD: "warning",
  DRAFT: "warning",
  SCREENING: "warning",
  SHORTLISTED: "warning",
  ASSESSMENT: "warning",
  RESERVED: "warning",
  GATED: "warning",
  PARTIAL_FAILED: "warning",
  // Danger / negative
  ABSENT: "danger",
  REJECTED: "danger",
  FAILED: "danger",
  TERMINATED: "danger",
  CANCELLED: "danger",
  ABORTED: "danger",
  // Informational states
  ON_LEAVE: "info",
  HOLIDAY: "info",
  REMOTE: "info",
  SCHEDULED: "info",
  INTERVIEW: "info",
  RUNNING: "info",
  APPLIED: "info",
  // Neutral states
  INACTIVE: "neutral",
  DEACTIVATED: "neutral",
  CLOSED: "neutral",
  WITHDRAWN: "neutral",
  UNKNOWN: "neutral",
};

export function statusTone(status: string): StatusTone {
  const key = status.trim().toUpperCase();
  const tone = statusTones[key];
  if (!tone) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[ui] Unknown status "${status}"; using the neutral tone.`);
    }
    return "neutral";
  }
  return tone;
}

const statusToneClasses: Record<
  StatusTone,
  { pill: string; dot: string }
> = {
  success: { pill: "bg-success-soft text-success", dot: "bg-success" },
  warning: { pill: "bg-warning-soft text-warning", dot: "bg-warning" },
  danger: { pill: "bg-danger-soft text-danger", dot: "bg-danger" },
  info: { pill: "bg-info-soft text-info", dot: "bg-info" },
  neutral: { pill: "bg-surface-muted text-ink-secondary", dot: "bg-ink-muted" },
};

export function StatusPill({ status, tone }: { status: string; tone?: StatusTone }) {
  const resolved = tone ?? statusTone(status);
  const classes = statusToneClasses[resolved];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase leading-none tracking-[0.04em]",
        classes.pill
      )}
    >
      <span aria-hidden="true" className={cn("h-1.5 w-1.5 shrink-0 rounded-full", classes.dot)} />
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  icon,
  trend,
  accent = false,
  className,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
  trend?: ReactNode;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-card border p-5 shadow-card",
        accent ? "border-primary/20 bg-primary-soft" : "border-line bg-surface",
        className
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-ink-secondary">{label}</p>
          <p className="mt-1 text-[28px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-ink">{value}</p>
          {detail && <p className="mt-1.5 text-xs leading-relaxed text-ink-secondary">{detail}</p>}
          {trend && <div className="mt-1.5 text-xs leading-relaxed text-ink-secondary">{trend}</div>}
        </div>
        {icon && (
          <span
            aria-hidden="true"
            className={cn(
              "grid h-9 w-9 shrink-0 place-items-center rounded-card",
              accent ? "bg-surface text-primary-ink" : "bg-primary-soft text-primary-ink"
            )}
          >
            {icon}
          </span>
        )}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
  icon,
  className,
}: {
  title: string;
  body: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        "grid place-items-center gap-3 rounded-card border border-dashed border-line bg-surface px-6 py-12 text-center",
        className
      )}
    >
      <span className="grid h-10 w-10 place-items-center rounded-card bg-surface-muted text-ink-muted" aria-hidden="true">
        {icon ?? <Tray size={20} />}
      </span>
      <div>
        <p className="text-base font-semibold text-ink">{title}</p>
        <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-ink-secondary">{body}</p>
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export function SkeletonRows({
  n = 5,
  cols = 1,
  className,
}: {
  n?: number;
  cols?: number;
  className?: string;
}) {
  const columns = Math.max(1, cols);
  const rows = Math.max(0, n);
  return (
    <div role="status" aria-busy="true" className={cn("grid gap-3", className)}>
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} aria-hidden="true" className="flex items-center gap-3">
          {Array.from({ length: columns }).map((_, col) => (
            <div key={col} className="h-12 flex-1 animate-pulse rounded-card bg-surface-muted" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function PageContainer({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[1700px] px-4 py-6 sm:px-6 lg:px-8", className)}>{children}</div>;
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
        className
      )}
    >
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">{eyebrow}</p>
        )}
        <h1 className="mt-1 text-[25px] font-semibold leading-tight tracking-[-0.02em] text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink-secondary">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
