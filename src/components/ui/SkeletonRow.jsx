// src/components/ui/SkeletonRow.jsx
import React from "react";
export default function SkeletonRow(){
  return (
    <div className="animate-pulse flex items-center gap-3 py-2">
      <div className="h-4 w-24 rounded bg-gray-200" />
      <div className="h-4 w-40 rounded bg-gray-200" />
      <div className="h-4 w-16 rounded bg-gray-200 ml-auto" />
    </div>
  );
}
