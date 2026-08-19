import { Card, CardContent, CardHeader, CardTitle } from "@ury/ui";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const DEFAULT_COLORS = ["#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#0ea5e9", "#14b8a6"];

export interface PieChartCardProps {
  title: string;
  data: Record<string, unknown>[];
  dataKey: string;
  nameKey: string;
  colors?: string[];
}

export function PieChartCard({ title, data, dataKey, nameKey, colors }: PieChartCardProps) {
  const palette = colors ?? DEFAULT_COLORS;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={data}
              dataKey={dataKey}
              nameKey={nameKey}
              innerRadius={65}
              outerRadius={100}
              startAngle={0}
              endAngle={360}
              isAnimationActive={false}
              label={({ percent }) => `${((percent ?? 0) * 100).toFixed(0)}%`}
            >
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={palette[index % palette.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
