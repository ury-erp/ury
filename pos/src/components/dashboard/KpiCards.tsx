import React, { useMemo } from 'react';
import { Card } from '../ui/card';
import {
    TrendingUp,
    ShoppingBag,
    CreditCard,
    XOctagon,
    ArrowUpRight,
    ArrowDownRight
} from 'lucide-react';

interface Props {
    data: any[];
    loading: boolean;
}

const KpiCards: React.FC<Props> = ({ data, loading }) => {
    const stats = useMemo(() => {
        if (!data || data.length === 0) return null;

        // Helper to get value from either object or array
        const getVal = (row: any, key: string, index: number) => {
            if (typeof row === 'object' && !Array.isArray(row)) {
                return row[key];
            }
            return row[index];
        };

        // We need to guess column indices if data is array of arrays
        // Standard POS Invoice report columns (best guess):
        // 0: name, 1: posting_date, 2: grand_total, 3: mode_of_payment, 4: docstatus
        // 5: item_code, 6: qty, 7: rate

        let totalOrdersSet = new Set();
        let totalSales = 0;
        let cashSales = 0;
        let cancelledOrdersSet = new Set();
        let itemSales: Record<string, number> = {};

        data.forEach((row) => {
            const name = getVal(row, 'name', 0);
            const grandTotal = parseFloat(getVal(row, 'grand_total', 2)) || 0;
            const modeOfPayment = getVal(row, 'mode_of_payment', 3);
            const docstatus = parseInt(getVal(row, 'docstatus', 4));
            const itemCode = getVal(row, 'item_code', 5);
            const qty = parseFloat(getVal(row, 'qty', 6)) || 0;

            if (docstatus === 1) { // Submitted
                if (name) totalOrdersSet.add(name);
                totalSales += grandTotal;
                if (modeOfPayment === 'Cash') {
                    cashSales += grandTotal;
                }

                if (itemCode && qty > 0) {
                    itemSales[itemCode] = (itemSales[itemCode] || 0) + qty;
                }
            } else if (docstatus === 2) { // Cancelled
                if (name) cancelledOrdersSet.add(name);
            }
        });

        const items = Object.entries(itemSales).sort((a, b) => b[1] - a[1]);
        const mostSold = items.length > 0 ? items[0] : null;
        const leastSold = items.length > 0 ? items.filter(i => i[1] > 0).sort((a, b) => a[1] - b[1])[0] : null;

        return {
            totalOrders: totalOrdersSet.size,
            totalSales,
            cashSales,
            cancelledOrders: cancelledOrdersSet.size,
            mostSold: mostSold ? { name: mostSold[0], qty: mostSold[1] } : null,
            leastSold: leastSold ? { name: leastSold[0], qty: leastSold[1] } : null,
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

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {cards.map((card) => (
                    <Card key={card.title} className="p-5 flex items-start space-x-4">
                        <div className={`p-3 rounded-lg bg-${card.color}-50 text-${card.color}-600`}>
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="p-4 flex items-center justify-between border-blue-100 bg-blue-50/30">
                    <div className="flex items-center space-x-3">
                        <div className="p-2 bg-blue-100 rounded-full">
                            <ArrowUpRight className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-600 font-medium">Most Sold Item</p>
                            <p className="text-lg font-bold text-gray-900 truncate">
                                {loading ? '...' : (stats?.mostSold?.name || 'N/A')}
                            </p>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="text-xs text-gray-500">Qty Sold</p>
                        <p className="text-lg font-bold text-blue-600">{loading ? '...' : stats?.mostSold?.qty || 0}</p>
                    </div>
                </Card>

                <Card className="p-4 flex items-center justify-between border-amber-100 bg-amber-50/30">
                    <div className="flex items-center space-x-3">
                        <div className="p-2 bg-amber-100 rounded-full">
                            <ArrowDownRight className="w-5 h-5 text-amber-600" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-600 font-medium">Least Sold Item</p>
                            <p className="text-lg font-bold text-gray-900 truncate">
                                {loading ? '...' : (stats?.leastSold?.name || 'N/A')}
                            </p>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="text-xs text-gray-500">Qty Sold</p>
                        <p className="text-lg font-bold text-amber-600">{loading ? '...' : stats?.leastSold?.qty || 0}</p>
                    </div>
                </Card>
            </div>
        </div>
    );
};

export default KpiCards;
