import React, { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';

// Sidebar made of collapsible groups, each holding sub-tabs.
// groups: [{ id, label, icon, hint?, items: [{ id, label, icon, badge? }] }]
// A group with a single item renders as a plain link. The group that holds the open tab is always expanded.
const SidebarNav = ({ groups, activeTab, onSelect }) => {
  const groupOf = (tab) => groups.find((g) => g.items.some((i) => i.id === tab))?.id;
  const [open, setOpen] = useState(() => new Set([groupOf(activeTab)].filter(Boolean)));

  // Opening a tab from elsewhere (a notification link, the browser hash) expands the group that owns it.
  useEffect(() => {
    const id = groupOf(activeTab);
    if (id) setOpen((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id) => setOpen((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const linkCls = (active) => `w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2a5cac] ${active ? 'bg-[#2a5cac] text-white' : 'text-[#3b4a5c] hover:bg-[#2a5cac]/10'}`;
  const badge = (n) => (n > 0 ? <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-black leading-none text-white shrink-0">{n}</span> : null);

  return (
    <nav aria-label="Main menu" className="space-y-1">
      {groups.filter((g) => g.items.length).map((g) => {
        const GroupIcon = g.icon;
        if (g.items.length === 1) {
          const it = g.items[0]; const Icon = it.icon || GroupIcon;
          return (
            <button key={g.id} type="button" onClick={() => onSelect(it.id)} aria-current={activeTab === it.id ? 'page' : undefined} className={linkCls(activeTab === it.id)}>
              <Icon className="h-4 w-4" /><span className="flex-1 text-left">{it.label}</span>{badge(it.badge)}
            </button>
          );
        }
        const isOpen = open.has(g.id);
        const holdsActive = g.items.some((i) => i.id === activeTab);
        const groupBadge = g.items.reduce((n, i) => n + (i.badge || 0), 0);
        return (
          <div key={g.id}>
            <button type="button" onClick={() => toggle(g.id)} aria-expanded={isOpen} aria-controls={`nav-${g.id}`} title={g.hint}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-black transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2a5cac] ${holdsActive ? 'text-[#2a5cac] bg-[#2a5cac]/10' : 'text-[#1b2837] hover:bg-[#2a5cac]/10'}`}>
              <GroupIcon className="h-4 w-4" />
              <span className="flex-1 text-left">{g.label}</span>
              {!isOpen && badge(groupBadge)}
              <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
              <div id={`nav-${g.id}`} className="ms-4 mt-1 space-y-0.5 border-s border-[#e3e7e7] ps-2 animate-[ui-fade_.18s_ease-out]">
                {g.items.map((it) => {
                  const Icon = it.icon;
                  return (
                    <button key={it.id} type="button" onClick={() => onSelect(it.id)} aria-current={activeTab === it.id ? 'page' : undefined} className={linkCls(activeTab === it.id)}>
                      {Icon && <Icon className="h-3.5 w-3.5" />}<span className="flex-1 text-left">{it.label}</span>{badge(it.badge)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
};

export default SidebarNav;
