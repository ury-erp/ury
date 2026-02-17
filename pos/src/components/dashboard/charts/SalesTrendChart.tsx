import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { DashboardFilters } from '../../../pages/Dashboard';
import GenericChart from './GenericChart';

interface Props {
    initialData: any[];
    globalFilters: DashboardFilters;
}

const SalesTrendChart: React.FC<Props> = ({ initialData, globalFilters }) => {
    return (
        <GenericChart
            title="Sales Trend"
            initialData={initialData}
            globalFilters={globalFilters}
            apiSection="daywise_sales"
            mapData={(data) => data?.map((item: any) => ({
                name: item.posting_date,
                value: item.total_sales
            })) || []}
            renderChart={(chartData) => (
                <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis
                        dataKey="name"
                        tickFormatter={(val) => {
                            const d = new Date(val);
                            return `${d.getDate()}/${d.getMonth() + 1}`;
                        }}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#94a3b8', fontSize: 12 }}
                        dy={10}
                    />
                    <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#94a3b8', fontSize: 12 }}
                    />
                    <Tooltip
                        cursor={{ fill: '#f8fafc' }}
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                        labelFormatter={(label) => new Date(label).toDateString()}
                        formatter={(value: any) => `₹${(value || 0).toLocaleString()}`}
                    />
                    <Bar dataKey="value" fill="#6366f1" name="Sales" radius={[4, 4, 0, 0]} barSize={32} />
                </BarChart>
            )}
        />
    );
};

export default SalesTrendChart;
