import { Outlet } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';

const AppLayout = () => {
  return (
    <div className="flex flex-col h-screen bg-gray-100 font-inter">
      <Header />
      <div className="flex-1 overflow-hidden">
        <Outlet />
      </div>
      <Footer />
    </div>
  );
};

export default AppLayout;
