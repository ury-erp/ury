# Reporting and P&L

## Overview
The URY application introduces a comprehensive Daily Profit and Loss (P&L) tracking system designed specifically for the hospitality industry. It allows restaurant managers to evaluate daily financial performance by aggregating sales, cost of goods, direct and indirect expenses, and material consumption.

## Daily P&L Doctype (`URY Daily P and L`)
The core of the reporting system is the `URY Daily P and L` doctype. It provides a daily snapshot of the restaurant's financial health.

### Key Sections and Metrics
- **Sales & Revenue**: Tracks `Gross Sales`, `Discounts & Round Offs`, `Tax`, and calculates `Net Sales`.
- **Cost of Goods Sold (COGS)**: Automatically pulls data from the `URY Cost Of Goods` child table to calculate the total cost of materials used for the day's sales.
- **Direct Expenses**: Computes operational costs directly tied to daily operations.
- **Gross Profit**: Calculated as `Net Sales` - `COGS` - `Total Direct Expenses`.
- **Indirect Expenses & Employee Costs**: Tracks fixed and variable indirect expenses, including depreciation and employee payouts.
- **Net Profit**: The final daily profit/loss calculated after deducting all indirect and other expenses from the Gross Profit.

### Breakups and Detailed Tracking
The P&L doctype uses several child tables for granular tracking:
- **Materials Consumed (`URY P and L Materials`)**: Tracks the exact units of materials used daily.
- **Expenses Breakup (`URY P and L Breakup`)**: Used across direct, indirect, employee, and other expenses to categorize and itemize costs.
- **Electricity Tracking**: Fields for `Electricity Opening` and `Electricity Closing` readings help calculate daily energy consumption and costs.

## Cost of Goods (`URY Cost Of Goods`)
The `URY Cost Of Goods` doctype acts as a child table to the Daily P&L. It lists the items sold, their quantities, and their calculated cost prices, providing a detailed breakdown of the total COGS value used in the profitability calculation.

## Role Access
Access to view, generate, and submit the Daily P&L is restricted to the `System Manager` and `URY Manager` roles, ensuring sensitive financial data is protected.
