import React from 'react';
import { Bar } from 'react-chartjs-2';
import './chartSetup';
import { PALETTE } from './chartSetup';
import EmptyState from '../common/EmptyState';

export default function CategoryBarChart({ data = [], labelKey = 'category', valueKey = 'count', title = 'Distribution' }) {
  if (!data.length) {
    return <EmptyState icon="▥" title="No data yet" description={`${title} will appear once records exist in your scope.`} />;
  }
  const summary = data.map((d) => `${d[labelKey]}: ${d[valueKey]}`).join(', ');
  return (
    <Bar
      data={{
        labels: data.map((d) => d[labelKey]),
        datasets: [{ label: 'Assets', data: data.map((d) => d[valueKey]), backgroundColor: PALETTE[0], borderRadius: 6, maxBarThickness: 36 }],
      }}
      options={{ plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }}
      aria-label={`${title}: ${summary}`}
      role="img"
    />
  );
}
