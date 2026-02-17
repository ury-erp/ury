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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            {/* Sales Trend Chart */}
            <Card>
                <CardHeader>
                    <CardTitle>Sales Trend (Daywise)</CardTitle>
                </CardHeader>
                <CardContent className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={salesData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis
                                dataKey="name"
                                tickFormatter={(val) => {
                                    const d = new Date(val);
                                    return `${d.getDate()}/${d.getMonth() + 1}`;
                                }}
                            />
                            <YAxis />
                            <Tooltip labelFormatter={(label) => new Date(label).toDateString()} />
                            <Bar dataKey="value" fill="#8884d8" name="Sales" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            {/* Payment Mode Distribution */}
            <Card>
                <CardHeader>
                    <CardTitle>Payment Mode Distribution</CardTitle>
                </CardHeader>
                <CardContent className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={paymentData}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={({ name, percent }: { name?: string | number, percent?: number }) => `${name} ${(percent! * 100).toFixed(0)}%`}
                                outerRadius={100}
                                fill="#8884d8"
                                dataKey="value"
                            >
                                {paymentData.map((_, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip formatter={(value: any) => `₹${value.toLocaleString()}`} />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

        </div>
    );
};

export default Charts;
