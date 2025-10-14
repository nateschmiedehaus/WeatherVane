import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type Theme = "aero" | "calm";

interface ThemeContextValue {
  theme: Theme;
  isCalm: boolean;
  setTheme: (next: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);
const STORAGE_KEY = "wvo-theme";

const isTheme = (value: string | null): value is Theme =>
  value === "aero" || value === "calm";

const readStoredTheme = (): Theme => {
  if (typeof window === "undefined") {
    return "aero";
  }
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (isTheme(stored)) {
    return stored;
  }
  const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
  return prefersLight ? "calm" : "aero";
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => readStoredTheme());
  const [hasUserChoice, setHasUserChoice] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return isTheme(window.localStorage.getItem(STORAGE_KEY));
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const root = document.documentElement;
    root.dataset.theme = theme;
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const handleChange = (event: MediaQueryListEvent) => {
      if (!hasUserChoice) {
        setTheme(event.matches ? "calm" : "aero");
      }
    };
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, [hasUserChoice]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      isCalm: theme === "calm",
      setTheme: (next) => {
        setHasUserChoice(true);
        setTheme(next);
      },
      toggleTheme: () => {
        setHasUserChoice(true);
        setTheme((current) => (current === "calm" ? "aero" : "calm"));
      },
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

