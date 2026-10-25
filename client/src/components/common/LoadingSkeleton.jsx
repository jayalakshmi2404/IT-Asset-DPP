import React from 'react';

export function TableSkeleton({ rows = 6, cols = 6 }) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.06]" aria-hidden="true">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 border-b border-white/[0.04] px-4 py-3 last:border-b-0">
          {Array.from({ length: cols }).map((__, c) => (
            <div key={c} className="skeleton h-4 flex-1 rounded" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="card p-5" aria-hidden="true">
      <div className="skeleton mb-3 h-3 w-24 rounded" />
      <div className="skeleton h-7 w-16 rounded" />
    </div>
  );
}
