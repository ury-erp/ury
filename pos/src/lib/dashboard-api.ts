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

export const getDashboardData = async (filters: DashboardFilters, company: string): Promise<DashboardData> => {
    const frappeFilters: any = {
        company: company,
        branch: filters.branch || '',
        pos_profile: filters.posProfile || ''
    };

    const today = new Date().toISOString().split('T')[0];
    const now = new Date();

    if (filters.dateRange === 'today') {
        frappeFilters.from_date = today;
        frappeFilters.to_date = today;
    } else if (filters.dateRange === 'this_week') {
        const tempNow = new Date(now);
        const day = tempNow.getDay();
        const diff = tempNow.getDate() - day + (day == 0 ? -6 : 1);
        const monday = new Date(tempNow.setDate(diff));
        frappeFilters.from_date = monday.toISOString().split('T')[0];
        frappeFilters.to_date = today;
    } else if (filters.dateRange === 'this_month') {
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        frappeFilters.from_date = firstDay;
        frappeFilters.to_date = today;
    } else if (filters.dateRange === 'custom') {
        frappeFilters.from_date = filters.customStartDate;
        frappeFilters.to_date = filters.customEndDate;
    }

    try {
        // 1. Fetch KPIs and Charts data
        const kpiResponse = await (call as any).get('ury.ury.api.cashier_dashboard.get_cashier_kpis', {
            filters: frappeFilters
        });
        const kpiData = kpiResponse.message || {};

        return {
            kpis: kpiData?.kpis || {},
            payment_modes: kpiData?.payment_modes || [],
            daywise_sales: kpiData?.daywise_sales || [],
            bestSellingItems: kpiData?.best_selling_items || [],
            sales_by_category: kpiData?.sales_by_category || [],
            peak_hours: kpiData?.peak_hours || []
        };

    } catch (error) {
        console.error("Failed to fetch dashboard data", error);
        // Use type assertion to match expected return type even on error for safer handling in component
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
