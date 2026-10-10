import { Outlet } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';
import OfflineBanner from './OfflineBanner';

const AppLayout = () => {
  return (
    <div className="flex flex-col h-screen bg-background">
      <Header />
      <OfflineBanner />
      <div className="flex-1 overflow-hidden">
        <Outlet />
      </div>
      <Footer />
    </div>
  );
};

export default AppLayout;
