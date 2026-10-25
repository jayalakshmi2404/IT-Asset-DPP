import React from 'react';
import Icon from '../common/Icon';

export default function Topbar({ onOpenMobile, title }) {
  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-white/[0.06] bg-ink-50/85 px-4 py-3 backdrop-blur lg:hidden">
      <button type="button" onClick={onOpenMobile} className="rounded-lg p-2 text-ink-600 hover:bg-white/[0.06]" aria-label="Open navigation menu">
        <Icon name="menu" />
      </button>
      <span className="text-sm font-semibold text-white">{title || 'IT Asset DPP'}</span>
    </header>
  );
}
