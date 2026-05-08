'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '@/lib/api';

const NAV_ITEMS = [
  { label: 'Home', href: '/' },
  { label: 'History', href: '/history' },
  { label: 'Analysis', href: '/analysis' },
  { label: 'Experiments', href: '/experiments' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleReset = async () => {
    if (!window.confirm('Reset demo? This will clear all data from B3 onward.')) return;
    await api.reset();
    router.push('/');
  };

  return (
    <div className="w-56 shrink-0 border-r border-surface-border flex flex-col pt-10 pb-8">
      {/* Wordmark */}
      <div className="px-7 pb-8 border-b border-surface-border">
        <p className="text-accent text-xl tracking-[0.3em] uppercase font-bold">LabMind</p>
      </div>

      {/* Nav */}
      <nav className="flex flex-col flex-1 gap-0.5 px-4 pt-6">
        {NAV_ITEMS.map(({ label, href }) => (
          <Link
            key={href}
            href={href}
            className={`px-4 py-3 text-sm tracking-[0.14em] uppercase font-light transition-colors duration-200 rounded-lg hover-green ${
              pathname === href
                ? 'text-accent'
                : 'text-secondary'
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 pt-4 border-t border-surface-border">
        <button
          onClick={handleReset}
          className="w-full px-4 py-3 text-xs tracking-[0.14em] uppercase text-muted hover-green font-light transition-colors duration-200 text-left rounded-lg"
        >
          Reset Demo
        </button>
      </div>
    </div>
  );
}
