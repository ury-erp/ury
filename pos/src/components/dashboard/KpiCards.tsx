import React from 'react';
import { Card } from '../ui/card';
import {
    TrendingUp,
    ShoppingBag,
    CreditCard,
    Smartphone,
    Banknote,
    AlertCircle
} from 'lucide-react';
import { DashboardData } from '../../lib/dashboard-api';

interface Props {
    data: DashboardData | null;
    loading: boolean;
}

const KpiCards: React.FC<Props> = ({ data, loading }) => {
    const kpis = data?.kpis;

    const cards = [
        {
            title: 'Total Sales',
            value: `₹${(kpis?.total_sales || 0).toLocaleString()}`,
            icon: TrendingUp,
            color: 'emerald',
            description: 'Gross Revenue'
        },
        {
            title: 'Total Invoices',
            value: kpis?.total_invoices || 0,
            icon: ShoppingBag,
            color: 'blue',
            description: 'Count'
        },
        {
            title: 'Cash Sales',
            value: `₹${(kpis?.total_cash || 0).toLocaleString()}`,
            icon: Banknote,
            color: 'green',
            description: 'Cash Payments'
        },
        {
            title: 'Card Sales',
            value: `₹${(kpis?.total_card || 0).toLocaleString()}`,
            icon: CreditCard,
            color: 'purple',
            description: 'Card Payments'
        },
        {
            title: 'UPI Sales',
            value: `₹${(kpis?.total_upi || 0).toLocaleString()}`,
            icon: Smartphone,
            color: 'orange',
            description: 'UPI Payments'
        },
        {
            title: 'Outstanding',
            value: `₹${(kpis?.total_outstanding || 0).toLocaleString()}`,
            icon: AlertCircle,
            color: 'red',
            description: 'Unpaid Amount'
        }
    ];

    const colorMap: Record<string, { bg: string, text: string }> = {
        blue: { bg: 'bg-blue-50', text: 'text-blue-600' },
        emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
        green: { bg: 'bg-green-50', text: 'text-green-600' },
        purple: { bg: 'bg-purple-50', text: 'text-purple-600' },
        orange: { bg: 'bg-orange-50', text: 'text-orange-600' },
        red: { bg: 'bg-red-50', text: 'text-red-600' },
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                {cards.map((card) => (
                    <Card key={card.title} className="p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow h-full">
                        <div className="flex justify-between items-start mb-4">
                            <p className="text-sm font-medium text-gray-500 truncate">{card.title}</p>
                            <div className={`p-2 rounded-lg ${colorMap[card.color]?.bg || 'bg-gray-50'} ${colorMap[card.color]?.text || 'text-gray-600'}`}>
                                <card.icon className="w-5 h-5" />
                            </div>
                        </div>
                        <div>
                            <h3 className="text-3xl font-bold text-gray-900 tracking-tight">
                                {loading ? '...' : card.value}
                            </h3>
                            <p className="text-xs text-gray-400 mt-2 font-medium">{card.description}</p>
                        </div>
                    </Card>
                ))}
            </div>
        </div>
    );
};

export default KpiCards;
