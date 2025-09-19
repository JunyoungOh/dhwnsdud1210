// src/components/ui/Badge.jsx
import React from "react";

export default function Badge({ tone="neutral", children, className="" }) {
  const map = {
    neutral:"bg-gray-100 text-gray-700",
    success:"bg-emerald-100 text-emerald-700",
    warning:"bg-amber-100 text-amber-800",
    info:"bg-blue-100 text-blue-700",
    danger:"bg-red-100 text-red-700",
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${map[tone]} ${className}`}>{children}</span>;
}
