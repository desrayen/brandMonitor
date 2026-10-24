import { Theme } from './settings/types';
import { IGViralAnalytics } from './components/generated/IGViralAnalytics';

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

  return <IGViralAnalytics />;
}

export default App;