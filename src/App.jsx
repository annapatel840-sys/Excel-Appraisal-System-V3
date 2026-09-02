import { useEffect, useState } from 'react';
import { AppraisalProvider } from '@/lib/appraisal-store';
import { Dashboard } from '@/routes/index';
import { SheetPage } from '@/routes/sheet';

export default function App() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  return (
    <AppraisalProvider>
      {path === '/sheet' ? <SheetPage /> : <Dashboard />}
    </AppraisalProvider>
  );
}
