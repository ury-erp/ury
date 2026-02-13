import React, { useMemo, useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { DashboardFilters } from '../../pages/Dashboard';
import { DashboardData, getReportData } from '../../lib/dashboard-api';
import { usePOSStore } from '../../store/pos-store';
import { Select, SelectItem } from '../ui/select';

interface Props {
    data: DashboardData | null;
    filters: DashboardFilters;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

type DateRange = 'today' | 'this_week' | 'this_month' | 'custom';

const ChartFilter: React.FC<{ value: DateRange; onChange: (val: DateRange) => void }> = ({ value, onChange }) => (
    <div className="w-[140px]">
        <Select value={value} onValueChange={(val) => onChange(val as DateRange)} placeholder="Select range">
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="this_week">Weekly</SelectItem>
            <SelectItem value="this_month">Monthly</SelectItem>
            <SelectItem value="custom">Custom Range</SelectItem>
        </Select>
    </div>
);

const Charts: React.FC<Props> = ({ data: initialData, filters: globalFilters }) => {
    const { posProfile } = usePOSStore();
    const company = posProfile?.company || '';

    // Independent State for each chart
    const [salesTrendRange, setSalesTrendRange] = useState<DateRange>(globalFilters.dateRange as DateRange || 'today');
    const [salesTrendData, setSalesTrendData] = useState<any[] | null>(null);

    const [paymentModeRange, setPaymentModeRange] = useState<DateRange>(globalFilters.dateRange as DateRange || 'today');
    const [paymentModeData, setPaymentModeData] = useState<any[] | null>(null);

    const [topItemsRange, setTopItemsRange] = useState<DateRange>(globalFilters.dateRange as DateRange || 'today');
    const [topItemsData, setTopItemsData] = useState<any[] | null>(null);

    // Sync with global filters
    useEffect(() => {
        setSalesTrendRange(globalFilters.dateRange as DateRange);
        setPaymentModeRange(globalFilters.dateRange as DateRange);
        setTopItemsRange(globalFilters.dateRange as DateRange);
    }, [globalFilters.dateRange]);

    const fetchChartData = async (range: DateRange) => {
        const today = new Date().toISOString().split('T')[0];
        const now = new Date();
        const frappeFilters: any = {
            company: company,
            branch: globalFilters.branch || ''
        };

        if (range === 'today') {
            frappeFilters.from_date = today;
            frappeFilters.to_date = today;
        } else if (range === 'this_week') {
            const day = now.getDay();
            const diff = now.getDate() - day + (day === 0 ? -6 : 1);
            const firstDay = new Date(now.setDate(diff)).toISOString().split('T')[0];
            frappeFilters.from_date = firstDay;
            frappeFilters.to_date = today;
        } else if (range === 'this_month') {
            const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
            frappeFilters.from_date = firstDay;
            frappeFilters.to_date = today;
        } else {
            return null;
        }

        return await getReportData('POS Register', frappeFilters);
    };

    // Effects to handle data source
    const updateChartData = (range: DateRange, setData: (data: any[]) => void) => {
        if ((range === 'custom' || range === globalFilters.dateRange) && initialData?.posRegister) {
            setData(initialData.posRegister);
        } else {
            fetchChartData(range).then(data => {
                if (data) setData(data);
            });
        }
    };

    // Sales Trend Effect
    useEffect(() => {
        updateChartData(salesTrendRange, setSalesTrendData);
    }, [salesTrendRange, globalFilters.dateRange, initialData, company]);

    // Payment Mode Effect
    useEffect(() => {
        updateChartData(paymentModeRange, setPaymentModeData);
    }, [paymentModeRange, globalFilters.dateRange, initialData, company]);

    // Top Items Effect
    useEffect(() => {
        updateChartData(topItemsRange, setTopItemsData);
    }, [topItemsRange, globalFilters.dateRange, initialData, company]);


    // Data Processing Helper
    const processData = (rawData: any[] | null, type: 'trend' | 'payment' | 'items', range: DateRange) => {
        if (!rawData) return [];

        const map = new Map<string, number>();

        rawData.forEach((row: any) => {
            if (row.status === 'Cancelled' || row.docstatus === 2) return;

            if (type === 'trend') {
                const date = row.posting_date || row.date;
                if (!date) return;

                let groupKey = date;

                // If Today, try to group by Hour if time exists
                if (range === 'today' && row.posting_time) {
                    groupKey = row.posting_time.split(':')[0] + ':00';
                }

                const total = parseFloat(row.grand_total || 0);
                map.set(groupKey, (map.get(groupKey) || 0) + total);
            }
            else if (type === 'payment') {
                const mode = row.mode_of_payment || 'Unknown';
                const total = parseFloat(row.grand_total || 0);
                map.set(mode, (map.get(mode) || 0) + total);
            }
            else if (type === 'items') {
                const item = row.item_code || row.item_name;
                const qty = parseFloat(row.qty || row.stock_qty || 0);
                if (item && qty) {
                    map.set(item, (map.get(item) || 0) + qty);
                }
            }
        });

        return Array.from(map.entries())
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => type === 'items' ? b.value - a.value : a.name.localeCompare(b.name)) // Sort items desc, others asc
            .slice(0, type === 'items' ? 10 : undefined);
    };

    const revenueTrendProcessed = useMemo(() => processData(salesTrendData, 'trend', salesTrendRange), [salesTrendData, salesTrendRange]);
    const paymentModeProcessed = useMemo(() => processData(paymentModeData, 'payment', paymentModeRange), [paymentModeData, paymentModeRange]);
    const topItemsProcessed = useMemo(() => processData(topItemsData, 'items', topItemsRange), [topItemsData, topItemsRange]);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Sales Trend</CardTitle>
                    <ChartFilter value={salesTrendRange} onChange={setSalesTrendRange} />
                </CardHeader>
                <CardContent className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={revenueTrendProcessed}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip />
                            <Bar dataKey="value" fill="#8884d8" name="Revenue" />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Payment Mode Distribution</CardTitle>
                    <ChartFilter value={paymentModeRange} onChange={setPaymentModeRange} />
                </CardHeader>
                <CardContent className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={paymentModeProcessed}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={({ name, percent }: { name?: string | number, percent?: number }) => `${name || ''} ${((percent || 0) * 100).toFixed(0)}%`}
                                outerRadius={80}
                                fill="#8884d8"
                                dataKey="value"
                            >
                                {paymentModeProcessed.map((_, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip />
                            <Legend verticalAlign="bottom" height={36} />
                        </PieChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            <Card className="lg:col-span-2">
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Top 10 Selling Items</CardTitle>
                    <ChartFilter value={topItemsRange} onChange={setTopItemsRange} />
                </CardHeader>
                <CardContent className="h-[300px] mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={topItemsProcessed}
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
                            />
                            <Bar
                                dataKey="value"
                                fill="#10b981"
                                radius={[0, 4, 4, 0]}
                                barSize={20}
                                animationDuration={1500}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
        </div>
    );
};

export default Charts;
