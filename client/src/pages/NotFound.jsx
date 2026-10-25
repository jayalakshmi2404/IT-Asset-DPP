import React from 'react';
import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink-50 px-6 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-glow">404</p>
      <h1 className="mt-3 text-2xl font-bold text-white">This page does not exist</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-400">The link may be out of date, or the page may be outside your role.</p>
      <Link to="/dashboard" className="btn-primary mt-6">Go to dashboard</Link>
    </div>
  );
}
