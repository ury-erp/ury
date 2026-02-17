import React from 'react';
import { DashboardFilters } from '../../pages/Dashboard';
import { DashboardData } from '../../lib/dashboard-api';
import SalesTrendChart from './charts/SalesTrendChart';
import PaymentModeChart from './charts/PaymentModeChart';
import CategorySalesChart from './charts/CategorySalesChart';
import PeakHoursChart from './charts/PeakHoursChart';

interface Props {
    data: DashboardData | null;
    filters: DashboardFilters;
}

const Charts: React.FC<Props> = ({ data, filters }) => {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SalesTrendChart initialData={data?.daywise_sales || []} globalFilters={filters} />
            <PaymentModeChart initialData={data?.payment_modes || []} globalFilters={filters} />
            <CategorySalesChart initialData={data?.sales_by_category || []} globalFilters={filters} />
            <PeakHoursChart initialData={data?.peak_hours || []} globalFilters={filters} />
        </div>
    );
};

export default Charts;
