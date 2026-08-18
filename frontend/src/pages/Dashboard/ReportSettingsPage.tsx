import React from 'react';
import { useBranchContext } from '../../context/BranchContext';
import { FileText } from 'lucide-react';

export const ReportSettingsPage: React.FC = () => {
  const { activeBranchId, activeBranch } = useBranchContext();
  const branchLabel = activeBranchId === 'all' ? 'All Branches' : (activeBranch?.name || 'Selected Branch');

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">URY Report Settings</h1>
          <p className="text-sm text-gray-500 mt-1">
            Configure automated daily reports, email digests, and sales summary export formats for <span className="font-semibold text-primary">{branchLabel}</span>
          </p>
        </div>
        <div className="w-10 h-10 rounded-xl bg-purple-50 text-primary flex items-center justify-center">
          <FileText className="w-5 h-5" />
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs">
        <div className="border-2 border-dashed border-gray-200 rounded-xl p-12 text-center text-gray-400">
          Advanced Report Settings & Export Schedules for {branchLabel}
        </div>
      </div>
    </div>
  );
};
