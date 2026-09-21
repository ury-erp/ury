import { Card, CardContent, CardHeader, CardTitle, CHART_COLORS } from "@ury/ui";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

export interface PieChartCardProps {
  title: string;
  data: Record<string, unknown>[];
  dataKey: string;
  nameKey: string;
  colors?: string[];
}

export function PieChartCard({ title, data, dataKey, nameKey, colors }: PieChartCardProps) {
  const palette = colors ?? CHART_COLORS;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </CardTitle>
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
              style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}
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
