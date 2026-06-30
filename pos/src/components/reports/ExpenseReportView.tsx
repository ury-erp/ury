import { useReportsStore, ExpenseItem } from '../../store/reports-store';
import { formatCurrency } from '../../lib/utils';

const ExpenseReportView = () => {
  const { expenseReport } = useReportsStore();

  if (!expenseReport) {
    return (
      <div className="text-center py-12 text-gray-400">
        Select a period to generate an expense report
      </div>
    );
  }

  const { fixed_expenses, variable_expenses, total_fixed, total_variable, total_expenses } = expenseReport;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-red-50 border border-red-100 rounded-lg p-4">
          <p className="text-xs text-gray-500 mb-1">Fixed Expenses</p>
          <p className="text-xl font-bold text-red-700">{formatCurrency(total_fixed)}</p>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-lg p-4">
          <p className="text-xs text-gray-500 mb-1">Variable Expenses</p>
          <p className="text-xl font-bold text-amber-700">{formatCurrency(total_variable)}</p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500 mb-1">Total Expenses</p>
          <p className="text-xl font-bold text-gray-900">{formatCurrency(total_expenses)}</p>
        </div>
      </div>

      {/* Fixed Expenses */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Fixed Expenses</h3>
        {fixed_expenses.length === 0 ? (
          <p className="text-gray-400 text-sm py-4">No fixed expenses recorded</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-start py-2 px-3 text-gray-500 font-medium">Type</th>
                <th className="text-start py-2 px-3 text-gray-500 font-medium">Description</th>
                <th className="text-end py-2 px-3 text-gray-500 font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {fixed_expenses.map((exp: ExpenseItem) => (
                <tr key={exp.name} className="border-b border-gray-50">
                  <td className="py-2 px-3 font-medium">{exp.expense_type}</td>
                  <td className="py-2 px-3 text-gray-500">{exp.description || '—'}</td>
                  <td className="py-2 px-3 text-end">{formatCurrency(exp.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Variable Expenses */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Variable Expenses</h3>
        {variable_expenses.length === 0 ? (
          <p className="text-gray-400 text-sm py-4">No variable expenses recorded for this period</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-start py-2 px-3 text-gray-500 font-medium">Date</th>
                <th className="text-start py-2 px-3 text-gray-500 font-medium">Type</th>
                <th className="text-start py-2 px-3 text-gray-500 font-medium">Description</th>
                <th className="text-end py-2 px-3 text-gray-500 font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {variable_expenses.map((exp: ExpenseItem) => (
                <tr key={exp.name} className="border-b border-gray-50">
                  <td className="py-2 px-3 text-gray-500">{exp.date || '—'}</td>
                  <td className="py-2 px-3 font-medium">{exp.expense_type}</td>
                  <td className="py-2 px-3 text-gray-500">{exp.description || '—'}</td>
                  <td className="py-2 px-3 text-end">{formatCurrency(exp.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default ExpenseReportView;
