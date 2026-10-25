import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { navigationFor } from '../../auth/navigation';
import { ROLE_LABELS } from '../../utils/format';
import Icon from '../common/Icon';

function isActive(item, location) {
  const [path, query] = item.to.split('?');
  if (location.pathname !== path && !location.pathname.startsWith(`${path}/`)) return false;
  if (!query) return location.pathname === path || location.pathname.startsWith(`${path}/`);
  const want = new URLSearchParams(query);
  const have = new URLSearchParams(location.search);
  return [...want.entries()].every(([k, v]) => have.get(k) === v);
}

export default function Sidebar({ mobileOpen, onCloseMobile }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const items = navigationFor(user);

  const content = (
    <div className="flex h-full flex-col bg-ink-950/95 text-ink-100">
      <div className="flex items-center gap-3 px-5 py-6">
        <img src="/assets/logo-mark.svg" alt="" className="h-10 w-10" />
        <div>
          <div className="text-sm font-bold tracking-tight text-white">IT Asset DPP</div>
          <div className="text-[11px] text-cyan-glow/80">Digital Product Passport</div>
        </div>
      </div>

      <nav aria-label="Main" className="flex-1 space-y-1 overflow-y-auto px-3">
        {items.map((item) => {
          const active = isActive(item, location);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onCloseMobile}
              aria-current={active ? 'page' : undefined}
              className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active ? 'bg-brand-600/90 text-white shadow-glow' : 'text-ink-400 hover:bg-white/[0.04] hover:text-white'
              }`}
            >
              <Icon name={item.icon} className="h-[18px] w-[18px] shrink-0" />
              <span className="truncate">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-white/[0.06] p-3">
        <div className="mb-2 flex items-center gap-3 rounded-lg bg-white/[0.03] px-3 py-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-violet-glow text-sm font-semibold text-white" aria-hidden="true">
            {(user?.name || '?').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-white">{user?.name}</div>
            <div className="text-xs text-ink-400">{ROLE_LABELS[user?.role] || user?.role}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink-400 transition-colors hover:bg-white/[0.04] hover:text-white"
        >
          <Icon name="logout" className="h-[18px] w-[18px]" />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden w-64 shrink-0 border-r border-white/[0.06] lg:block">{content}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/70" onClick={onCloseMobile} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85%] shadow-popover">{content}</div>
        </div>
      )}
    </>
  );
}
