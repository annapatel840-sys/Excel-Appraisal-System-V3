import { useEffect, useState } from 'react';
import { AppraisalProvider } from '@/lib/appraisal-store';
import { Dashboard } from '@/routes/index';
import { SheetPage } from '@/routes/sheet';

function getAppPath() {
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
  return pathname === '/sheet' || pathname.endsWith('/sheet') ? '/sheet' : '/';
}

export function navigateTo(path) {
  const normalized = path === '/sheet' ? '/sheet' : '/';
  window.history.pushState({}, '', normalized);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export default function App() {
  const [path, setPath] = useState(getAppPath);

  useEffect(() => {
    const onPopState = () => setPath(getAppPath());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  return (
    <AppraisalProvider>
      {path === '/sheet' ? <SheetPage /> : <Dashboard />}
    </AppraisalProvider>
  );
}
