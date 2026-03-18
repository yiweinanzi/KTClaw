import { cn } from '@/lib/utils';
import type { SettingsNavGroup, SettingsSectionId } from './settings-shell-data';

type SettingsNavProps = {
  groups: SettingsNavGroup[];
  activeItemId: SettingsSectionId;
  onChange: (id: SettingsSectionId) => void;
};

export function SettingsNav({ groups, activeItemId, onChange }: SettingsNavProps) {
  return (
    <nav className="w-full max-w-[220px] shrink-0 border-r border-black/[0.06] bg-[#fcfcfc] px-3 py-7">
      <div className="flex flex-col gap-5">
        {groups.map((group) => (
          <section key={group.id} className="flex flex-col">
            <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8e8e93]">
              {group.label}
            </div>
            <div className="space-y-1">
              {group.items.map((item) => {
                const active = item.id === activeItemId;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onChange(item.id)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'w-full rounded-xl px-3 py-2 text-left text-[13px] transition-all',
                      active
                        ? 'bg-[#e5e5ea] font-medium text-[#111827]'
                        : 'text-[#111827] hover:bg-[#eef0f3]',
                    )}
                  >
                    <div>{item.label}</div>
                    <div className="mt-1 text-[11px] font-normal leading-5 text-[#8e8e93]">
                      {item.summary}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </nav>
  );
}
