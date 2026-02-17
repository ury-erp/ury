import { call } from './frappe-sdk';
import { DashboardFilters } from '../pages/Dashboard';

export interface DashboardData {
    kpis: {
        total_invoices: number;
        total_sales: number;
        total_outstanding: number;
        total_cash: number;
        total_card: number;
        total_upi: number;
        total_other: number;
    };
    payment_modes: {
        mode_of_payment: string;
        amount: number;
    }[];
    daywise_sales: {
        posting_date: string;
        total_sales: number;
    }[];
    bestSellingItems: any[];
    sales_by_category: {
        item_group: string;
        amount: number;
    }[];
    peak_hours: {
        hour: number;
        invoice_count: number;
        total_sales: number;
    }[];
}

// Helper to calculate dates
const calculateDateRange = (filters: DashboardFilters) => {
    let from_date = '';
    let to_date = '';
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();

    if (filters.dateRange === 'today') {
        from_date = today;
        to_date = today;
    } else if (filters.dateRange === 'this_week') {
        const tempNow = new Date(now);
        const day = tempNow.getDay();
        const diff = tempNow.getDate() - day + (day == 0 ? -6 : 1);
        const monday = new Date(tempNow.setDate(diff));
        from_date = monday.toISOString().split('T')[0];
        to_date = today;
    } else if (filters.dateRange === 'this_month') {
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        from_date = firstDay;
        to_date = today;
    } else if (filters.dateRange === 'custom') {
        from_date = filters.customStartDate || '';
        to_date = filters.customEndDate || '';
    }
    return { from_date, to_date };
};

export const getDashboardData = async (filters: DashboardFilters, company: string, section?: string): Promise<DashboardData> => {
    // Calculate dates based on range
    const dates = calculateDateRange(filters);
    const apiFilters = { ...filters, ...dates, company };

    try {
        const response = await call.get('ury.ury.api.cashier_dashboard.get_cashier_kpis', {
            filters: apiFilters,
            section: section
        });
        const data = response.message || {};

        return {
            kpis: data?.kpis || {},
            payment_modes: data?.payment_modes || [],
            daywise_sales: data?.daywise_sales || [],
            bestSellingItems: data?.best_selling_items || [],
            sales_by_category: data?.sales_by_category || [],
            peak_hours: data?.peak_hours || []
        };

    } catch (error) {
        console.error("Failed to fetch dashboard data", error);
        return {
            kpis: {
                total_invoices: 0,
                total_sales: 0,
                total_outstanding: 0,
                total_cash: 0,
                total_card: 0,
                total_upi: 0,
                total_other: 0
            },
            payment_modes: [],
            daywise_sales: [],
            bestSellingItems: [],
            sales_by_category: [],
            peak_hours: []
        };
    }
};
