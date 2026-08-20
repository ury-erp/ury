import { Navigate } from 'react-router-dom';
import { reportsRegistry } from './reportsRegistry';

export function ReportsHome() {
  const firstReport = reportsRegistry[0];

  if (firstReport?.path) {
    return <Navigate to={`/reports/${firstReport.path}`} replace />;
  }

  return (
    <div className="flex items-center justify-center h-full min-h-[50vh]">
      <p className="text-muted-foreground text-lg">Select a report from the sidebar.</p>
    </div>
  );
}

