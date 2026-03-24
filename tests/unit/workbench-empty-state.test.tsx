import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkbenchEmptyState } from '@/components/workbench/workbench-empty-state';
import { useChatStore } from '@/stores/chat';
import { useGatewayStore } from '@/stores/gateway';

describe('WorkbenchEmptyState', () => {
  const sendMessageMock = vi.fn();

  beforeEach(() => {
    sendMessageMock.mockReset();
    useChatStore.setState({ sendMessage: sendMessageMock });
  });

  it('renders a quick action toolbar with persistent selected-action controls and 2x2 suggestion cards', () => {
    useGatewayStore.setState({ status: { state: 'running', port: 18789 } });
    render(<WorkbenchEmptyState />);

    expect(screen.getByRole('heading')).toBeInTheDocument();

    const quickActionBar = screen.getByRole('toolbar', { name: /quick action bar/i });
    expect(quickActionBar).toBeInTheDocument();
    expect(within(quickActionBar).getByText(/ready to run/i)).toBeInTheDocument();
    expect(within(quickActionBar).getByRole('button', { name: /use selected action/i })).toBeEnabled();

    const quickActionButtons = within(quickActionBar).getAllByRole('button', { name: /quick action:/i });
    expect(quickActionButtons).toHaveLength(6);
    expect(quickActionButtons[0]).toHaveAttribute('aria-pressed', 'true');

    const buttons = screen.getAllByRole('button');
    const suggestionCards = buttons.slice(-4);
    expect(suggestionCards).toHaveLength(4);
    for (const card of suggestionCards) {
      expect(card).not.toBeDisabled();
    }
  });

  it('keeps one-click quick action affordances while allowing rerun from persistent selected action', () => {
    useGatewayStore.setState({ status: { state: 'running', port: 18789 } });
    render(<WorkbenchEmptyState />);

    const quickActionBar = screen.getByRole('toolbar', { name: /quick action bar/i });
    const quickActionButtons = within(quickActionBar).getAllByRole('button', { name: /quick action:/i });
    const runSelectedButton = within(quickActionBar).getByRole('button', { name: /use selected action/i });

    fireEvent.click(quickActionButtons[1]);
    expect(quickActionButtons[1]).toHaveAttribute('aria-pressed', 'true');

    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    const firstPrompt = sendMessageMock.mock.calls[0]?.[0];
    expect(typeof firstPrompt).toBe('string');
    expect((firstPrompt as string).length).toBeGreaterThan(0);

    fireEvent.click(runSelectedButton);
    expect(sendMessageMock).toHaveBeenCalledTimes(2);
    expect(sendMessageMock.mock.calls[1]?.[0]).toBe(firstPrompt);
  });

  it('shows a disconnected hint and disables suggestion cards when gateway is down', () => {
    useGatewayStore.setState({ status: { state: 'stopped', port: 18789 } });
    render(<WorkbenchEmptyState />);

    expect(screen.getByText(/Gateway disconnected/)).toBeInTheDocument();

    const quickActionBar = screen.getByRole('toolbar', { name: /quick action bar/i });
    const quickActionButtons = within(quickActionBar).getAllByRole('button', { name: /quick action:/i });
    const runSelectedButton = within(quickActionBar).getByRole('button', { name: /use selected action/i });
    expect(runSelectedButton).toBeDisabled();
    for (const actionButton of quickActionButtons) {
      expect(actionButton).toBeDisabled();
    }

    const buttons = screen.getAllByRole('button');
    const suggestionCards = buttons.slice(-4);
    expect(suggestionCards).toHaveLength(4);
    for (const card of suggestionCards) {
      expect(card).toBeDisabled();
    }
  });
});
