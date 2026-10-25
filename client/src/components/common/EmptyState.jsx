import React from 'react';

export default function EmptyState({ icon = '∅', title, description, actionLabel, onAction, actionTo }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.015] px-6 py-12 text-center">
      <div className="mb-3 text-3xl text-cyan-glow/70" aria-hidden="true">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-ink-800">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-400">{description}</p>}
      {actionLabel && onAction && (
        <button type="button" onClick={onAction} className="btn-primary mt-5">
          {actionLabel}
        </button>
      )}
      {actionLabel && actionTo && (
        <a href={actionTo} className="btn-primary mt-5">
          {actionLabel}
        </a>
      )}
    </div>
  );
}
