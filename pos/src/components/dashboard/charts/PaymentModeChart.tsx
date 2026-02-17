import React from 'react';
import { PieChart, Pie, Cell, Legend, Tooltip } from 'recharts';
import { DashboardFilters } from '../../../pages/Dashboard';
import GenericChart from './GenericChart';

interface Props {
    initialData: any[];
    globalFilters: DashboardFilters;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

const PaymentModeChart: React.FC<Props> = ({ initialData, globalFilters }) => {
    return (
        <GenericChart
            title="Payment Mode Distribution"
            initialData={initialData}
            globalFilters={globalFilters}
            apiSection="payment_modes"
            mapData={(data) => data?.map((item: any) => ({
                name: item.mode_of_payment,
                value: item.amount
            })) || []}
            renderChart={(chartData) => (
                <PieChart>
                    <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                    >
                        {chartData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} strokeWidth={0} />
                        ))}
                    </Pie>
                    <Tooltip formatter={(value: any) => `₹${(value || 0).toLocaleString()}`} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
            )}
        />
    );
};

export default PaymentModeChart;
