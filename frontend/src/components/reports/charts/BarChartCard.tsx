import { Card, CardContent, CardHeader, CardTitle } from @ury/ui;
import { formatCompactCurrency } from @ury/core;
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from recharts;
import { CHART_COLORS } from ../../../lib/chartColors;

export interface BarChartCardProps {
  title: string;
  data: Record<string, unknown>[];
  xKey: string;
  yKeys: string[];
  colors?: string[];
  labels?: Record<string, string>;
}

export function BarChartCard({ title, data, xKey, yKeys, colors, labels }: BarChartCardProps) {
  const palette = colors ?? CHART_COLORS;

  return (
    <Card>
      <CardHeader>
        <CardTitle className=text-base>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width=100% height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray=3
