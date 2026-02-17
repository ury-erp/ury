import React from 'react';
import { Select, SelectItem } from '../../ui/select';
import { CardHeader, CardTitle } from '../../ui/card';

import { Input } from '../../ui/input';

interface Props {
    title: string;
    onFilterChange: (value: string) => void;
    currentFilter: string;
    customStartDate?: string;
    customEndDate?: string;
    onCustomDateChange?: (type: 'start' | 'end', value: string) => void;
}

const ChartCardHeader: React.FC<Props> = ({
    title,
    onFilterChange,
    currentFilter,
    customStartDate,
    customEndDate,
    onCustomDateChange
}) => {
    return (
        <CardHeader className="p-0 mb-6 flex flex-col space-y-4">
            <div className="flex flex-row items-center justify-between w-full">
                <CardTitle className="text-base font-semibold text-gray-900">{title}</CardTitle>
                {/* <div className="w-36">
                    <Select value={currentFilter} onValueChange={onFilterChange}>
                        <SelectItem value="today">Today</SelectItem>
                        <SelectItem value="this_week">This Week</SelectItem>
                        <SelectItem value="this_month">This Month</SelectItem>
                        <SelectItem value="custom">Custom Range</SelectItem>
                    </Select>
                </div> */}
            </div>

            {/* {currentFilter === 'custom' && onCustomDateChange && (
                <div className="flex flex-row items-center gap-2 w-full animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex-1">
                        <Input
                            type="date"
                            value={customStartDate || ''}
                            onChange={(e) => onCustomDateChange('start', e.target.value)}
                            className="h-8 text-xs"
                        />
                    </div>
                    <span className="text-gray-400">-</span>
                    <div className="flex-1">
                        <Input
                            type="date"
                            value={customEndDate || ''}
                            onChange={(e) => onCustomDateChange('end', e.target.value)}
                            className="h-8 text-xs"
                        />
                    </div>
                </div>
            )} */}
        </CardHeader>
    );
};

export default ChartCardHeader;
