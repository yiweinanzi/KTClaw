/**
 * Workbench Sidebar Density Test
 * Verifies that the sidebar aligns with Frame 1/2 approved density and styling
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { Sidebar } from '@/components/layout/Sidebar';

describe('Workbench Sidebar Density', () => {
  it('renders sidebar with approved narrower width when expanded', () => {
    render(
      <BrowserRouter>
        <Sidebar />
      </BrowserRouter>
    );

    const sidebar = screen.getByRole('complementary');
    // Design board uses ~240px, not 390px
    expect(sidebar).toHaveClass('w-[240px]');
  });

  it('renders header buttons without heavy borders', () => {
    render(
      <BrowserRouter>
        <Sidebar />
      </BrowserRouter>
    );

    // Header buttons should be simpler, not heavily bordered cards
    const toggleButton = screen.getByRole('button', { name: /toggle sidebar/i });
    expect(toggleButton).not.toHaveClass('border');
  });

  it('renders session items as flat list items, not large cards', () => {
    render(
      <BrowserRouter>
        <Sidebar />
      </BrowserRouter>
    );

    // Session items should be flatter, not rounded-[24px] cards
    const sessionButtons = screen.queryAllByRole('button');
    const sessionButton = sessionButtons.find(btn =>
      btn.textContent?.includes('KTClaw') || btn.textContent?.includes('沉思')
    );

    if (sessionButton) {
      expect(sessionButton).not.toHaveClass('rounded-[24px]');
    }
  });
});
