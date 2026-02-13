import { call } from './frappe-sdk';
import { DashboardFilters } from '../pages/Dashboard';

export interface DashboardData {
    posRegister: any[];
}

export const getReportData = async (reportName: string, filters: any) => {
    try {
        const response = await (call as any).post('frappe.desk.query_report.run', {
            report_name: reportName,
            filters: filters,
            ignore_prepared_report: true
        });
        return response.message?.result || [];
    } catch (error) {
        console.error(`Error fetching report ${reportName}:`, error);
        return [];
    }
};

export const getDashboardData = async (filters: DashboardFilters, company: string): Promise<DashboardData> => {
    const frappeFilters: any = {
        company: company,
        branch: filters.branch || ''
    };

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



    // Fetch ONLY POS Register as per requirement
    const posRegisterData = await getReportData('POS Register', frappeFilters);

    return {
        posRegister: posRegisterData
    };
};
