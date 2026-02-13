import React, { useMemo } from 'react';
import { Card } from '../ui/card';
import {
    TrendingUp,
    ShoppingBag,
    CreditCard,
    XOctagon
} from 'lucide-react';
import { DashboardData } from '../../lib/dashboard-api';

interface Props {
    data: DashboardData | null;
    loading: boolean;
}

const KpiCards: React.FC<Props> = ({ data, loading }) => {
    const stats = useMemo(() => {
        if (!data || !data.posRegister) return null;

        let totalSales = 0;
        let totalOrders = 0;
        let cashSales = 0;
        let cancelledOrders = 0;

        // Use a Set to track unique invoices if the report returns multiple rows per invoice (e.g. items)
        const processedInvoices = new Set();

        data.posRegister.forEach((row: any) => {
            // If row has 'name' (invoice number), deduplicate
            if (row.name && processedInvoices.has(row.name)) {
                return;
            }
            if (row.name) processedInvoices.add(row.name);

            const grandTotal = parseFloat(row.grand_total || 0);
            const status = row.status || row.docstatus;

            // docstatus: 0=Draft, 1=Submitted, 2=Cancelled
            // status can be string "Cancelled"
            if (status === 2 || status === 'Cancelled') {
                cancelledOrders++;
            } else {
                totalOrders++;
                totalSales += grandTotal;

                if (row.mode_of_payment === 'Cash') {
                    cashSales += grandTotal;
                }
            }
        });

        return {
            totalOrders,
            totalSales,
            cashSales,
            cancelledOrders
        };
    }, [data]);

    const cards = [
        {
            title: 'Total Orders',
            value: stats?.totalOrders || 0,
            icon: ShoppingBag,
            color: 'blue',
            description: 'Submitted invoices'
        },
        {
            title: 'Total Sales',
            value: `₹${(stats?.totalSales || 0).toLocaleString()}`,
            icon: TrendingUp,
            color: 'emerald',
            description: 'Gross revenue'
        },
        {
            title: 'Cash Sales',
            value: `₹${(stats?.cashSales || 0).toLocaleString()}`,
            icon: CreditCard,
            color: 'amber',
            description: 'Received via Cash'
        },
        {
            title: 'Cancelled Orders',
            value: stats?.cancelledOrders || 0,
            icon: XOctagon,
            color: 'red',
            description: 'Voided transactions'
        }
    ];

    const colorMap: Record<string, { bg: string, text: string }> = {
        blue: { bg: 'bg-blue-50', text: 'text-blue-600' },
        emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
        amber: { bg: 'bg-amber-50', text: 'text-amber-600' },
        red: { bg: 'bg-red-50', text: 'text-red-600' },
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {cards.map((card) => (
                    <Card key={card.title} className="p-5 flex items-start space-x-4">
                        <div className={`p-3 rounded-lg ${colorMap[card.color]?.bg || 'bg-gray-50'} ${colorMap[card.color]?.text || 'text-gray-600'}`}>
                            <card.icon className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-gray-500">{card.title}</p>
                            <h3 className="text-2xl font-bold text-gray-900">{loading ? '...' : card.value}</h3>
                            <p className="text-xs text-gray-400 mt-1">{card.description}</p>
                        </div>
                    </Card>
                ))}
            </div>
        </div>
    );
};

export default KpiCards;
