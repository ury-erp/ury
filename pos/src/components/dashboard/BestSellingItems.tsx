import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { DashboardData } from '../../lib/dashboard-api';

interface Props {
    data: DashboardData | null;
    loading: boolean;
}

const BestSellingItems: React.FC<Props> = ({ data, loading }) => {
    if (loading) return <div>Loading...</div>;

    const items = (data?.bestSellingItems || [])
        .slice(0, 10)
        .map((item: any) => ({
            name: item.item_name,
            value: item.total_revenue
        }));

    return (
        <Card className="mt-6">
            <CardHeader>
                <CardTitle>Top 10 Best Selling Items (Revenue)</CardTitle>
            </CardHeader>
            <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                        data={items}
                        layout="vertical"
                        margin={{ left: 20, right: 20, bottom: 20 }}
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
                            width={150}
                        />
                        <Tooltip
                            cursor={{ fill: '#f8fafc' }}
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                            formatter={(value: any) => `₹${value.toLocaleString()}`}
                        />
                        <Bar
                            dataKey="value"
                            fill="#f59e0b"
                            radius={[0, 4, 4, 0]}
                            barSize={20}
                            name="Revenue"
                        />
                    </BarChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
};

export default BestSellingItems;
