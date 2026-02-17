import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { DashboardData } from '../../lib/dashboard-api';
import { DashboardFilters } from '../../pages/Dashboard';
import GenericChart from './charts/GenericChart';

interface Props {
    data: DashboardData | null;
    loading: boolean;
    filters: DashboardFilters;
}

const BestSellingItems: React.FC<Props> = ({ data: initialData, filters: globalFilters }) => {
    // BestSellingItems expects DashboardData object in data prop but uses data.bestSellingItems
    // GenericChart will handle fetching based on 'best_selling_items' key.

    // Initial data passed in might be null or DashboardData.
    const initialItems = initialData?.bestSellingItems || [];

    return (
        <GenericChart
            title="Top 10 Best Selling Items"
            initialData={initialItems}
            globalFilters={globalFilters}
            apiSection="best_selling_items"
            mapData={(data) => (data || [])
                .slice(0, 10)
                .map((item: any) => ({
                    name: item.item_name,
                    value: item.total_revenue
                }))
            }
            renderChart={(chartData) => (
                <BarChart
                    data={chartData}
                    layout="vertical"
                    margin={{ left: 0, right: 20, bottom: 20 }}
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
                        formatter={(value: any) => `₹${(value || 0).toLocaleString()}`}
                    />
                    <Bar
                        dataKey="value"
                        fill="#f59e0b"
                        radius={[0, 4, 4, 0]}
                        barSize={32}
                        name="Revenue"
                    />
                </BarChart>
            )}
        />
    );
};

export default BestSellingItems;
