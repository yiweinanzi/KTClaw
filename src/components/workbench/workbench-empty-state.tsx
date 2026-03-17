import { useTranslation } from 'react-i18next';

type WorkbenchEmptyStateProps = {
  agentName: string;
};

export function WorkbenchEmptyState({ agentName }: WorkbenchEmptyStateProps) {
  const { t } = useTranslation('chat');

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-8 py-12 text-center">
      <div className="mb-8 flex h-24 w-24 items-center justify-center rounded-full border-[5px] border-foreground/85 text-4xl font-semibold text-foreground/85">
        K
      </div>
      <h1 className="text-[64px] font-semibold tracking-[-0.05em] text-foreground">
        {agentName}
      </h1>
      <p className="mt-6 max-w-3xl text-[18px] leading-9 text-muted-foreground">
        {t('workbench.hero.subtitle')}
      </p>
      <div className="mt-10 w-full max-w-xl rounded-[30px] border border-black/5 bg-white/85 p-7 text-left shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
        <p className="text-[18px] font-semibold text-foreground">{t('workbench.quickConfig')}</p>
        <p className="mt-3 text-[15px] leading-8 text-muted-foreground">
          {t('workbench.quickConfigDescription')}
        </p>
      </div>
    </div>
  );
}
