import { LayoutDashboard, Table2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function AppShell({ children }) {
  const pathname = window.location.pathname;
  const nav = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/sheet', label: 'Appraisal Sheet', icon: Table2 },
  ];

  const navigate = (event, to) => {
    event.preventDefault();
    window.history.pushState({}, '', to);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center gap-6 px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">EA</span>
            <div>
              <h1 className="text-[15px] leading-tight font-semibold">Employee Appraisal Management</h1>
              <p className="text-xs text-muted-foreground">FY 2025-26 · Compensation Review</p>
            </div>
          </div>
          <nav className="ml-4 flex items-center gap-1">
            {nav.map((n) => (
              <a
                key={n.to}
                href={n.to}
                onClick={(e) => navigate(e, n.to)}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  pathname === n.to ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <n.icon className="size-4" />
                {n.label}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] px-5 py-6">{children}</main>
    </div>
  );
}
