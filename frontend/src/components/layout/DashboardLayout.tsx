import React from 'react';
import { Outlet } from 'react-router-dom';
import { BranchProvider } from '../../context/BranchContext';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { Footer } from './Footer';

export const DashboardLayout: React.FC = () => {
  return (
    <BranchProvider>
      <div className="min-h-screen flex flex-col bg-background text-foreground font-inter text-sm">
        <Header />
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <main className="flex-1 p-6 overflow-y-auto min-w-0">
              <Outlet />
            </main>
            <Footer />
          </div>
        </div>
      </div>
    </BranchProvider>
  );
};

export default DashboardLayout;
