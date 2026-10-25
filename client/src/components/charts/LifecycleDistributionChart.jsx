import React from 'react';
import { Bar } from 'react-chartjs-2';
import './chartSetup';
import { PALETTE } from './chartSetup';
import EmptyState from '../common/EmptyState';
import { EVENT_TYPE_LABELS } from '../../utils/format';

export default function LifecycleDistributionChart({ distribution = [] }) {
  const total = distribution.reduce((sum, d) => sum + d.count, 0);
  if (total === 0) {
    return <EmptyState icon="⟲" title="No lifecycle events yet" description="Event distribution appears once lifecycle events are recorded." />;
  }
  return (
    <Bar
      data={{
        labels: distribution.map((d) => EVENT_TYPE_LABELS[d.eventType] || d.eventType),
        datasets: [{ label: 'Events', data: distribution.map((d) => d.count), backgroundColor: PALETTE, borderRadius: 6, maxBarThickness: 36 }],
      }}
      options={{ plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }}
      aria-label={`Lifecycle events: ${distribution.map((d) => `${EVENT_TYPE_LABELS[d.eventType]} ${d.count}`).join(', ')}`}
      role="img"
    />
  );
}
