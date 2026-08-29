import { Card, CardContent, CardHeader, CardTitle } from "@ury/ui";
import { formatCompactCurrency } from "@ury/core";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_COLORS } from "../../../lib/chartColors";

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
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={xKey} />
            <YAxis tickFormatter={(value) => formatCompactCurrency(Number(value))} width={64} />
            <Tooltip />
            {yKeys.length > 1 && <Legend />}
            {yKeys.map((key, index) => (
              <Bar
                key={key}
                dataKey={key}
                name={labels?.[key] ?? key}
                fill={palette[index % palette.length]}
                maxBarSize={56}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
