import { Component, useEffect, useState } from "react";

import { AppraisalProvider } from "@/lib/appraisal-store";
import { BudgetProvider } from "@/lib/budget-store";
import { Dashboard } from "@/routes/index";
import { SheetPage } from "@/routes/sheet";
import { EmployeeMaster } from "@/pages/EmployeeMaster";
import { SettingsPage } from "@/pages/SettingsPage";

//this might be remove later (detailscreen)
import { DetailScreenPage } from "@/components/appraisal/DetailScreenPage";
import { AppShell } from "./components/appraisal/AppShell";
import { BudgetMasterPage } from "@/components/employee-master/BudgetMasterPage";
import { BudgetDistributionPage } from "@/components/employee-master/BudgetDistributionPage";
import { CatalystAuthGate, useCatalystUser } from "@/lib/catalyst-auth";
import { SettingsProvider } from "@/lib/settings-store";
import { AccessProvider, HR_TAB_SCREENS, NoAccessPage, PATH_SCREENS, useAccess } from "@/lib/access-store";

const TECH_ED_PATHS = ["/", "/sheet", "/employee-master", "/detail-screen", "/budget-distribution", "/settings" ];

// A crash in one screen shows a message instead of blanking the whole app.
// It is keyed by path, so navigating to another screen clears the error.
class ScreenErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Screen crashed:", error, info?.componentStack);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md rounded-lg border border-red-200 bg-white p-5 text-sm shadow-sm">
          <p className="font-semibold text-red-700">This screen failed to load.</p>
          <p className="mt-2 break-words text-muted-foreground">
            {String(this.state.error?.message || this.state.error)}
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md bg-[#173b63] px-3 py-1.5 text-xs font-medium text-white"
            >
              Reload
            </button>
            <a href="/" className="rounded-md border px-3 py-1.5 text-xs font-medium">
              Go to Dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }
}

const FIRST_SCREEN_PATHS = [
  ["dashboard", "/"],
  ["appraisalSheet", "/sheet"],
  ["detailScreen", "/detail-screen"],
  ["budgetDistribution", "/budget-distribution"],
];

// With access rules (/me ok): the path to show, or null when nothing is allowed.
function accessAllowedPath(path, access, isTechEd = false) {
  const hrTabs = Object.keys(HR_TAB_SCREENS).filter((tab) => access.canScreen(HR_TAB_SCREENS[tab]));
  if (isTechEd && TECH_ED_PATHS.includes(path)) return path;
  const allowed =
    path === "/employee-master"
      ? hrTabs.length > 0
      : access.canScreen(PATH_SCREENS[path] || "dashboard");
  if (allowed) return path;
  const first = FIRST_SCREEN_PATHS.find(([key]) => access.canScreen(key));
  if (first) return first[1];
  if (hrTabs.length) return `/employee-master?tab=${hrTabs[0]}`;
  return null;
}

// Rendered inside <CatalystAuthGate> so useCatalystUser() sees the signed-in user.
function AppRoutes() {
  const [path, setPath] = useState(window.location.pathname);
  const user = useCatalystUser();
  const access = useAccess();
  const role = String(user?.role || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const isTechEd = role.includes("teched");
  // Access rules replace the hard-coded Tech-ED restriction only when /me answered.
  const targetPath = access.ok
    ? accessAllowedPath(path, access, isTechEd)
    : isTechEd && !TECH_ED_PATHS.includes(path)
      ? "/employee-master"
      : path;
  const effectivePath = targetPath === null ? path : targetPath.split("?")[0];

  useEffect(() => {
    const onPopState = () => {
      setPath(window.location.pathname);
    };

    window.addEventListener("popstate", onPopState);

    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  useEffect(() => {
    if (access.loading || targetPath === null) return;
    if (effectivePath !== path) {
      window.history.replaceState({}, "", targetPath);
      setPath(effectivePath);
    }
  }, [access.loading, targetPath, effectivePath, path]);

  if (access.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (access.denied) {
    return <NoAccessPage message={access.error} />;
  }

  if (access.ok && targetPath === null) {
    return (
      <NoAccessPage message="You do not have access to any screen. Contact HR if you think this is wrong." />
    );
  }

  let page;

  if (effectivePath === "/sheet") {
    page = <SheetPage />;
  } else if (effectivePath === "/employee-master") {
    page = <EmployeeMaster />;
  } else if (effectivePath === "/detail-screen") {
    page = (
      <AppShell>
        <DetailScreenPage />
      </AppShell>
    );
  } else if (effectivePath === "/budget-master") {
    page = (
      <AppShell>
        <BudgetMasterPage />
      </AppShell>
    );
  } else if (effectivePath === "/budget-distribution") {
    page = (
      <AppShell>
        <BudgetDistributionPage />
      </AppShell>
    );
  } else if (effectivePath === "/settings") {
    page = <SettingsPage />;
  } else {
    page = <Dashboard />;
  }

  return (
    <SettingsProvider>
      <AppraisalProvider>
        <BudgetProvider>
          <ScreenErrorBoundary key={effectivePath}>{page}</ScreenErrorBoundary>
        </BudgetProvider>
      </AppraisalProvider>
    </SettingsProvider>
  );
}

export default function App() {
  return (
    <CatalystAuthGate>
      <AccessProvider>
        <AppRoutes />
      </AccessProvider>
    </CatalystAuthGate>
  );
}
