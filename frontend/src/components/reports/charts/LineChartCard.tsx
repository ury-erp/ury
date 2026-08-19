import { Card, CardContent, CardHeader, CardTitle } from "@ury/ui";
import { formatCompactCurrency } from "@ury/core";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const DEFAULT_COLORS = ["#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#0ea5e9", "#14b8a6"];

export interface LineChartCardProps {
  title: string;
  data: Record<string, unknown>[];
  xKey: string;
  yKeys: string[];
  colors?: string[];
  labels?: Record<string, string>;
}

export function LineChartCard({ title, data, xKey, yKeys, colors, labels }: LineChartCardProps) {
  const palette = colors ?? DEFAULT_COLORS;
  const showDots = data.length > 0 && data.length < 20;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={xKey} />
            <YAxis
              domain={[(dataMin: number) => Math.max(0, dataMin * 0.9), (dataMax: number) => dataMax * 1.05]}
              tickFormatter={(value) => formatCompactCurrency(Number(value))}
              width={64}
            />
            <Tooltip />
            {yKeys.length > 1 && <Legend />}
            {yKeys.map((key, index) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                name={labels?.[key] ?? key}
                stroke={palette[index % palette.length]}
                strokeWidth={2}
                dot={showDots}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
