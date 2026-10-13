import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../stores/theme.js';

/** Switch between the dark (default) and light theme. */
export default function ThemeToggle({ className = 'iconbtn' }) {
  const { theme, setTheme } = useTheme();
  return (
    <button type="button" className={className} aria-label="Toggle theme" title="Toggle light/dark"
      onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
      {theme === 'light' ? <Moon className="i" /> : <Sun className="i" />}
    </button>
  );
}
