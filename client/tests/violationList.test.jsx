import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ViolationList from '../src/components/verification/ViolationList';

describe('ViolationList', () => {
  it('renders nothing when there are no violations', () => {
    const { container } = render(<ViolationList violations={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the reason, the asset, the event, the block and the diagnosis hints', () => {
    render(
      <ViolationList
        violations={[
          {
            blockIndex: 7,
            eventId: 'EVT-42',
            assetId: 'AST-1001',
            eventType: 'MAINTENANCE_START',
            reason: 'Event data does not match its recorded hash. Record was altered after creation.',
            diagnosis: ['The stored record has no metadata object.'],
          },
        ]}
      />
    );
    expect(screen.getByText(/does not match its recorded hash/)).toBeInTheDocument();
    expect(screen.getByText('AST-1001')).toBeInTheDocument();
    expect(screen.getByText('EVT-42')).toBeInTheDocument();
    expect(screen.getByText('#7')).toBeInTheDocument();
    expect(screen.getByText('MAINTENANCE_START')).toBeInTheDocument();
    expect(screen.getByText('The stored record has no metadata object.')).toBeInTheDocument();
    expect(screen.getByText(/not proof of tampering/)).toBeInTheDocument();
  });

  it('omits fields the server did not send and caps the number shown', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ reason: `Problem ${i}` }));
    render(<ViolationList violations={many} limit={10} />);
    expect(screen.getByText('Problem 0')).toBeInTheDocument();
    expect(screen.queryByText('Problem 10')).toBeNull();
    expect(screen.getByText('2 more not shown.')).toBeInTheDocument();
    expect(screen.queryByText('Ledger block')).toBeNull();
  });
});
