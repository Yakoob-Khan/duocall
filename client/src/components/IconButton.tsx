import type { ReactNode } from "react";

export type IconButtonVariant = "neutral" | "danger" | "hangup";

export interface IconButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant: IconButtonVariant;
  children: ReactNode;
}

export function IconButton({
  label,
  onClick,
  disabled,
  variant,
  children,
}: IconButtonProps) {
  const styles =
    variant === "hangup"
      ? "bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-500/20"
      : variant === "danger"
        ? "bg-rose-500/20 text-rose-200 hover:bg-rose-500/30 ring-1 ring-inset ring-rose-500/30"
        : "bg-slate-800 text-slate-100 hover:bg-slate-700 ring-1 ring-inset ring-slate-700";
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-14 w-14 items-center justify-center rounded-full transition ${styles} disabled:cursor-not-allowed disabled:opacity-40`}
    >
      {children}
    </button>
  );
}
