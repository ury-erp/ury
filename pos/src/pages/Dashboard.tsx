import { useState, useEffect } from 'react';
import FilterBar from '../components/dashboard/FilterBar';
import KpiCards from '../components/dashboard/KpiCards';
import Charts from '../components/dashboard/Charts';
import BestSellingItems from '../components/dashboard/BestSellingItems'; // Updated import
import { Spinner } from '../components/ui/spinner';
import { showToast } from '../components/ui/toast';
import { getDashboardData, DashboardData } from '../lib/dashboard-api';
import { usePOSStore } from '../store/pos-store';

export interface DashboardFilters {
    dateRange: 'today' | 'this_week' | 'this_month' | 'custom';
    customStartDate?: string;
    customEndDate?: string;
    groupBy: 'daily' | 'weekly' | 'monthly';
    branch?: string;
    posProfile?: string;
    modeOfPayment: 'All' | 'Cash' | 'Others';
}

const Dashboard = () => {
    const { posProfile } = usePOSStore();

    // Initialize filters, defaulting to current POS Profile if available
    const [filters, setFilters] = useState<DashboardFilters>({
        dateRange: 'today',
        groupBy: 'daily',
        modeOfPayment: 'All',
        posProfile: posProfile?.name // Auto-detect current POS Profile
    });

    const [reportData, setReportData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);


    const fetchReportData = async () => {
        if (!posProfile?.company) return;

        setLoading(true);
        try {
            // Ensure posProfile filter is set if it was missing initially
            const currentFilters = {
                ...filters,
                posProfile: filters.posProfile || posProfile.name
            };

            const data = await getDashboardData(currentFilters, posProfile.company);
            setReportData(data);
        } catch (error) {
            console.error('Failed to fetch dashboard data:', error);
            showToast.error('Failed to load dashboard data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (posProfile?.company) {
            fetchReportData();
        }
    }, [filters, posProfile]);

    if (loading && !reportData) {
        return (
            <div className="flex-1 flex items-center justify-center p-8 bg-gray-50 h-[calc(100vh-64px)] overflow-y-auto">
                <Spinner message="Loading insights..." />
            </div>
        );
    }

    return (
        <div className="flex-1 bg-gray-50 h-[calc(100vh-64px)] overflow-y-auto">
            <div className="w-full p-6 space-y-6">
                <div className="flex justify-between items-center">
                    <h1 className="text-2xl font-bold text-gray-900">POS Dashboard</h1>
                </div>

                <div className="max-w-[1600px] mx-auto space-y-6">
                    <FilterBar
                        filters={filters}
                        onFilterChange={setFilters}
                        branches={[]} // To be populated if needed
                    />

                    <KpiCards data={reportData} loading={loading} />

                    <Charts data={reportData} filters={filters} />

                    <BestSellingItems data={reportData} loading={loading} />
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
