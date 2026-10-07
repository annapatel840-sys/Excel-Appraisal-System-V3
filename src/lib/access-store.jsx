import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { catalystFetch, catalystFunctionUrl } from "./catalyst-api";
import { useCatalystSignOut, useCatalystUser } from "./catalyst-auth";

// Per-user access rules from accessapi /me (see docs/ACCESS_SPEC.md).
// Fallback: whenever /me is unavailable (not deployed, 404, network error,
// ok:false while not enforced) every helper answers permissively, so the app
// behaves exactly as it did before access control existed.

const CACHE_KEY = "access-me-cache-v1";
const LEVEL_RANK = { none: 0, view: 1, edit: 2 };

// HR Operations tabs (EmployeeMaster ?tab=...) → screen key.
export const HR_TAB_SCREENS = {
  roster: "employeeMaster",
  eligibility: "employeeMaster",
  "appraisal-cycle": "cycleMaster",
  "payroll-data": "payroll",
  "payroll-upload": "payroll",
  "team-changes": "teamChanges",
  "budget-master": "budgetAllocation",
  "budget-distribution": "budgetDistribution",
  delegation: "delegation",
  access: "access",
};

// Top-level routes → screen key (the HR Operations page is decided per tab).
export const PATH_SCREENS = {
  "/": "dashboard",
  "/sheet": "appraisalSheet",
  "/detail-screen": "detailScreen",
  "/budget-master": "budgetAllocation",
  "/budget-distribution": "budgetDistribution",
  "/settings": "settings",
};

const AccessContext = createContext(null);

function readCache(cacheId) {
  try {
    const cached = JSON.parse(window.sessionStorage.getItem(CACHE_KEY) || "null");
    return cached && cached.id === cacheId ? cached : null;
  } catch {
    return null;
  }
}

function writeCache(cacheId, version, me) {
  try {
    window.sessionStorage.setItem(CACHE_KEY, JSON.stringify({ id: cacheId, version, me }));
  } catch {
    // Storage full / blocked: just skip caching.
  }
}

async function getJson(path) {
  const response = await catalystFetch(catalystFunctionUrl("accessapi") + path);
  if (!response.ok) {
    throw new Error(`Access service returned HTTP ${response.status}.`);
  }
  return response.json();
}

async function loadMe(cacheId) {
  let version = null;
  try {
    const v = await getJson("version");
    if (v?.ok) version = v.version ?? null;
  } catch {
    version = null;
  }
  if (version !== null) {
    const cached = readCache(cacheId);
    if (cached && String(cached.version) === String(version) && cached.me?.ok) {
      return cached.me;
    }
  }
  const me = await getJson("me");
  if (me?.ok === true && version !== null) writeCache(cacheId, version, me);
  return me;
}

export function AccessProvider({ children }) {
  const user = useCatalystUser();
  const cacheId = String(user?.email || user?.email_id || user?.user_id || "me").toLowerCase();
  const [state, setState] = useState({ loading: true, me: null, error: "" });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let active = true;
    setState((prev) => ({ ...prev, loading: true }));
    loadMe(cacheId)
      .then((me) => {
        if (active) setState({ loading: false, me: me || null, error: me?.ok ? "" : me?.error || "" });
      })
      .catch((error) => {
        if (active) setState({ loading: false, me: null, error: error?.message || String(error) });
      });
    return () => {
      active = false;
    };
  }, [cacheId, nonce]);

  const reload = useCallback(() => {
    try {
      window.sessionStorage.removeItem(CACHE_KEY);
    } catch {
      // ignore
    }
    setNonce((n) => n + 1);
  }, []);

  const value = useMemo(() => {
    const me = state.me;
    const ok = me?.ok === true;
    const enforced = me?.enforced === true;
    const screens = (ok && me.screens) || {};
    const actions = (ok && me.actions) || {};
    const fields = (ok && me.fields) || {};

    const screenLevel = (key) => {
      if (!ok) return "edit";
      const level = screens[key];
      return LEVEL_RANK[level] !== undefined ? level : "none";
    };
    const canScreen = (key, level = "view") =>
      LEVEL_RANK[screenLevel(key)] >= (LEVEL_RANK[level] ?? 1);
    const canAction = (key) => (!ok ? true : actions[key] === true);
    const fieldLimit = (key) => {
      if (!ok) return "edit";
      const limit = fields[key];
      return limit === "read" || limit === "hidden" ? limit : "edit";
    };

    return {
      loading: state.loading,
      ready: !state.loading,
      enforced,
      ok,
      error: state.error,
      denied: !state.loading && !ok && enforced,
      role: ok ? me.role || "" : "",
      roleLabel: ok ? me.roleLabel || me.role || "" : "",
      user: ok ? me.user || null : null,
      scope: ok ? me.scope || null : null,
      canScreen,
      screenLevel,
      canAction,
      fieldLimit,
      canEditField: (key) => fieldLimit(key) === "edit",
      isHidden: (key) => fieldLimit(key) === "hidden",
      reload,
    };
  }, [state, reload]);

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

const PERMISSIVE = {
  loading: false,
  ready: true,
  enforced: false,
  ok: false,
  error: "",
  denied: false,
  role: "",
  roleLabel: "",
  user: null,
  scope: null,
  canScreen: () => true,
  screenLevel: () => "edit",
  canAction: () => true,
  fieldLimit: () => "edit",
  canEditField: () => true,
  isHidden: () => false,
  reload: () => {},
};

// Outside a provider (or before it exists) everything is allowed.
export function useAccess() {
  return useContext(AccessContext) || PERMISSIVE;
}

export function NoAccessPage({ message }) {
  const signOut = useCatalystSignOut();
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-md rounded-lg border border-red-200 bg-white p-5 text-sm shadow-sm">
        <p className="font-semibold text-red-700">No access</p>
        <p className="mt-2 break-words text-muted-foreground">
          {message || "You do not have access to this application. Contact HR if you think this is wrong."}
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md border px-3 py-1.5 text-xs font-medium"
          >
            Retry
          </button>
          {signOut && (
            <button
              type="button"
              onClick={signOut}
              className="rounded-md bg-[#173b63] px-3 py-1.5 text-xs font-medium text-white"
            >
              Sign out
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
