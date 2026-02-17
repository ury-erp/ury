import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '../../ui/card';
import { DashboardFilters } from '../../../pages/Dashboard';
import { getDashboardData } from '../../../lib/dashboard-api';
import ChartCardHeader from './ChartCardHeader';
import { usePOSStore } from '../../../store/pos-store';
import { ResponsiveContainer } from 'recharts';

interface Props {
    title: string;
    initialData: any;
    globalFilters: DashboardFilters;
    apiSection: string;
    renderChart: (data: any[]) => React.ReactElement; // changed to ReactElement for better compatibility with Recharts
    mapData?: (data: any) => any[];
    className?: string;
}

const GenericChart: React.FC<Props> = ({
    title,
    initialData,
    globalFilters,
    apiSection,
    renderChart,
    mapData,
    className
}) => {
    const { posProfile } = usePOSStore();
    const [filter, setFilter] = useState<string>(globalFilters.dateRange === 'custom' ? 'custom' : globalFilters.dateRange);
    const [customDates, setCustomDates] = useState<{ start: string, end: string }>({
        start: globalFilters.customStartDate || '',
        end: globalFilters.customEndDate || ''
    });
    const [data, setData] = useState<any>(initialData);
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
                const result = await getDashboardData(tempFilters, posProfile.company, apiSection);
                // result is DashboardData, we access the section using the key
                setData((result as any)[apiSection]);
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

    const chartData = mapData ? mapData(data) : (Array.isArray(data) ? data : []);

    return (
        <Card className={`p-6 rounded-xl border border-gray-200 shadow-sm transition-all hover:shadow-md ${className}`}>
            <ChartCardHeader
                title={title}
                currentFilter={filter}
                onFilterChange={handleFilterChange}
                customStartDate={customDates.start}
                customEndDate={customDates.end}
                onCustomDateChange={handleCustomDateChange}
            />
            <CardContent className="h-[300px] p-0 relative">
                {loading && <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10">Loading...</div>}
                <ResponsiveContainer width="100%" height="100%">
                    {renderChart(chartData)}
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
};

export default GenericChart;
