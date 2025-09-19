// src/components/ui/Btn.jsx
import React from "react";

export default function Btn({
  as:Comp="button",
  variant="primary",
  size="md",
  className="",
  ...props
}) {
  const base   = "inline-flex items-center justify-center rounded-xl font-medium transition-all focus:outline-none focus:ring-2";
  const sizes  = { sm:"h-8 px-3 text-sm", md:"h-10 px-4", lg:"h-12 px-5 text-base" };
  const tones  = {
    primary:"bg-amber-500 text-white hover:bg-amber-600 focus:ring-amber-400/60 shadow-sm",
    ghost:"bg-white text-gray-700 hover:bg-gray-50 border border-gray-200",
    danger:"bg-red-500 text-white hover:bg-red-600 focus:ring-red-400/60",
  };
  return <Comp className={`${base} ${sizes[size]} ${tones[variant]} ${className}`} {...props} />;
}
