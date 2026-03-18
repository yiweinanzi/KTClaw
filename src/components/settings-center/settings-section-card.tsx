import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type SettingsSectionCardProps = {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

export function SettingsSectionCard({
  title,
  description,
  children,
  className,
}: SettingsSectionCardProps) {
  return (
    <section
      className={cn(
        'rounded-[18px] border border-black/[0.06] bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.06)]',
        className,
      )}
    >
      <header className="space-y-1.5">
        <h2 className="text-[15px] font-semibold text-[#111827]">{title}</h2>
        {description ? (
          <p className="text-[13px] leading-6 text-[#667085]">{description}</p>
        ) : null}
      </header>
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}
