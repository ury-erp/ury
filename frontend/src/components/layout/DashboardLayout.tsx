import React from 'react';
import { Outlet } from 'react-router-dom';
import { BranchProvider } from '../../context/BranchContext';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

export const DashboardLayout: React.FC = () => {
  return (
    <BranchProvider>
      <div className="min-h-screen flex flex-col bg-gray-50 text-gray-900 font-sans">
        <Header />
        <div className="flex flex-1">
          <Sidebar />
          <main className="flex-1 p-6 overflow-y-auto min-w-0">
            <Outlet />
          </main>
        </div>
      </div>
    </BranchProvider>
  );
};

export default DashboardLayout;
