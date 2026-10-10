import { Outlet } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';
import OfflineBanner from './OfflineBanner';

const AppLayout = () => {
  return (
    // h-dvh, not h-screen: on a tablet browser 100vh includes the collapsing
    // URL bar, which pushed the footer and the bottom of every list off-screen.
    <div className="flex flex-col h-dvh bg-background">
      <Header />
      <OfflineBanner />
      {/* A flex column with min-h-0, so each page is given a definite height.
          As a plain block the pages' own `flex-1` meant nothing: the POS grew
          to its content's height, this wrapper clipped it, and the menu list —
          whose overflow-auto needs a bounded parent — never scrolled. */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <Outlet />
      </div>
      <Footer />
    </div>
  );
};

export default AppLayout;
