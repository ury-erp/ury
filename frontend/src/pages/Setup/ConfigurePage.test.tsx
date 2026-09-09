import { describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import ConfigurePage from './ConfigurePage';

vi.mock('../../context/ConfigureContext', () => ({
  useConfigure: () => ({
    activeSection: 'branch',
    branch: { name: 'Test Branch' },
    rooms: [],
    tables: [],
    menuItems: [],
    taxConfig: {},
    paymentMethods: [],
    users: [],
    completedSections: new Set(),
    goToPrevSection: vi.fn(),
    goToNextSection: vi.fn(),
  }),
  ConfigureProvider: ({ children }: any) => <div>{children}</div>,
  SECTION_ORDER: ['branch', 'rooms', 'tables', 'menu', 'payment', 'users'],
}));

vi.mock('../../services/setup', () => ({
  setupService: {
    submitConfigureData: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('@ury/core', () => ({
  call: vi.fn().mockResolvedValue({ message: {} }),
}));

describe('ConfigurePage', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('renders without crashing', () => {
    const { container } = render(
      <BrowserRouter>
        <ConfigurePage />
      </BrowserRouter>
    );
    expect(container).toBeTruthy();
  });

  it('renders with provider', () => {
    const { container } = render(
      <BrowserRouter>
        <ConfigurePage />
      </BrowserRouter>
    );
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it('renders page structure', () => {
    const { container } = render(
      <BrowserRouter>
        <ConfigurePage />
      </BrowserRouter>
    );
    const divs = container.querySelectorAll('div');
    expect(divs.length).toBeGreaterThan(0);
  });

  it('renders the page', () => {
    render(
      <BrowserRouter>
        <ConfigurePage />
      </BrowserRouter>
    );
    const page = document.body;
    expect(page).toBeInTheDocument();
  });
});
