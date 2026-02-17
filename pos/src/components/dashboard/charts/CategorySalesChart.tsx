import React from 'react';
import { PieChart, Pie, Cell, Legend, Tooltip } from 'recharts';
import { DashboardFilters } from '../../../pages/Dashboard';
import GenericChart from './GenericChart';

interface Props {
    initialData: any[];
    globalFilters: DashboardFilters;
}

const COLORS = ['#8884d8', '#83a6ed', '#8dd1e1', '#82ca9d', '#a4de6c', '#d0ed57'];

const CategorySalesChart: React.FC<Props> = ({ initialData, globalFilters }) => {
    return (
        <GenericChart
            title="Sales by Category"
            initialData={initialData}
            globalFilters={globalFilters}
            apiSection="sales_by_category"
            mapData={(data) => data?.map((item: any) => ({
                name: item.item_group,
                value: Number(item.amount) || 0
            })) || []}
            renderChart={(chartData) => (
                <PieChart>
                    <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                        nameKey="name"
                        label={({ name, percent }: { name?: string | number, percent?: number }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                    >
                        {chartData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} strokeWidth={0} />
                        ))}
                    </Pie>
                    <Tooltip formatter={(value: any) => `₹${(value || 0).toLocaleString()}`} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    <Legend verticalAlign="bottom" iconType="circle" />
                </PieChart>
            )}
        />
    );
};

export default CategorySalesChart;
