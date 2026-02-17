import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { DashboardFilters } from '../../../pages/Dashboard';
import GenericChart from './GenericChart';

interface Props {
    initialData: any[];
    globalFilters: DashboardFilters;
}

const PeakHoursChart: React.FC<Props> = ({ initialData, globalFilters }) => {
    return (
        <GenericChart
            title="Peak Hours (Transactions)"
            initialData={initialData}
            globalFilters={globalFilters}
            apiSection="peak_hours"
            mapData={(data) => data?.map((item: any) => ({
                name: item.hour,
                value: item.invoice_count
            })) || []}
            renderChart={(chartData) => (
                <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis
                        dataKey="name"
                        tickFormatter={(val) => `${val}:00`}
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
                        cursor={{ stroke: '#cbd5e1', strokeWidth: 1 }}
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                        labelFormatter={(label) => `${label}:00 - ${label + 1}:00`}
                    />
                    <Area type="monotone" dataKey="value" stroke="#3b82f6" fill="#bfdbfe" strokeWidth={3} name="Invoices" />
                </AreaChart>
            )}
        />
    );
};

export default PeakHoursChart;
