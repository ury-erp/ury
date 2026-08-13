import React, { useState } from 'react';
import { formatCurrency } from '@ury/core';
import { Card, CardHeader, CardTitle, CardContent, Badge, Spinner } from '@ury/ui';
import { useBranchContext } from '../../context/BranchContext';
import { DashboardChartsData } from '../../services/dashboard';

interface AnalyticsChartsProps {
  chartsData: DashboardChartsData | null;
  loading: boolean;
}

export const AnalyticsCharts: React.FC<AnalyticsChartsProps> = ({ chartsData, loading }) => {
  const { selectedBranch } = useBranchContext();
  const [activeHourlyHour, setActiveHourlyHour] = useState<string | null>(null);

  // Sales Trend line data
  const trendData = chartsData?.sales_trend?.map(d => ({
    time: d.date ? d.date.split('-').slice(1).join('/') : '',
    sales: d.sales || 0
  })) || [];

  const maxTrendSales = Math.max(...trendData.map(d => d.sales), 1);
  const peakTrend = trendData.reduce((max, d) => d.sales > max.sales ? d : max, { time: 'No data', sales: 0 });

  // Hourly distribution data
  const hourlyData = chartsData?.hourly_sales?.map(d => ({
    hour: d.hour || '',
    sales: d.sales || 0
  })) || [];

  const maxHourlySales = Math.max(...hourlyData.map(d => d.sales), 1);
  const hourlyDataWithPeak = hourlyData.map(d => ({
    ...d,
    isPeak: d.sales > 0 && d.sales === maxHourlySales
  }));

  // Revenue by branch comparative data
  const totalRevenue = chartsData?.revenue_by_branch?.reduce((sum, b) => sum + (b.total || 0), 0) || 0;
  const branchData = chartsData?.revenue_by_branch?.map(b => ({
    name: b.branch,
    revenue: b.total || 0,
    share: totalRevenue > 0 ? Math.round((b.total / totalRevenue) * 100) : 0
  })) || [];
  const maxBranchRevenue = Math.max(...branchData.map(b => b.revenue), 1);

  // Payment method distribution
  const colors = ['#7C3AED', '#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#6366F1'];
  const totalPayment = chartsData?.payment_methods?.reduce((sum, pm) => sum + (pm.total || 0), 0) || 0;
  let currentOffset = 0;
  const paymentMethods = chartsData?.payment_methods?.map((pm, index) => {
    const amount = pm.total || 0;
    const percentage = totalPayment > 0 ? Math.round((amount / totalPayment) * 100) : 0;
    const color = colors[index % colors.length];
    const strokeVal = totalPayment > 0 ? (amount / totalPayment) * 238.76 : 0;
    const dashArray = `${strokeVal.toFixed(1)} ${(238.76 - strokeVal).toFixed(1)}`;
    const dashOffset = (-currentOffset).toFixed(1);
    currentOffset += strokeVal;
    return {
      type: pm.method || 'Unknown',
      percentage,
      amount,
      color,
      dashArray,
      dashOffset
    };
  }) || [];

  // Order type distribution
  const totalOrdersCount = chartsData?.order_types?.reduce((sum, ot) => sum + (ot.count || 0), 0) || 0;
  let otOffset = 0;
  const orderTypes = chartsData?.order_types?.map((ot, index) => {
    const count = ot.count || 0;
    const percentage = totalOrdersCount > 0 ? Math.round((count / totalOrdersCount) * 100) : 0;
    const color = colors[(index + 2) % colors.length];
    const strokeVal = totalOrdersCount > 0 ? (count / totalOrdersCount) * 238.76 : 0;
    const dashArray = `${strokeVal.toFixed(1)} ${(238.76 - strokeVal).toFixed(1)}`;
    const dashOffset = (-otOffset).toFixed(1);
    otOffset += strokeVal;
    return {
      type: ot.order_type || 'Unknown',
      percentage,
      count,
      color,
      dashArray,
      dashOffset
    };
  }) || [];

  // Top selling menu items
  const maxTopQty = chartsData?.top_items?.[0]?.total_qty || 1;
  const topItems = chartsData?.top_items?.map((item, index) => ({
    rank: index + 1,
    name: item.item_name,
    category: 'Sales Item',
    count: item.total_qty || 0,
    revenue: item.total_amount || 0,
    percentage: Math.round(((item.total_qty || 0) / maxTopQty) * 100)
  })) || [];

  let areaD = '';
  let lineD = '';
  if (trendData.length > 0) {
    const points = trendData.map((d, index) => {
      const cx = trendData.length > 1 ? (index / (trendData.length - 1)) * 500 : 0;
      const cy = 190 - (d.sales / maxTrendSales) * 160;
      return { cx, cy };
    });

    lineD = `M ${points[0].cx} ${points[0].cy}`;
    for (let i = 1; i < points.length; i++) {
      lineD += ` L ${points[i].cx} ${points[i].cy}`;
    }

    areaD = `M 0 190 L ${points[0].cx} ${points[0].cy}`;
    for (let i = 1; i < points.length; i++) {
      areaD += ` L ${points[i].cx} ${points[i].cy}`;
    }
    areaD += ` L 500 190 Z`;
  }

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
                Peak: {peakTrend.time} ({formatCurrency(peakTrend.sales)})
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0 pt-2">
            {loading ? (
              <div className="h-64 flex items-center justify-center">
                <Spinner className="w-6 h-6 text-primary" />
              </div>
            ) : trendData.length === 0 ? (
              <div className="h-64 flex items-center justify-center border border-dashed border-gray-200 rounded-lg text-gray-400 text-xs">
                No sales trend data available
              </div>
            ) : (
              <>
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
                    {areaD && <path d={areaD} fill="url(#salesGradient)" />}

                    {/* Trend Stroke Line */}
                    {lineD && <path d={lineD} fill="none" stroke="#7C3AED" strokeWidth="3" />}

                    {/* Data Points */}
                    {trendData.map((d, index) => {
                      const cx = trendData.length > 1 ? (index / (trendData.length - 1)) * 500 : 0;
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
              </>
            )}
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
            {loading ? (
              <div className="h-52 flex items-center justify-center">
                <Spinner className="w-6 h-6 text-primary" />
              </div>
            ) : hourlyDataWithPeak.length === 0 ? (
              <div className="h-52 flex items-center justify-center border border-dashed border-gray-200 rounded-lg text-gray-400 text-xs">
                No hourly data available
              </div>
            ) : (
              <div className="flex items-end justify-between gap-1 h-52 pt-4">
                {hourlyDataWithPeak.map((item, idx) => {
                  const heightPercent = Math.round((item.sales / maxHourlySales) * 100);
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
                          <p className="font-bold">{formatCurrency(item.sales)}</p>
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
                        {item.hour}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
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
            {loading ? (
              <div className="py-8 flex items-center justify-center">
                <Spinner className="w-6 h-6 text-primary" />
              </div>
            ) : branchData.length === 0 ? (
              <div className="py-8 flex items-center justify-center border border-dashed border-gray-200 rounded-lg text-gray-400 text-xs">
                No branch data available
              </div>
            ) : (
              branchData.map((branch, i) => {
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
                      <span>{branch.share}% total revenue</span>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Payment Method Distribution Donut Chart */}
        <Card className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm lg:col-span-3">
          <CardHeader className="p-0 pb-4">
            <CardTitle className="text-lg font-bold text-gray-900">Payment Breakdown</CardTitle>
            <p className="text-xs text-gray-500 mt-1">Collection by payment mode</p>
          </CardHeader>
          <CardContent className="p-0 pt-2 flex flex-col items-center">
            {loading ? (
              <div className="py-8 flex items-center justify-center">
                <Spinner className="w-6 h-6 text-primary" />
              </div>
            ) : paymentMethods.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-gray-400 text-xs gap-2">
                <div className="relative h-24 w-24">
                  <svg className="h-full w-full" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="38" fill="none" stroke="#F3F4F6" strokeWidth="14" />
                  </svg>
                </div>
                <span>No data</span>
              </div>
            ) : (
              <>
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
                    <span className="text-sm font-bold text-gray-900">{formatCurrency(totalPayment)}</span>
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
              </>
            )}
          </CardContent>
        </Card>

        {/* Order Type Distribution Donut Chart */}
        <Card className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm lg:col-span-4">
          <CardHeader className="p-0 pb-4">
            <CardTitle className="text-lg font-bold text-gray-900">Order Type Split</CardTitle>
            <p className="text-xs text-gray-500 mt-1">Dine In vs Takeaway vs Delivery</p>
          </CardHeader>
          <CardContent className="p-0 pt-2 flex flex-col items-center">
            {loading ? (
              <div className="py-8 flex items-center justify-center">
                <Spinner className="w-6 h-6 text-primary" />
              </div>
            ) : orderTypes.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-gray-400 text-xs gap-2">
                <div className="relative h-24 w-24">
                  <svg className="h-full w-full" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="38" fill="none" stroke="#F3F4F6" strokeWidth="14" />
                  </svg>
                </div>
                <span>No data</span>
              </div>
            ) : (
              <>
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
                    <span className="text-xl font-bold text-gray-900">{totalOrdersCount}</span>
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
              </>
            )}
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
              Ranked Top {topItems.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0 pt-2">
          {loading ? (
            <div className="py-12 flex items-center justify-center">
              <Spinner className="w-6 h-6 text-primary" />
            </div>
          ) : topItems.length === 0 ? (
            <div className="py-12 flex items-center justify-center border border-dashed border-gray-200 rounded-lg text-gray-400 text-xs">
              No top items data available
            </div>
          ) : (
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
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AnalyticsCharts;
