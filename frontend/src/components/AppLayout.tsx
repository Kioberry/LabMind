'use client';
import Sidebar from './Sidebar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar />
      <main className="main-content flex-1 flex flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}
