import { call } from './frappe-sdk';
import { DashboardFilters } from '../pages/Dashboard';

export interface DashboardData {
    name: string;
    posting_date: string;
    grand_total: number;
    mode_of_payment: string;
    docstatus: number;
    currency: string;
}

export const getDashboardData = async (filters: DashboardFilters): Promise<DashboardData[]> => {
    const frappeFilters: any = {};

    const today = new Date().toISOString().split('T')[0];
    const now = new Date();

    if (filters.dateRange === 'today') {
        frappeFilters.from_date = today;
        frappeFilters.to_date = today;
    } else if (filters.dateRange === 'this_week') {
        const firstDay = new Date(now.setDate(now.getDate() - now.getDay())).toISOString().split('T')[0];
        frappeFilters.from_date = firstDay;
        frappeFilters.to_date = today;
    } else if (filters.dateRange === 'this_month') {
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        frappeFilters.from_date = firstDay;
        frappeFilters.to_date = today;
    } else if (filters.dateRange === 'custom') {
        frappeFilters.from_date = filters.customStartDate;
        frappeFilters.to_date = filters.customEndDate;
    }

    if (filters.branch) {
        frappeFilters.branch = filters.branch;
    }

    // Use standard Report API
    const response = await (call as any).post('frappe.desk.query_report.run', {
        report_name: 'POS Register',
        filters: frappeFilters
    });

    if (response && response.message) {
        return response.message.result || [];
    }
    return [];
};
