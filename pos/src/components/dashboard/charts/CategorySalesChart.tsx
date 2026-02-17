import React, { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent } from '../../ui/card';
import { DashboardFilters } from '../../../pages/Dashboard';
import { getDashboardData } from '../../../lib/dashboard-api';
import ChartCardHeader from './ChartCardHeader';
import { usePOSStore } from '../../../store/pos-store';

interface Props {
    initialData: any[];
    globalFilters: DashboardFilters;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

const CategorySalesChart: React.FC<Props> = ({ initialData, globalFilters }) => {
    const { posProfile } = usePOSStore();
    const [filter, setFilter] = useState<string>(globalFilters.dateRange === 'custom' ? 'today' : globalFilters.dateRange);
    const [customDates, setCustomDates] = useState<{ start: string, end: string }>({
        start: globalFilters.customStartDate || '',
        end: globalFilters.customEndDate || ''
    });
    const [data, setData] = useState<any[]>(initialData);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setData(initialData);
        setFilter(globalFilters.dateRange === 'custom' ? 'custom' : globalFilters.dateRange);
        if (globalFilters.dateRange === 'custom') {
            setCustomDates({
                start: globalFilters.customStartDate || '',
                end: globalFilters.customEndDate || ''
            });
        }
    }, [initialData, globalFilters]);

    const fetchData = async (currentFilter: string, startDate?: string, endDate?: string) => {
        setLoading(true);
        try {
            const tempFilters = {
                ...globalFilters,
                dateRange: currentFilter as any,
                customStartDate: startDate,
                customEndDate: endDate
            };

            if (posProfile?.company) {
                const result = await getDashboardData(tempFilters, posProfile.company, 'sales_by_category');
                setData(result.sales_by_category);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    const handleFilterChange = async (newFilter: string) => {
        setFilter(newFilter);
        if (newFilter !== 'custom') {
            setCustomDates({ start: '', end: '' });
            fetchData(newFilter);
        }
    };

    const handleCustomDateChange = (type: 'start' | 'end', value: string) => {
        const newDates = { ...customDates, [type]: value };
        setCustomDates(newDates);

        if (newDates.start && newDates.end) {
            fetchData('custom', newDates.start, newDates.end);
        }
    };

    return (
        <Card className="p-6 rounded-xl border border-gray-200 shadow-sm transition-all hover:shadow-md">
            <ChartCardHeader
                title="Sales by Category"
                currentFilter={filter}
                onFilterChange={handleFilterChange}
                customStartDate={customDates.start}
                customEndDate={customDates.end}
                onCustomDateChange={handleCustomDateChange}
            />
            <CardContent className="h-[300px] p-0 relative">
                {loading && <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10">Loading...</div>}
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={data}
                            cx="50%"
                            cy="50%"
                            innerRadius={40}
                            outerRadius={80}
                            paddingAngle={2}
                            dataKey="amount"
                            nameKey="item_group"
                            label={({ item_group, percent }: { item_group?: string, percent?: number }) => `${item_group} ${(percent! * 100).toFixed(0)}%`}
                        >
                            {data.map((_, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} strokeWidth={0} />
                            ))}
                        </Pie>
                        <Tooltip formatter={(value: any) => `₹${(value || 0).toLocaleString()}`} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                        <Legend verticalAlign="bottom" iconType="circle" />
                    </PieChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
};

export default CategorySalesChart;
