import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent } from '../../ui/card';
import { DashboardFilters } from '../../../pages/Dashboard';
import { getDashboardData } from '../../../lib/dashboard-api';
import ChartCardHeader from './ChartCardHeader';
import { usePOSStore } from '../../../store/pos-store';

interface Props {
    initialData: any[];
    globalFilters: DashboardFilters;
}

const SalesTrendChart: React.FC<Props> = ({ initialData, globalFilters }) => {
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
                const result = await getDashboardData(tempFilters, posProfile.company, 'daywise_sales');
                setData(result.daywise_sales);
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

    const chartData = data?.map(item => ({
        name: item.posting_date,
        value: item.total_sales
    })) || [];

    return (
        <Card className="p-6 rounded-xl border border-gray-200 shadow-sm transition-all hover:shadow-md">
            <ChartCardHeader
                title="Sales Trend"
                currentFilter={filter}
                onFilterChange={handleFilterChange}
                customStartDate={customDates.start}
                customEndDate={customDates.end}
                onCustomDateChange={handleCustomDateChange}
            />
            <CardContent className="h-[300px] p-0 relative">
                {loading && <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10">Loading...</div>}
                <ResponsiveContainer width="100%" height="100%">
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
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
};

export default SalesTrendChart;
