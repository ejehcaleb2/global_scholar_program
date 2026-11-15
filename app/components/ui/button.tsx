import type { ComponentProps, ReactNode } from "react";
import { Loader2 } from "lucide-react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
type ButtonSize = "sm" | "md";

type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingLabel?: string;
  children?: ReactNode;
};

const variants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-white hover:opacity-90",
  secondary: "border border-border bg-background text-text hover:bg-surface-alt",
  ghost: "text-primary hover:bg-surface-alt",
  destructive: "bg-text text-white hover:opacity-90",
};

const sizes: Record<ButtonSize, string> = {
  sm: "min-h-10 px-3 text-sm",
  md: "min-h-11 px-4 text-base",
};

export function Button({
  variant,
  size,
  loading = false,
  loadingLabel = "Loading",
  disabled = false,
  type = "button",
  className = "",
  children,
  ...props
}: ButtonProps) {
  const variantClass = variant ? variants[variant] : "";
  const sizeClass = size ? sizes[size] : "";

  return (
    <button
      {...props}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`relative inline-flex items-center justify-center transition-[color,background-color,border-color,opacity,transform] duration-200 ease-out motion-safe:active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100 ${variantClass} ${sizeClass} ${className}`.trim()}
    >
      <span className={loading ? "inline-flex items-center gap-[inherit] opacity-0" : "contents"}>{children}</span>
      {loading && <Loader2 className="absolute inset-0 m-auto motion-safe:animate-spin" size={16} aria-hidden="true" />}
      {loading && <span className="sr-only" role="status" aria-live="polite">{loadingLabel}</span>}
    </button>
  );
}