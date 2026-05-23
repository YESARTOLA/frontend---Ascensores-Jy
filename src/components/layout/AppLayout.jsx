import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';
import MobileNav from './MobileNav.jsx';
import { FilePreviewProvider } from '../common/FilePreview.jsx';

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  return (
    <FilePreviewProvider>
      <div className="relative min-h-full flex">
        {/* fondo decorativo global (NO oscuro) */}
        <div className="pointer-events-none fixed inset-0 -z-10">
          <div className="absolute inset-0 bg-ivory-50" />
          <div className="absolute inset-0 bg-mesh-warm opacity-60" />
          <div className="absolute inset-0 bg-grid-soft bg-grid-32 opacity-[0.05]" />
          <div className="absolute inset-0 bg-noise opacity-30 mix-blend-multiply" />
        </div>

        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <div className="flex-1 min-w-0 flex flex-col lg:pl-64">
          <Topbar onMenu={() => setSidebarOpen(true)} />
          <main key={location.pathname}
                className="flex-1 px-4 sm:px-6 lg:px-8 py-5 sm:py-8 pb-28 lg:pb-10 animate-rise">
            <Outlet />
          </main>
          <MobileNav />
        </div>
      </div>
    </FilePreviewProvider>
  );
}
