import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AccordionGroupProps {
  title: string;
  icon: React.ReactNode;
  meta?: string;
  collapsed?: boolean;
  defaultOpen?: boolean;
  children?: React.ReactNode;
}

export function AccordionGroup({
  title,
  icon,
  meta,
  collapsed = false,
  defaultOpen = true,
  children,
}: AccordionGroupProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (collapsed) {
    return (
      <button
        type="button"
        aria-label={title}
        className={cn(
          'flex h-11 w-full items-center justify-center rounded-2xl border border-black/5 bg-white/70 text-muted-foreground shadow-sm transition-colors',
          'hover:bg-white hover:text-foreground dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10',
        )}
      >
        {icon}
      </button>
    );
  }

  return (
    <section className="overflow-hidden rounded-[26px] border border-black/5 bg-white/55 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'flex w-full items-center gap-3 px-4 py-3 text-left text-[14px] font-semibold',
          'text-foreground transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.05]',
        )}
      >
        <span className="flex shrink-0 items-center justify-center text-muted-foreground">{icon}</span>
        <span className="flex-1">{title}</span>
        {meta ? (
          <span className="text-[11px] font-medium tracking-wide text-muted-foreground/90">
            {meta}
          </span>
        ) : null}
        <ChevronDown className={cn('h-4 w-4 transition-transform', open ? 'rotate-180' : 'rotate-0')} />
      </button>
      {open && <div className="space-y-2 px-3 pb-3 pt-0">{children}</div>}
    </section>
  );
}
