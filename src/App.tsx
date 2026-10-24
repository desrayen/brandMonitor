import { Theme } from './settings/types';
import { IGViralAnalytics } from './components/generated/IGViralAnalytics';
import { AuthGate } from './components/auth/AuthGate';

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

  return <AuthGate><IGViralAnalytics /></AuthGate>;
}

export default App;