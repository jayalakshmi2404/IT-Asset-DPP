import React from 'react';
import { Doughnut } from 'react-chartjs-2';
import './chartSetup';
import { PALETTE } from './chartSetup';
import EmptyState from '../common/EmptyState';

export default function AssetStatusChart({ active = 0, maintenance = 0, disposed = 0 }) {
  const total = active + maintenance + disposed;
  if (total === 0) {
    return <EmptyState icon="◎" title="No assets in scope yet" description="Status distribution appears once assets are registered." />;
  }
  return (
    <Doughnut
      data={{
        labels: ['Active', 'Under maintenance', 'Disposed'],
        datasets: [{ data: [active, maintenance, disposed], backgroundColor: [PALETTE[1], PALETTE[3], PALETTE[4]], borderColor: '#0c1426', borderWidth: 3 }],
      }}
      options={{ cutout: '68%', plugins: { legend: { position: 'bottom' } } }}
      aria-label={`Status distribution: ${active} active, ${maintenance} under maintenance, ${disposed} disposed`}
      role="img"
    />
  );
}
