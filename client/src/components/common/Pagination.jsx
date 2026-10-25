import React from 'react';

export default function Pagination({ page, totalPages, onChange, total, limit }) {
  if (totalPages <= 1) return null;
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <nav aria-label="Pagination" className="flex flex-col items-center justify-between gap-3 border-t border-white/[0.06] px-4 py-3 text-sm text-ink-400 sm:flex-row">
      <span>
        Showing <span className="font-medium text-ink-700">{from}</span>–<span className="font-medium text-ink-700">{to}</span> of{' '}
        <span className="font-medium text-ink-700">{total}</span>
      </span>
      <div className="flex items-center gap-2">
        <button type="button" className="btn-secondary px-3 py-1.5" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Previous
        </button>
        <span className="px-2 text-ink-400">
          Page {page} of {totalPages}
        </span>
        <button type="button" className="btn-secondary px-3 py-1.5" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
          Next
        </button>
      </div>
    </nav>
  );
}
