import type { ReactNode } from "react";

/** Eyebrow + title row at the top of every page, actions on the right. */
export function PageHeader({
  eyebrow,
  title,
  sub,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h1 className="break-words sm:!text-[28px]">{title}</h1>
        {sub && <p className="mt-1 text-[13px] text-ink-65">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Centered message for empty lists, with optional actions. */
export function EmptyState({
  icon,
  title,
  text,
  children,
}: {
  icon?: ReactNode;
  title: string;
  text?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="card px-6 py-12 text-center">
      {icon && (
        <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-accent-soft text-accent [&_svg]:h-5 [&_svg]:w-5">
          {icon}
        </div>
      )}
      <h2>{title}</h2>
      {text && <p className="mx-auto mt-1 max-w-md text-[13px] text-ink-65">{text}</p>}
      {children && (
        <div className="mt-5 flex flex-wrap justify-center gap-2">{children}</div>
      )}
    </div>
  );
}

/** Pulsing placeholder blocks while a client page loads. */
export function LoadingBlocks({ rows = 3 }: { rows?: number }) {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-10 w-56" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton h-24" />
      ))}
    </div>
  );
}
