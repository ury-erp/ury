import React from 'react';
import { Outlet } from 'react-router-dom';
import { BranchProvider } from '../../context/BranchContext';
import { CompanyProvider } from '../../context/CompanyContext';
import { CurrencyScope } from '../../context/CurrencyContext';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
// import { Footer } from './Footer';

export const DashboardLayout: React.FC = () => {
  return (
    <CompanyProvider>
      <BranchProvider>
        <div className="h-screen flex flex-col bg-background text-foreground font-inter text-sm overflow-hidden">
          <Header />
          <div className="flex flex-1 min-h-0 overflow-hidden">
            <Sidebar />
            <main className="flex-1 p-6 overflow-y-auto min-w-0">
              <CurrencyScope>
                <Outlet />
              </CurrencyScope>
            </main>
          </div>
          {/* <Footer /> */}
        </div>
      </BranchProvider>
    </CompanyProvider>
  );
};

export default DashboardLayout;
