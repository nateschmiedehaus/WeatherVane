import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ConnectorProgress, AutomationAuditPreview } from "../demo/onboarding";
import type { AutomationMode } from "../types/automation";

type DemoChannel = "meta" | "google" | "email" | "pos";

export interface DemoPreferences {
  primaryChannel: DemoChannel;
  automationComfort: AutomationMode;
}

interface DemoContextValue {
  isTourOpen: boolean;
  isDemoActive: boolean;
  preferences: DemoPreferences;
  onboardingProgress: DemoOnboardingProgress | null;
  setOnboardingProgress: (payload: DemoOnboardingProgress | null) => void;
  openTour: () => void;
  closeTour: () => void;
  setPreferences: (prefs: DemoPreferences) => void;
  activateDemo: () => void;
  resetDemo: () => void;
}

const DemoContext = createContext<DemoContextValue | undefined>(undefined);

const STORAGE_KEY = "wvo-demo-preferences";
const ACTIVE_KEY = "wvo-demo-active";

const defaultPreferences: DemoPreferences = {
  primaryChannel: "meta",
  automationComfort: "assist",
};

export interface DemoOnboardingProgress {
  mode: "demo" | "live";
  fallbackReason?: string | null;
  generatedAt?: string | null;
  isFallback: boolean;
  connectors: ConnectorProgress[];
  audits: AutomationAuditPreview[];
}

const parsePreferences = (raw: string | null): DemoPreferences => {
  if (!raw) return defaultPreferences;
  try {
    const parsed = JSON.parse(raw) as Partial<DemoPreferences>;
    const primaryChannel: DemoChannel =
      parsed.primaryChannel === "google"
        ? "google"
        : parsed.primaryChannel === "email"
        ? "email"
        : parsed.primaryChannel === "pos"
        ? "pos"
        : "meta";
    const automationComfort: AutomationMode =
      parsed.automationComfort === "manual"
        ? "manual"
        : parsed.automationComfort === "automation"
        ? "automation"
        : parsed.automationComfort === "autopilot"
        ? "autopilot"
        : "assist";
    return { primaryChannel, automationComfort };
  } catch {
    return defaultPreferences;
  }
};

export function DemoProvider({ children }: { children: ReactNode }) {
  const [isTourOpen, setIsTourOpen] = useState(false);
  const [preferences, setPreferencesState] = useState<DemoPreferences>(() => {
    if (typeof window === "undefined") {
      return defaultPreferences;
    }
    return parsePreferences(window.localStorage.getItem(STORAGE_KEY));
  });
  const [isDemoActive, setDemoActive] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.localStorage.getItem(ACTIVE_KEY) === "true";
  });
  const [onboardingProgress, setOnboardingProgress] =
    useState<DemoOnboardingProgress | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isDemoActive) {
      window.localStorage.setItem(ACTIVE_KEY, "true");
    } else {
      window.localStorage.removeItem(ACTIVE_KEY);
    }
  }, [isDemoActive]);

  const openTour = useCallback(() => setIsTourOpen(true), []);
  const closeTour = useCallback(() => setIsTourOpen(false), []);

  const setPreferences = useCallback((next: DemoPreferences) => {
    setPreferencesState(next);
  }, []);

  const activateDemo = useCallback(() => {
    setDemoActive(true);
    setIsTourOpen(false);
  }, []);

  const resetDemo = useCallback(() => {
    setDemoActive(false);
    setPreferencesState(defaultPreferences);
    setIsTourOpen(false);
  }, []);

  const value = useMemo<DemoContextValue>(
    () => ({
      isTourOpen,
      isDemoActive,
      preferences,
      onboardingProgress,
      setOnboardingProgress,
      openTour,
      closeTour,
      setPreferences,
      activateDemo,
      resetDemo,
    }),
    [
      isTourOpen,
      isDemoActive,
      preferences,
      onboardingProgress,
      setOnboardingProgress,
      openTour,
      closeTour,
      setPreferences,
      activateDemo,
      resetDemo,
    ],
  );

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo() {
  const context = useContext(DemoContext);
  if (!context) {
    throw new Error("useDemo must be used within a DemoProvider");
  }
  return context;
}
