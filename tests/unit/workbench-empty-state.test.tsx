import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WorkbenchEmptyState } from '@/components/workbench/workbench-empty-state';
import { useGatewayStore } from '@/stores/gateway';

describe('WorkbenchEmptyState', () => {
  it('renders the premium hero and 2x2 suggestion cards', () => {
    useGatewayStore.setState({ status: { state: 'running', port: 18789 } });
    render(<WorkbenchEmptyState />);

    expect(screen.getByRole('heading')).toBeInTheDocument();

    const buttons = screen.getAllByRole('button');
    const suggestionCards = buttons.slice(-4);
    expect(suggestionCards).toHaveLength(4);
    for (const card of suggestionCards) {
      expect(card).not.toBeDisabled();
    }
  });

  it('shows a disconnected hint and disables suggestion cards when gateway is down', () => {
    useGatewayStore.setState({ status: { state: 'stopped', port: 18789 } });
    render(<WorkbenchEmptyState />);

    expect(screen.getByText(/Gateway disconnected/)).toBeInTheDocument();

    const buttons = screen.getAllByRole('button');
    const suggestionCards = buttons.slice(-4);
    expect(suggestionCards).toHaveLength(4);
    for (const card of suggestionCards) {
      expect(card).toBeDisabled();
    }
  });
});
