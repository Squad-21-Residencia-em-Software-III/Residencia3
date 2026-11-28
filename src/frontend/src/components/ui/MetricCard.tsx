import type { ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Card, CLASSES_CARD } from "./Card";
import { cn } from "../../utils/cn";

const metricCardVariants = cva("p-5 transition-all duration-150", {
  variants: {
    tone: {
      primary: "",
      success: "",
      warning: "",
      danger: "",
      info: "",
      purple: "",
      neutral: "",
    },
    isClickable: {
      true: "cursor-pointer select-none hover:border-slate-300 hover:shadow-sm",
      false: "",
    },
    isActive: {
      true: "border-2 shadow-sm",
      false: "",
    },
  },
  compoundVariants: [
    { tone: "primary", isActive: true, className: "border-primary" },
    { tone: "success", isActive: true, className: "border-emerald-600" },
    { tone: "warning", isActive: true, className: "border-amber-600" },
    { tone: "danger", isActive: true, className: "border-rose-600" },
    { tone: "info", isActive: true, className: "border-blue-600" },
    { tone: "purple", isActive: true, className: "border-purple" },
    { tone: "neutral", isActive: true, className: "border-slate-400" },
  ],
  defaultVariants: {
    tone: "primary",
    isClickable: false,
    isActive: false,
  },
});

const metricValueVariants = cva(
  "font-display text-2xl leading-tight font-extrabold",
  {
    variants: {
      tone: {
        primary: "text-primary",
        success: "text-emerald-700",
        warning: "text-amber-700",
        danger: "text-rose-700",
        info: "text-blue-700",
        purple: "text-purple",
        neutral: "text-slate-800",
      },
    },
    defaultVariants: {
      tone: "primary",
    },
  },
);

const metricIconVariants = cva(
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
  {
    variants: {
      tone: {
        primary: "bg-blue-50 text-primary",
        success: "bg-emerald-50 text-emerald-700",
        warning: "bg-amber-50 text-amber-700",
        danger: "bg-rose-50 text-rose-700",
        info: "bg-blue-50 text-blue-700",
        purple: "bg-purple-bg text-purple",
        neutral: "bg-slate-100 text-slate-600",
      },
    },
    defaultVariants: {
      tone: "primary",
    },
  },
);

export type MetricTone = NonNullable<
  VariantProps<typeof metricCardVariants>["tone"]
>;

export interface MetricCardProps {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  tone?: MetricTone;
  subtitle?: ReactNode;
  trend?: {
    value: string;
    isPositive?: boolean;
  };
  isActive?: boolean;
  onClick?: () => void;
  className?: string;
}

export function MetricCard({
  label,
  value,
  icon,
  tone = "primary",
  subtitle,
  trend,
  isActive,
  onClick,
  className,
}: MetricCardProps) {
  const estilo = cn(metricCardVariants({ tone, isClickable: Boolean(onClick), isActive }), className);
  const conteudo = (
    <>
      <span className="flex items-center justify-between gap-3">
        <span className="min-w-0 flex-1">
          <span className={cn('block', metricValueVariants({ tone }))}>{value}</span>
          <span className="mt-1 block text-xs font-semibold text-text-muted">
            {label} {isActive && <span aria-hidden={onClick ? true : undefined}>· Ativo</span>}
          </span>
          {subtitle && (
            <span className="mt-0.5 block text-xs text-text-muted">{subtitle}</span>
          )}
        </span>
        {icon && <span className={metricIconVariants({ tone })} aria-hidden="true">{icon}</span>}
      </span>
      {trend && (
        <span className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-3 text-xs">
          <span
            className={cn(
              "font-semibold",
              trend.isPositive ? "text-emerald-600" : "text-rose-600",
            )}
          >
            {trend.value}
          </span>
          <span className="text-text-muted">vs período anterior</span>
        </span>
      )}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={isActive}
        className={cn(CLASSES_CARD, 'w-full text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary', estilo)}
      >
        {conteudo}
      </button>
    );
  }
  return <Card className={estilo}>{conteudo}</Card>;
}
