import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

// Dark-theme defaults shared by every chart in the app.
ChartJS.defaults.color = '#a2acc8';
ChartJS.defaults.borderColor = 'rgba(255,255,255,0.06)';
ChartJS.defaults.font.family = "Inter, ui-sans-serif, system-ui, sans-serif";
ChartJS.defaults.plugins.tooltip.backgroundColor = '#0c1426';
ChartJS.defaults.plugins.tooltip.borderColor = 'rgba(59,130,246,0.35)';
ChartJS.defaults.plugins.tooltip.borderWidth = 1;
ChartJS.defaults.plugins.legend.labels.boxWidth = 10;

export const PALETTE = ['#3b66f5', '#22d3ee', '#8b5cf6', '#f59e0b', '#f43f5e', '#10b981', '#64748b'];

export default ChartJS;
