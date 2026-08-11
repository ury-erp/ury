import React, { useState } from 'react';
import { formatCurrency } from '@ury/core';
import { Card, CardHeader, CardTitle, CardContent, Badge } from '@ury/ui';
import { useBranchContext } from '../../context/BranchContext';

export const AnalyticsCharts: React.FC = () => {
  const { selectedBranch } = useBranchContext();
  const [activeHourlyHour, setActiveHourlyHour] = useState<string | null>(null);

  // Sales Trend line data
  const trendData = [
    { time: '09:00', sales: 2400 },
    { time: '11:00', sales: 4800 },
    { time: '13:00', sales: 12500 }, // peak lunch
    { time: '15:00', sales: 6200 },
    { time: '17:00', sales: 7800 },
    { time: '19:00', sales: 15400 }, // peak dinner
    { time: '21:00', sales: 11200 },
    { time: '23:00', sales: 3600 },
  ];

  const maxTrendSales = 18000;

  // Hourly distribution data
  const hourlyData = [
    { hour: '11 AM', orders: 12, sales: 3400, isPeak: false },
    { hour: '12 PM', orders: 24, sales: 7800, isPeak: false },
    { hour: '1 PM', orders: 38, sales: 12500, isPeak: true },
    { hour: '2 PM', orders: 22, sales: 6800, isPeak: false },
    { hour: '3 PM', orders: 14, sales: 3900, isPeak: false },
    { hour: '4 PM', orders: 16, sales: 4200, isPeak: false },
    { hour: '5 PM', orders: 19, sales: 5600, isPeak: false },
    { hour: '6 PM', orders: 28, sales: 8900, isPeak: false },
    { hour: '7 PM', orders: 42, sales: 14200, isPeak: true },
    { hour: '8 PM', orders: 45, sales: 15400, isPeak: true },
    { hour: '9 PM', orders: 31, sales: 9800, isPeak: false },
    { hour: '10 PM', orders: 18, sales: 5100, isPeak: false },
  ];

  const maxHourlyOrders = 50;

  // Revenue by branch comparative data
  const branchData = [
    { name: 'Downtown Main', revenue: 48250, orders: 142, share: 42 },
    { name: 'Uptown Bistro', revenue: 32400, orders: 98, share: 28 },
    { name: 'Express Outlet', revenue: 19800, orders: 76, share: 17 },
    { name: 'Beachside Lounge', revenue: 15200, orders: 54, share: 13 },
  ];

  const maxBranchRevenue = 60000;

  // Payment method distribution
  const paymentMethods = [
    { type: 'UPI (GPay / PhonePe)', percentage: 48, amount: 23160, color: '#7C3AED', dashArray: '150 150', dashOffset: '0' },
    { type: 'Credit / Debit Card', percentage: 28, amount: 13510, color: '#3B82F6', dashArray: '88 212', dashOffset: '-150' },
    { type: 'Cash', percentage: 18, amount: 8685, color: '#10B981', dashArray: '56 244', dashOffset: '-238' },
    { type: 'Aggregator (Zomato/Swiggy)', percentage: 6, amount: 2895, color: '#F59E0B', dashArray: '19 281', dashOffset: '-294' },
  ];

  // Order type distribution
  const orderTypes = [
    { type: 'Dine In', percentage: 62, count: 88, color: '#6D28D9', dashArray: '194 106', dashOffset: '0' },
    { type: 'Take Away', percentage: 24, count: 34, color: '#8B5CF6', dashArray: '75 225', dashOffset: '-194' },
    { type: 'Delivery', percentage: 14, count: 20, color: '#EC4899', dashArray: '44 256', dashOffset: '-269' },
  ];

  // Top selling menu items (horizontal progress list)
  const topItems = [
    { rank: 1, name: 'Special Chicken Biriyani', category: 'Main Course', count: 84, revenue: 21000, percentage: 95 },
    { rank: 2, name: 'Butter Chicken & Naan Combo', category: 'Main Course', count: 62, revenue: 17360, percentage: 80 },
    { rank: 3, name: 'Paneer Butter Masala', category: 'Vegetarian', count: 48, revenue: 11040, percentage: 65 },
    { rank: 4, name: 'Mango Lassi', category: 'Beverages', count: 96, revenue: 8640, percentage: 55 },
    { rank: 5, name: 'Sizzling Chocolate Brownie', category: 'Dessert', count: 42, revenue: 7560, percentage: 48 },
    { rank: 6, name: 'Chicken Wings (6 pcs)', category: 'Appetizers', count: 38, revenue: 6840, percentage: 42 },
  ];

  return (
    <div className="space-y-6">
      {/* Top Grid: Sales Trend Line Chart + Peak Distribution Bar Chart */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Sales Trend SVG Area Chart */}
        <Card className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm lg:col-span-7">
          <CardHeader className="p-0 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-bold text-gray-900">Sales Trend</CardTitle>
                <p className="text-xs text-gray-500 mt-1">Real-time revenue flow throughout operating hours</p>
              </div>
              <Badge variant="outline" className="border-purple-200 bg-purple-50 text-purple-700 font-medium">
                Peak: 19:00 ({formatCurrency(15400)})
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0 pt-2">
            <div className="relative h-64 w-full">
              <svg className="h-full w-full overflow-visible" viewBox="0 0 500 200" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7C3AED" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#7C3AED" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Grid Lines */}
                <line x1="0" y1="40" x2="500" y2="40" stroke="#F3F4F6" strokeDasharray="4 4" />
                <line x1="0" y1="90" x2="500" y2="90" stroke="#F3F4F6" strokeDasharray="4 4" />
                <line x1="0" y1="140" x2="500" y2="140" stroke="#F3F4F6" strokeDasharray="4 4" />
                <line x1="0" y1="190" x2="500" y2="190" stroke="#E5E7EB" />

                {/* Area Gradient Path */}
                <path
                  d={`M 0 190 
                     L 0 ${190 - (trendData[0].sales / maxTrendSales) * 160} 
                     L 71 ${190 - (trendData[1].sales / maxTrendSales) * 160} 
                     L 142 ${190 - (trendData[2].sales / maxTrendSales) * 160} 
                     L 214 ${190 - (trendData[3].sales / maxTrendSales) * 160} 
                     L 285 ${190 - (trendData[4].sales / maxTrendSales) * 160} 
                     L 357 ${190 - (trendData[5].sales / maxTrendSales) * 160} 
                     L 428 ${190 - (trendData[6].sales / maxTrendSales) * 160} 
                     L 500 ${190 - (trendData[7].sales / maxTrendSales) * 160} 
                     L 500 190 Z`}
                  fill="url(#salesGradient)"
                />

                {/* Trend Stroke Line */}
                <path
                  d={`M 0 ${190 - (trendData[0].sales / maxTrendSales) * 160} 
                     C 35 ${190 - (trendData[0].sales / maxTrendSales) * 160}, 35 ${190 - (trendData[1].sales / maxTrendSales) * 160}, 71 ${190 - (trendData[1].sales / maxTrendSales) * 160}
                     C 106 ${190 - (trendData[1].sales / maxTrendSales) * 160}, 106 ${190 - (trendData[2].sales / maxTrendSales) * 160}, 142 ${190 - (trendData[2].sales / maxTrendSales) * 160}
                     C 178 ${190 - (trendData[2].sales / maxTrendSales) * 160}, 178 ${190 - (trendData[3].sales / maxTrendSales) * 160}, 214 ${190 - (trendData[3].sales / maxTrendSales) * 160}
                     C 250 ${190 - (trendData[3].sales / maxTrendSales) * 160}, 250 ${190 - (trendData[4].sales / maxTrendSales) * 160}, 285 ${190 - (trendData[4].sales / maxTrendSales) * 160}
                     C 321 ${190 - (trendData[4].sales / maxTrendSales) * 160}, 321 ${190 - (trendData[5].sales / maxTrendSales) * 160}, 357 ${190 - (trendData[5].sales / maxTrendSales) * 160}
                     C 392 ${190 - (trendData[5].sales / maxTrendSales) * 160}, 392 ${190 - (trendData[6].sales / maxTrendSales) * 160}, 428 ${190 - (trendData[6].sales / maxTrendSales) * 160}
                     C 464 ${190 - (trendData[6].sales / maxTrendSales) * 160}, 464 ${190 - (trendData[7].sales / maxTrendSales) * 160}, 500 ${190 - (trendData[7].sales / maxTrendSales) * 160}`}
                  fill="none"
                  stroke="#7C3AED"
                  strokeWidth="3"
                />

                {/* Data Points */}
                {trendData.map((d, index) => {
                  const cx = (index / (trendData.length - 1)) * 500;
                  const cy = 190 - (d.sales / maxTrendSales) * 160;
                  return (
                    <g key={index} className="group cursor-pointer">
                      <circle cx={cx} cy={cy} r="5" fill="#FFFFFF" stroke="#7C3AED" strokeWidth="2.5" />
                      <circle cx={cx} cy={cy} r="8" fill="#7C3AED" fillOpacity="0.2" className="opacity-0 group-hover:opacity-100 transition-opacity" />
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* X-Axis Labels */}
            <div className="mt-3 flex justify-between text-xs text-gray-400 font-medium px-1">
              {trendData.map((d, i) => (
                <span key={i}>{d.time}</span>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Sales by Hour Peak Distribution Bar Chart */}
        <Card className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm lg:col-span-5">
          <CardHeader className="p-0 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-bold text-gray-900">Peak Sales Distribution</CardTitle>
                <p className="text-xs text-gray-500 mt-1">Hourly order volume density</p>
              </div>
              <span className="text-xs font-semibold text-purple-600 bg-purple-50 px-2 py-1 rounded">Hourly Peak</span>
            </div>
          </CardHeader>
          <CardContent className="p-0 pt-2">
            <div className="flex items-end justify-between gap-1 h-52 pt-4">
              {hourlyData.map((item, idx) => {
                const heightPercent = Math.round((item.orders / maxHourlyOrders) * 100);
                const isHovered = activeHourlyHour === item.hour;
                return (
                  <div
                    key={idx}
                    className="flex-1 flex flex-col items-center group relative cursor-pointer"
                    onMouseEnter={() => setActiveHourlyHour(item.hour)}
                    onMouseLeave={() => setActiveHourlyHour(null)}
                  >
                    {/* Tooltip on hover */}
                    {isHovered && (
                      <div className="absolute -top-12 z-20 rounded bg-gray-900 px-2 py-1 text-center text-xs text-white shadow-lg whitespace-nowrap">
                        <p className="font-bold">{item.orders} Orders</p>
                        <p className="text-[10px] text-purple-300">{formatCurrency(item.sales)}</p>
                      </div>
                    )}

                    <div className="w-full flex items-end justify-center h-40">
                      <div
                        style={{ height: `${heightPercent}%` }}
                        className={`w-full max-w-[22px] rounded-t-md transition-all duration-300 ${
                          item.isPeak
                            ? 'bg-gradient-to-t from-purple-700 to-purple-500 shadow-sm shadow-purple-200'
                            : 'bg-purple-100 group-hover:bg-purple-300'
                        }`}
                      />
                    </div>
                    <span className="mt-2 text-[10px] text-gray-500 font-medium tracking-tighter truncate w-full text-center">
                      {item.hour.replace(' ', '')}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Middle Grid: Revenue by Branch + Payment Methods + Order Type Distribution */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Revenue by Branch Comparative Bar Chart */}
        <Card className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm lg:col-span-5">
          <CardHeader className="p-0 pb-4">
            <CardTitle className="text-lg font-bold text-gray-900">Revenue by Branch</CardTitle>
            <p className="text-xs text-gray-500 mt-1">Comparative performance across outlets</p>
          </CardHeader>
          <CardContent className="p-0 pt-2 space-y-4">
            {branchData.map((branch, i) => {
              const widthPct = Math.round((branch.revenue / maxBranchRevenue) * 100);
              const isSelected = selectedBranch === 'All Branches' || selectedBranch === branch.name;
              return (
                <div key={i} className={`space-y-1.5 ${!isSelected ? 'opacity-40' : ''}`}>
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-gray-800">{branch.name}</span>
                    <span className="text-purple-700 font-bold">{formatCurrency(branch.revenue)}</span>
                  </div>
                  <div className="relative h-3.5 w-full rounded-full bg-gray-100 overflow-hidden">
                    <div
                      style={{ width: `${widthPct}%` }}
                      className="h-full rounded-full bg-gradient-to-r from-purple-600 to-indigo-500 transition-all duration-500"
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-gray-400">
                    <span>{branch.orders} completed orders</span>
                    <span>{branch.share}% total revenue</span>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Payment Method Distribution Donut Chart */}
        <Card className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm lg:col-span-3">
          <CardHeader className="p-0 pb-4">
            <CardTitle className="text-lg font-bold text-gray-900">Payment Breakdown</CardTitle>
            <p className="text-xs text-gray-500 mt-1">Collection by payment mode</p>
          </CardHeader>
          <CardContent className="p-0 pt-2 flex flex-col items-center">
            {/* SVG Donut Chart */}
            <div className="relative h-44 w-44">
              <svg className="h-full w-full" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="38" fill="none" stroke="#F3F4F6" strokeWidth="14" />
                {paymentMethods.map((pm, i) => (
                  <circle
                    key={i}
                    cx="50"
                    cy="50"
                    r="38"
                    fill="none"
                    stroke={pm.color}
                    strokeWidth="14"
                    strokeDasharray={pm.dashArray}
                    strokeDashoffset={pm.dashOffset}
                    transform="rotate(-90 50 50)"
                  />
                ))}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-[11px] font-semibold uppercase text-gray-400">Total</span>
                <span className="text-sm font-bold text-gray-900">{formatCurrency(48250)}</span>
              </div>
            </div>

            {/* Legend */}
            <div className="mt-4 w-full space-y-2 text-xs">
              {paymentMethods.map((pm, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: pm.color }} />
                    <span className="text-gray-700 font-medium">{pm.type}</span>
                  </div>
                  <span className="font-bold text-gray-900">{pm.percentage}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Order Type Distribution Donut Chart */}
        <Card className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm lg:col-span-4">
          <CardHeader className="p-0 pb-4">
            <CardTitle className="text-lg font-bold text-gray-900">Order Type Split</CardTitle>
            <p className="text-xs text-gray-500 mt-1">Dine In vs Takeaway vs Delivery</p>
          </CardHeader>
          <CardContent className="p-0 pt-2 flex flex-col items-center">
            {/* SVG Donut Chart */}
            <div className="relative h-44 w-44">
              <svg className="h-full w-full" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="38" fill="none" stroke="#F3F4F6" strokeWidth="14" />
                {orderTypes.map((ot, i) => (
                  <circle
                    key={i}
                    cx="50"
                    cy="50"
                    r="38"
                    fill="none"
                    stroke={ot.color}
                    strokeWidth="14"
                    strokeDasharray={ot.dashArray}
                    strokeDashoffset={ot.dashOffset}
                    transform="rotate(-90 50 50)"
                  />
                ))}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-xl font-bold text-gray-900">142</span>
                <span className="text-[10px] uppercase font-semibold text-gray-400">Total Orders</span>
              </div>
            </div>

            {/* Order Type Legend & Counts */}
            <div className="mt-4 w-full space-y-2 text-xs">
              {orderTypes.map((ot, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-md" style={{ backgroundColor: ot.color }} />
                    <span className="font-semibold text-gray-800">{ot.type}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-gray-900 mr-2">{ot.count} orders</span>
                    <span className="text-gray-500 font-medium">({ot.percentage}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Grid: Top Selling Menu Items Ranked Horizontal Progress List */}
      <Card className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <CardHeader className="p-0 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-bold text-gray-900">Top Selling Menu Items</CardTitle>
              <p className="text-xs text-gray-500 mt-1">Highest grossing items ranked by order count & volume</p>
            </div>
            <Badge variant="outline" className="border-purple-200 bg-purple-50 text-purple-700">
              Ranked Top 6
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0 pt-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
            {topItems.map((item) => (
              <div key={item.rank} className="flex items-center gap-3 p-3 rounded-lg hover:bg-purple-50/50 transition-colors">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    item.rank === 1
                      ? 'bg-amber-100 text-amber-800 border border-amber-300'
                      : item.rank === 2
                      ? 'bg-gray-100 text-gray-800 border border-gray-300'
                      : item.rank === 3
                      ? 'bg-amber-800/10 text-amber-900 border border-amber-800/30'
                      : 'bg-purple-50 text-purple-700'
                  }`}
                >
                  #{item.rank}
                </span>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-gray-900">{item.name}</span>
                    <span className="font-bold text-purple-700">{formatCurrency(item.revenue)}</span>
                  </div>
                  <div className="relative h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                    <div
                      style={{ width: `${item.percentage}%` }}
                      className="h-full rounded-full bg-gradient-to-r from-purple-600 to-purple-400"
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-gray-400">
                    <span>Category: {item.category}</span>
                    <span>{item.count} items ordered</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AnalyticsCharts;
