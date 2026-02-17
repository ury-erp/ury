import React from 'react';
import { Select, SelectItem } from '../ui/select';
import { DashboardFilters } from '../../pages/Dashboard';
import { Card } from '../ui/card';
import { Input } from '../ui/input';

interface Props {
    filters: DashboardFilters;
    onFilterChange: (filters: DashboardFilters) => void;
    branches: string[];
}

const FilterBar: React.FC<Props> = ({ filters, onFilterChange, branches }) => {
    const handleDateRangeChange = (value: string) => {
        onFilterChange({ ...filters, dateRange: value as any });
    };

    // const handleGroupByChange = (value: string) => {
    //     onFilterChange({ ...filters, groupBy: value as any });
    // };

    // const handlePaymentModeChange = (value: string) => {
    //     onFilterChange({ ...filters, modeOfPayment: value as any });
    // };

    return (
        <Card className="p-4 bg-white border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-500 uppercase">Date Range</label>
                    <Select
                        value={filters.dateRange}
                        onValueChange={handleDateRangeChange}
                    >
                        <SelectItem value="today">Today</SelectItem>
                        <SelectItem value="this_week">This Week</SelectItem>
                        <SelectItem value="this_month">This Month</SelectItem>
                        <SelectItem value="custom">Custom Range</SelectItem>
                    </Select>
                </div>

                {filters.dateRange === 'custom' && (
                    <div className="grid grid-cols-2 gap-4 col-span-1 md:col-span-2 lg:col-span-2">
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-gray-500 uppercase">From</label>
                            <Input
                                type="date"
                                value={filters.customStartDate || ''}
                                onChange={(e) => onFilterChange({ ...filters, customStartDate: e.target.value })}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-gray-500 uppercase">To</label>
                            <Input
                                type="date"
                                value={filters.customEndDate || ''}
                                onChange={(e) => onFilterChange({ ...filters, customEndDate: e.target.value })}
                            />
                        </div>
                    </div>
                )}
                {/* 
                <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-500 uppercase">Group By</label>
                    <Select
                        value={filters.groupBy}
                        onValueChange={handleGroupByChange}
                    >
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                    </Select>
                </div> */}
                {/* 
                <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-500 uppercase">Payment Mode</label>
                    <Select
                        value={filters.modeOfPayment}
                        onValueChange={handlePaymentModeChange}
                    >
                        <SelectItem value="All">All Payments</SelectItem>
                        <SelectItem value="Cash">Cash Only</SelectItem>
                        <SelectItem value="Others">Others</SelectItem>
                    </Select>
                </div> */}

                {branches.length > 0 && (
                    <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-500 uppercase">Branch</label>
                        <Select
                            value={filters.branch || 'all'}
                            onValueChange={(val) => onFilterChange({ ...filters, branch: val === 'all' ? undefined : val })}
                        >
                            <SelectItem value="all">All Branches</SelectItem>
                            {branches.map(branch => (
                                <SelectItem key={branch} value={branch}>{branch}</SelectItem>
                            ))}
                        </Select>
                    </div>
                )}
            </div>
        </Card>
    );
};

export default FilterBar;
