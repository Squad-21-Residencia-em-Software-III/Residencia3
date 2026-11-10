import type { ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Card } from "./Card";
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
  isActive = false,
  onClick,
  className,
}: MetricCardProps) {
  const isClickable = Boolean(onClick);

  return (
    <Card
      onClick={onClick}
      className={cn(
        metricCardVariants({ tone, isClickable, isActive }),
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className={metricValueVariants({ tone })}>{value}</div>
          <div className="mt-1 truncate text-xs font-semibold text-slate-500">
            {label} {isActive ? "• Ativo" : ""}
          </div>
          {subtitle && (
            <div className="mt-0.5 text-xs text-slate-400">{subtitle}</div>
          )}
        </div>
        {icon && <div className={metricIconVariants({ tone })}>{icon}</div>}
      </div>
      {trend && (
        <div className="mt-3 flex items-center gap-1.5 border-t border-slate-100 pt-3 text-xs">
          <span
            className={cn(
              "font-semibold",
              trend.isPositive ? "text-emerald-600" : "text-rose-600",
            )}
          >
            {trend.value}
          </span>
          <span className="text-slate-400">vs período anterior</span>
        </div>
      )}
    </Card>
  );
}
