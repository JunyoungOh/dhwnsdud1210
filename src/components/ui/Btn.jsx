// src/components/ui/Btn.jsx
import React from "react";

export default function Btn({
  as: Comp = "button",
  variant = "primary",
  size = "md",
  className = "",
  ...props
}) {
  const base =
    "inline-flex items-center justify-center rounded-xl font-medium transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed";
  const sizes = {
    xs: "h-7 px-3 text-xs",
    sm: "h-8 px-3 text-sm",
    md: "h-10 px-4",
    lg: "h-12 px-6 text-base",
  };
  const tones = {
    primary:
      "bg-slate-900 text-white shadow-sm hover:bg-slate-800 focus:ring-slate-500",
    ghost:
      "bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 focus:ring-slate-200",
    subtle:
      "bg-slate-100/70 text-slate-700 hover:bg-slate-100 focus:ring-slate-200",
    danger:
      "bg-rose-500 text-white hover:bg-rose-600 focus:ring-rose-400",
    success:
      "bg-emerald-500 text-white hover:bg-emerald-600 focus:ring-emerald-400",
    warning:
      "bg-amber-400 text-white hover:bg-amber-500 focus:ring-amber-300",
    outline:
      "bg-transparent border border-slate-300 text-slate-700 hover:bg-slate-50 focus:ring-slate-200",
  };

  const toneClass = tones[variant] || tones.primary;
  const sizeClass = sizes[size] || sizes.md;

  return <Comp className={`${base} ${sizeClass} ${toneClass} ${className}`} {...props} />;
}
