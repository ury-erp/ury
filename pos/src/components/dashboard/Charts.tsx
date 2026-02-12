import React, { useMemo } from 'react';
import {
    BarChart, Bar,
    PieChart, Pie,
    XAxis, YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    Cell
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { DashboardFilters } from '../../pages/Dashboard';

interface Props {
    data: any[];
    filters: DashboardFilters;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const Charts: React.FC<Props> = ({ data, filters }) => {
    const getVal = (row: any, key: string, index: number) => {
        if (typeof row === 'object' && !Array.isArray(row)) return row[key];
        return row[index];
    };

    const revenueTrendData = useMemo(() => {
        const trend: Record<string, number> = {};

        data.forEach(row => {
            if (parseInt(getVal(row, 'docstatus', 4)) !== 1) return;

            const dateStr = getVal(row, 'posting_date', 1);
            if (!dateStr) return;

            const date = new Date(dateStr);
            let groupKey = dateStr;

            if (filters.groupBy === 'monthly') {
                groupKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            } else if (filters.groupBy === 'weekly') {
                // Simple start of week (Sunday)
                const d = new Date(date);
                const day = d.getDay();
                const diff = d.getDate() - day;
                const startOfWeek = new Date(d.setDate(diff));
                groupKey = startOfWeek.toISOString().split('T')[0];
            }

            const total = parseFloat(getVal(row, 'grand_total', 2)) || 0;
            trend[groupKey] = (trend[groupKey] || 0) + total;
        });

        return Object.entries(trend)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [data, filters.groupBy]);

    const paymentModeData = useMemo(() => {
        const modes: Record<string, number> = {};

        data.forEach(row => {
            if (parseInt(getVal(row, 'docstatus', 4)) !== 1) return;

            const mode = getVal(row, 'mode_of_payment', 3) || 'Unspecified';
            const total = parseFloat(getVal(row, 'grand_total', 2)) || 0;
            modes[mode] = (modes[mode] || 0) + total;
        });

        return Object.entries(modes).map(([name, value]) => ({ name, value }));
    }, [data]);

    const topItemsData = useMemo(() => {
        const itemSales: Record<string, number> = {};

        data.forEach(row => {
            if (parseInt(getVal(row, 'docstatus', 4)) !== 1) return;

            const item = getVal(row, 'item_code', 5);
            const qty = parseFloat(getVal(row, 'qty', 6)) || 0;
            if (item && qty > 0) {
                itemSales[item] = (itemSales[item] || 0) + qty;
            }
        });

        return Object.entries(itemSales)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);
    }, [data]);

    return (
        <>
            <Card className="flex flex-col">
                <CardHeader>
                    <CardTitle className="text-lg font-semibold flex items-center justify-between">
                        Revenue Trend
                        <span className="text-xs font-normal text-gray-500 capitalize">Grouped by {filters.groupBy}</span>
                    </CardTitle>
                </CardHeader>
                <CardContent className="h-[350px] mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={revenueTrendData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis
                                dataKey="name"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                tick={{ fill: '#64748b' }}
                            />
                            <YAxis
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                tick={{ fill: '#64748b' }}
                                tickFormatter={(val) => `₹${val}`}
                            />
                            <Tooltip
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                formatter={(val: any) => [`₹${val.toLocaleString()}`, 'Revenue']}
                            />
                            <Bar
                                dataKey="value"
                                fill="#3b82f6"
                                radius={[4, 4, 0, 0]}
                                animationDuration={1500}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            <Card className="flex flex-col">
                <CardHeader>
                    <CardTitle className="text-lg font-semibold">Payment Mode Distribution</CardTitle>
                </CardHeader>
                <CardContent className="h-[350px] mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={paymentModeData}
                                innerRadius={60}
                                outerRadius={100}
                                paddingAngle={5}
                                dataKey="value"
                                animationDuration={1500}
                            >
                                {paymentModeData.map((_, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                formatter={(val: any) => [`₹${val.toLocaleString()}`, 'Amount']}
                            />
                            <Legend verticalAlign="bottom" height={36} />
                        </PieChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            <Card className="lg:col-span-2">
                <CardHeader>
                    <CardTitle className="text-lg font-semibold">Top 10 Selling Items</CardTitle>
                </CardHeader>
                <CardContent className="h-[400px] mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={topItemsData}
                            layout="vertical"
                            margin={{ left: 40, right: 20 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                            <XAxis type="number" hide />
                            <YAxis
                                type="category"
                                dataKey="name"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                tick={{ fill: '#64748b' }}
                                width={120}
                            />
                            <Tooltip
                                cursor={{ fill: '#f8fafc' }}
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                formatter={(val: any) => [val, 'Qty Sold']}
                            />
                            <Bar
                                dataKey="value"
                                fill="#10b981"
                                radius={[0, 4, 4, 0]}
                                barSize={24}
                                animationDuration={1500}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
        </>
    );
};

export default Charts;
