import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export function Button({
  children,
  variant = "primary",
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "quiet" | "outline" }) {
  return (
    <button
      className={cn(
        "inline-flex h-12 items-center justify-center rounded-full px-6 text-[15px] font-semibold transition duration-200 outline-none focus-visible:ring-2 focus-visible:ring-hof focus-visible:ring-offset-2 active:scale-[0.98] disabled:opacity-60",
        variant === "primary" && "bg-rausch text-white hover:bg-rausch-dark",
        variant === "quiet" && "bg-pearl text-hof hover:bg-line-soft",
        variant === "outline" && "border border-line bg-white text-hof hover:border-hof",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-card border border-line-soft bg-white shadow-card", className)}>{children}</div>;
}

export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="font-semibold text-hof">{label}</span>
      {children}
      {error && (
        <span role="alert" className="text-sm font-medium text-rausch-dark">
          {error}
        </span>
      )}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-12 rounded-input border border-line bg-white px-4 text-[15px] text-hof outline-none transition duration-200 placeholder:text-foggy/70 focus:border-hof focus-visible:ring-2 focus-visible:ring-hof/40",
        props.className
      )}
    />
  );
}

export function StatusPill({ status }: { status: string }) {
  const live = status === "ACTIVE";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        live ? "bg-babu/10 text-babu" : "bg-pearl text-foggy"
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", live ? "bg-babu" : "bg-foggy")} />
      {status}
    </span>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="grid place-items-center gap-2 rounded-card border border-dashed border-line bg-pearl/60 px-6 py-16 text-center">
      <p className="text-lg font-semibold text-hof">{title}</p>
      <p className="max-w-[52ch] text-sm leading-relaxed text-foggy">{body}</p>
    </div>
  );
}

export function SkeletonRows({ n = 5 }: { n?: number }) {
  return (
    <div className="grid gap-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-card bg-pearl" />
      ))}
    </div>
  );
}
