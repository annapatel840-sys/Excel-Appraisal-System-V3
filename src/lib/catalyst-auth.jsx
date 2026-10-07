import { createContext, useContext, useEffect, useState } from "react";

import { CATALYST_SESSION_EXPIRED_EVENT } from "./catalyst-api";
import { payrollCycleRequest } from "./payroll-cycle-api";

const CatalystAuthContext = createContext(null);
// Legacy key from an old sign-out workaround; it is only cleared now.
const SIGNED_OUT_STORAGE_KEY = "catalyst-app-signed-out";

export function useCatalystUser() {
  return useContext(CatalystAuthContext)?.user ?? null;
}

export function useCatalystSignOut() {
  return useContext(CatalystAuthContext)?.signOut;
}

// Signed in only when Catalyst reports 200 with a user id; a logged-out
// browser resolves with status 400 and empty content.
function isSignedInResult(result) {
  return result?.status === 200 && Boolean(result?.content?.user_id);
}

function isUnauthorizedError(error) {
  return (
    error?.status === 401 ||
    error?.statusCode === 401 ||
    error?.response?.status === 401 ||
    error?.code === 700
  );
}

export function CatalystAuthGate({ children }) {
  const [user, setUser] = useState(null);
  const [state, setState] = useState("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let mounted = true;
    // The real Catalyst session is the source of truth; drop the old flag.
    window.sessionStorage.removeItem(SIGNED_OUT_STORAGE_KEY);

    const checkSession = async () => {
      const deadline = Date.now() + 5000;
      while (
        !window.catalyst?.auth?.isUserAuthenticated &&
        Date.now() < deadline
      ) {
        await new Promise((resolve) => window.setTimeout(resolve, 100));
      }

      if (!mounted) return;
      const auth = window.catalyst?.auth;
      if (!auth?.isUserAuthenticated || !auth?.signIn) {
        setMessage(
          "Catalyst authentication did not initialize. Reload the Slate app or run it with catalyst serve.",
        );
        setState("error");
        return;
      }

      try {
        const result = await auth.isUserAuthenticated();
        if (!mounted) return;
        if (!isSignedInResult(result)) {
          setState("signed-out");
          return;
        }
      } catch (error) {
        if (!mounted) return;
        if (isUnauthorizedError(error)) {
          setState("signed-out");
          return;
        }
        setMessage(
          error?.message ||
            "Unable to verify your Catalyst session. Check your connection and retry.",
        );
        setState("error");
        return;
      }

      try {
        const session = await payrollCycleRequest("session");
        if (mounted) {
          setUser(session);
          setState("authenticated");
        }
      } catch (error) {
        if (!mounted) return;
        setMessage(error.message);
        setState("error");
      }
    };

    checkSession();

    return () => {
      mounted = false;
    };
  }, []);

  // API calls report an expired session (401 / token timeout). Confirm with
  // Catalyst and return to sign-in only if the session is really gone.
  useEffect(() => {
    if (state !== "authenticated") return;
    let active = true;
    const onSessionExpired = async () => {
      let signedIn = false;
      try {
        signedIn = isSignedInResult(
          await window.catalyst?.auth?.isUserAuthenticated?.(),
        );
      } catch {
        signedIn = false;
      }
      if (!active || signedIn) return;
      setUser(null);
      setMessage("Your Catalyst session has ended. Sign in again to continue.");
      setState("signed-out");
    };
    window.addEventListener(CATALYST_SESSION_EXPIRED_EVENT, onSessionExpired);
    return () => {
      active = false;
      window.removeEventListener(
        CATALYST_SESSION_EXPIRED_EVENT,
        onSessionExpired,
      );
    };
  }, [state]);

  const signIn = () => {
    const auth = window.catalyst?.auth;
    if (!auth?.signIn) {
      setMessage(
        "Catalyst authentication is unavailable. Open this app through Catalyst or run it with catalyst serve.",
      );
      setState("error");
      return;
    }

    window.requestAnimationFrame(() => {
      auth.signIn("catalyst-login-container", {
        service_url: window.location.origin + "/",
      });
    });
  };

  useEffect(() => {
    if (state !== "signed-out") return;
    const timer = window.setTimeout(signIn, 0);
    return () => window.clearTimeout(timer);
  }, [state]);

  // auth.signOut() synchronously navigates to the Catalyst logout URL, which
  // ends the session and returns to the app origin. Switch to "loading" so the
  // auto sign-in effect and the app tree don't run during the redirect.
  const signOut = () => {
    const auth = window.catalyst?.auth;
    if (!auth?.signOut) {
      setMessage(
        "Catalyst sign out is unavailable. Reload the Slate app and try again.",
      );
      setState("error");
      return;
    }

    setUser(null);
    setMessage("");
    setState("loading");
    auth.signOut(window.location.origin);
  };

  if (state === "authenticated") {
    return (
      <CatalystAuthContext.Provider value={{ user, signOut }}>
        {children}
      </CatalystAuthContext.Provider>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-5xl items-center justify-center">
        <section className="grid w-full overflow-hidden rounded-3xl bg-white shadow-2xl lg:grid-cols-[0.9fr_1.1fr]">
          <div className="hidden bg-slate-900 p-10 text-white lg:flex lg:flex-col lg:justify-between">
            <div>
              <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-xl font-bold">
                EA
              </div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-300">
                Wissen Technologies
              </p>
              <h1 className="mt-4 text-4xl font-semibold leading-tight">
                Compensation Tool Management
              </h1>
              <p className="mt-5 max-w-sm text-sm leading-6 text-slate-300">
                Secure access to Compensation Management
              </p>
            </div>
            <p className="text-xs text-slate-400">
              Authorized users only • Secure Catalyst authentication
            </p>
          </div>

          <div className="p-6 sm:p-10">
            <div className="mx-auto w-full max-w-md">
              <div className="lg:hidden mb-6 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white">
                CT
              </div>

              {state === "loading" ? (
                <>
                  <div className="h-7 w-40 animate-pulse rounded bg-slate-200" />
                  <div className="mt-3 h-4 w-64 animate-pulse rounded bg-slate-100" />
                  <div className="mt-8 space-y-4">
                    <div className="h-11 animate-pulse rounded-xl bg-slate-100" />
                    <div className="h-11 animate-pulse rounded-xl bg-slate-100" />
                    <div className="h-11 animate-pulse rounded-xl bg-slate-100" />
                  </div>
                </>
              ) : state === "signed-out" ? (
                <>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Sign in with your Catalyst account to continue.
                  </p>

                  {message && (
                    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      {message}
                    </div>
                  )}

                  <div
                    id="catalyst-login-container"
                    aria-label="Catalyst sign in"
                    className="mt-6 min-h-[250px] w-full"
                  />

                  <p className="mt-5 text-center text-xs leading-5 text-slate-400">
                    Your account is authenticated through Zoho Catalyst.
                  </p>
                </>
              ) : (
                <>
                  <h2 className="text-2xl font-semibold text-slate-900">
                    Authentication error
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-red-700">
                    {message}
                  </p>
                  <button
                    className="mt-5 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    onClick={() => window.location.reload()}
                    type="button"
                  >
                    Retry
                  </button>
                </>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
