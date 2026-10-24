import { lazy, Suspense } from 'react';
import { Theme } from './settings/types';
import { AuthGate } from './components/auth/AuthGate';

// Dashboard (incl. ECharts) is only downloaded after sign-in
const IGViralAnalytics = lazy(() => import('./components/generated/IGViralAnalytics').then(m => ({ default: m.IGViralAnalytics })));

let theme: Theme = 'light';

function App() {
  function setTheme(theme: Theme) {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  setTheme(theme);

  return <AuthGate>
    <Suspense fallback={<div className="auth-screen" />}>
      <IGViralAnalytics />
    </Suspense>
  </AuthGate>;
}

export default App;
