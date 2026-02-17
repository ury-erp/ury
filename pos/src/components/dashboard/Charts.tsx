import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { DashboardFilters } from '../../pages/Dashboard';
import { DashboardData } from '../../lib/dashboard-api';

interface Props {
    data: DashboardData | null;
    filters: DashboardFilters;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

const Charts: React.FC<Props> = ({ data }) => {

    // Process Daywise Sales
    const salesData = data?.daywise_sales?.map(item => ({
        name: item.posting_date,
        value: item.total_sales
    })) || [];

    // Process Payment Modes
    const paymentData = data?.payment_modes?.map(item => ({
        name: item.mode_of_payment,
        value: item.amount
    })) || [];

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Sales Trend Chart */}
            <Card className="p-6 rounded-xl border border-gray-200 shadow-sm">
                <CardHeader className="p-0 mb-6">
                    <CardTitle className="text-base font-semibold text-gray-900">Sales Trend (Daywise)</CardTitle>
                </CardHeader>
                <CardContent className="h-[300px] p-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={salesData}>
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
                            />
                            <Bar dataKey="value" fill="#6366f1" name="Sales" radius={[4, 4, 0, 0]} barSize={32} />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            {/* Payment Mode Distribution */}
            <Card className="p-6 rounded-xl border border-gray-200 shadow-sm">
                <CardHeader className="p-0 mb-6">
                    <CardTitle className="text-base font-semibold text-gray-900">Payment Mode Distribution</CardTitle>
                </CardHeader>
                <CardContent className="h-[300px] p-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={paymentData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={100}
                                paddingAngle={5}
                                dataKey="value"
                            >
                                {paymentData.map((_, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} strokeWidth={0} />
                                ))}
                            </Pie>
                            <Tooltip formatter={(value: any) => `₹${(value || 0).toLocaleString()}`} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                            <Legend verticalAlign="bottom" height={36} iconType="circle" />
                        </PieChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            {/* Top Selling Items */}

            {/* Sales by Category */}
            <Card className="p-6 rounded-xl border border-gray-200 shadow-sm">
                <CardHeader className="p-0 mb-6">
                    <CardTitle className="text-base font-semibold text-gray-900">Sales by Category</CardTitle>
                </CardHeader>
                <CardContent className="h-[300px] p-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={data?.sales_by_category || []}
                                cx="50%"
                                cy="50%"
                                innerRadius={40}
                                outerRadius={80}
                                paddingAngle={2}
                                dataKey="amount"
                                nameKey="item_group"
                                label={({ item_group, percent }: { item_group?: string, percent?: number }) => `${item_group} ${(percent! * 100).toFixed(0)}%`}
                            >
                                {(data?.sales_by_category || []).map((_, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} strokeWidth={0} />
                                ))}
                            </Pie>
                            <Tooltip formatter={(value: number) => `₹${value.toLocaleString()}`} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                            <Legend verticalAlign="bottom" iconType="circle" />
                        </PieChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            {/* Peak Hours */}
            <Card className="p-6 rounded-xl border border-gray-200 shadow-sm">
                <CardHeader className="p-0 mb-6">
                    <CardTitle className="text-base font-semibold text-gray-900">Peak Hours (Transactions)</CardTitle>
                </CardHeader>
                <CardContent className="h-[300px] p-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data?.peak_hours || []}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis
                                dataKey="hour"
                                tickFormatter={(tick) => `${tick}:00`}
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
                            <Tooltip labelFormatter={(label) => `${label}:00 - ${label + 1}:00`} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                            <Bar dataKey="invoice_count" fill="#f97316" name="Invoices" radius={[4, 4, 0, 0]} barSize={24} />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
        </div>
    );
};

export default Charts;
