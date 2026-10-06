// Default production functions domain. This project currently deploys only the
// Catalyst Development environment, so the ".development." domain is intended.
// Override per build with VITE_CATALYST_FUNCTIONS_URL (e.g. for Production).
const PROJECT_FUNCTIONS_URL =
  "https://performanceletterautomation-60088966704.development.catalystserverless.in/server";

const FUNCTIONS_BASE_URL = import.meta.env.DEV
  ? "http://localhost:3000/server"
  : import.meta.env.VITE_CATALYST_FUNCTIONS_URL || PROJECT_FUNCTIONS_URL;

const AUTH_TOKEN_TIMEOUT_MS = 15000;
const SESSION_ENDED_MESSAGE =
  "Your Catalyst session has ended. Reload the page and sign in again.";

// The auth gate listens for this event and returns the user to sign-in.
export const CATALYST_SESSION_EXPIRED_EVENT = "catalyst-session-expired";

export function catalystFunctionUrl(functionName) {
  return `${FUNCTIONS_BASE_URL.replace(/\/+$/, "")}/${functionName}/`;
}

function notifySessionExpired() {
  window.dispatchEvent(new Event(CATALYST_SESSION_EXPIRED_EVENT));
}

// generateAuthToken() never settles when there is no session, so bound it.
function generateAuthTokenWithTimeout(auth) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = window.setTimeout(
      () => reject(new Error(SESSION_ENDED_MESSAGE)),
      AUTH_TOKEN_TIMEOUT_MS,
    );
  });
  return Promise.race([auth.generateAuthToken(), timeout]).finally(() =>
    window.clearTimeout(timer),
  );
}

export async function catalystFetch(input, options = {}) {
  const auth = window.catalyst?.auth;
  if (!auth?.generateAuthToken) {
    throw new Error(
      "Catalyst authentication is unavailable. Open this app through Slate or run it with catalyst serve.",
    );
  }

  let authResponse;
  try {
    authResponse = await generateAuthTokenWithTimeout(auth);
  } catch (error) {
    if (error?.message === SESSION_ENDED_MESSAGE) notifySessionExpired();
    throw error;
  }
  if (!authResponse?.access_token) {
    throw new Error("Catalyst did not return an authentication token.");
  }

  const headers = new Headers(options.headers);
  headers.set("Authorization", authResponse.access_token);

  const response = await fetch(input, {
    ...options,
    credentials: "include",
    headers,
  });

  if (response.status === 401) notifySessionExpired();

  return response;
}
