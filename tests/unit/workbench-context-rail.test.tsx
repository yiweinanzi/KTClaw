import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ContextRail } from '@/components/workbench/context-rail';
import { FALLBACK_WORKBENCH_DATA } from '@/components/workbench/workbench-data';
import { useSettingsStore } from '@/stores/settings';

describe('ContextRail', () => {
  beforeEach(() => {
    useSettingsStore.setState({ contextRailCollapsed: false });
  });

  it('renders expanded cards by default', () => {
    render(<ContextRail />);

    expect(screen.getByText('上下文')).toBeInTheDocument();
    expect(screen.getByText('当前任务')).toBeInTheDocument();
    expect(screen.getByText(FALLBACK_WORKBENCH_DATA.team.description)).toBeInTheDocument();
    expect(screen.getByText((content) => content.includes(FALLBACK_WORKBENCH_DATA.channel.name))).toBeInTheDocument();
    expect(screen.getByText((content) => content.includes(FALLBACK_WORKBENCH_DATA.task.title))).toBeInTheDocument();
  });

  it('renders collapsed handle and expands when clicked', () => {
    useSettingsStore.getState().setContextRailCollapsed(true);
    render(<ContextRail />);

    expect(screen.queryByText('上下文')).not.toBeInTheDocument();

    const expandButton = screen.getByRole('button', { name: '展开上下文栏 Expand context rail' });
    fireEvent.click(expandButton);

    expect(useSettingsStore.getState().contextRailCollapsed).toBe(false);
    expect(screen.getByText('上下文')).toBeInTheDocument();
  });
});
