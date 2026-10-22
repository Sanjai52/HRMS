import type { ReactNode } from "react";
import {
  CheckCircle,
  Info,
  Warning,
  WarningCircle,
  X,
  XCircle,
} from "@phosphor-icons/react/dist/ssr";
import { Button, SkeletonRows } from "./ui";
import { cn } from "../lib/cn";

export type AlertTone = "success" | "warning" | "danger" | "info";

export interface AlertAction {
  label: string;
  onClick?: () => void;
  href?: string;
}

const primaryLinkClasses =
  "inline-flex h-9 items-center justify-center rounded-control bg-primary px-3.5 text-[13px] font-medium text-ink-inverse transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2";

export function ErrorState({
  title,
  body,
  actionLabel,
  onAction,
  actionHref,
  secondary,
  secondaryLabel,
  secondaryHref,
  className,
}: {
  title: string;
  body: string;
  actionLabel: string;
  onAction?: () => void;
  actionHref?: string;
  secondary?: ReactNode;
  secondaryLabel?: string;
  secondaryHref?: string;
  className?: string;
}) {
  const secondaryNode =
    secondary ??
    (secondaryLabel ? (
      secondaryHref ? (
        <a
          href={secondaryHref}
          className="text-[13px] font-medium text-ink-secondary transition-colors hover:text-ink"
        >
          {secondaryLabel}
        </a>
      ) : (
        <span className="text-[13px] text-ink-secondary">{secondaryLabel}</span>
      )
    ) : null);

  return (
    <section
      role="alert"
      className={cn("rounded-card border border-line bg-surface p-6 shadow-card sm:p-8", className)}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <span
          aria-hidden="true"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-card bg-danger-soft text-danger"
        >
          <WarningCircle size={20} weight="regular" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <p className="mt-1 max-w-[60ch] text-[13px] leading-relaxed text-ink-secondary">{body}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {actionHref && !onAction ? (
              <a href={actionHref} className={primaryLinkClasses}>
                {actionLabel}
              </a>
            ) : (
              <Button type="button" onClick={onAction}>
                {actionLabel}
              </Button>
            )}
            {secondaryNode}
          </div>
        </div>
      </div>
    </section>
  );
}

const alertTones = {
  success: {
    container: "border-success/20 bg-success-soft text-success",
    Icon: CheckCircle,
  },
  warning: {
    container: "border-warning/20 bg-warning-soft text-warning",
    Icon: Warning,
  },
  danger: {
    container: "border-danger/20 bg-danger-soft text-danger",
    Icon: XCircle,
  },
  info: {
    container: "border-info/20 bg-info-soft text-info",
    Icon: Info,
  },
} satisfies Record<AlertTone, { container: string; Icon: typeof CheckCircle }>;

export function Alert({
  tone,
  title,
  children,
  action,
  onDismiss,
  className,
}: {
  tone: AlertTone;
  title?: string;
  children: ReactNode;
  action?: AlertAction;
  onDismiss?: () => void;
  className?: string;
}) {
  const styles = alertTones[tone];
  const Icon = styles.Icon;

  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex w-full items-start gap-3 rounded-control border px-4 py-3 text-[13px] leading-relaxed",
        styles.container,
        className
      )}
    >
      <Icon size={18} weight="regular" className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        <div className={cn(title && "mt-0.5")}>{children}</div>
        {action && (
          <div className="mt-2">
            {action.href ? (
              <a href={action.href} className="font-semibold underline underline-offset-2">
                {action.label}
              </a>
            ) : (
              <button type="button" onClick={action.onClick} className="font-semibold underline underline-offset-2">
                {action.label}
              </button>
            )}
          </div>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-control opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
        >
          <X size={14} weight="bold" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export function LoadingState({
  rows = 5,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div
      aria-busy="true"
      className={cn("rounded-card border border-line bg-surface p-5 shadow-card", className)}
    >
      <SkeletonRows n={rows} />
    </div>
  );
}
