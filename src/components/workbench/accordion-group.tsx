import { cn } from '@/lib/utils';

interface AccordionGroupProps {
  title: string;
  icon?: React.ReactNode;
  collapsed?: boolean;
  children?: React.ReactNode;
}

export function AccordionGroup({
  title,
  icon,
  collapsed = false,
  children,
}: AccordionGroupProps) {
  if (collapsed) {
    return (
      <button
        type="button"
        aria-label={title}
        className={cn(
          'flex h-10 w-full items-center justify-center rounded-lg text-[#3c3c43] transition-colors',
          'hover:bg-[#e5e5ea] hover:text-[#000000] dark:hover:bg-white/10',
        )}
      >
        {icon}
      </button>
    );
  }

  return (
    <section className="flex flex-col">
      <div
        className={cn(
          'px-[10px] pb-[6px] pt-4 text-[11px] font-semibold uppercase tracking-[0.5px] text-[#8e8e93]',
        )}
      >
        {title}
      </div>
      <div className="flex flex-col gap-0">{children}</div>
    </section>
  );
}
