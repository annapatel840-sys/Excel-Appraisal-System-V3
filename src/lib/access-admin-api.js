// Client for the accessapi Catalyst function (HR Operations -> Access screen).
// Contract: docs/ACCESS_SPEC.md and docs/access-design/functions/accessapi/index.js.
// Every response is JSON with `ok` and (per the spec) `enforced`. Rule errors come back as
// HTTP 200 { ok:false, status, error }; those are thrown as AccessApiError so the page can
// show `error` in its message bar.
import { catalystFetch, catalystFunctionUrl } from "@/lib/catalyst-api";

export class AccessApiError extends Error {
  constructor(message, { status, enforced, payload } = {}) {
    super(message);
    this.name = "AccessApiError";
    this.status = status;
    this.enforced = enforced;
    this.payload = payload;
  }
}

function endpoint(path, params) {
  const url = new URL(path.replace(/^\/+/, ""), catalystFunctionUrl("accessapi"));
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    });
  }
  return url;
}

async function request(path, { method = "GET", body, params } = {}) {
  let response;
  try {
    response = await catalystFetch(endpoint(path, params), {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new AccessApiError(err?.message || "Could not reach accessapi.");
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new AccessApiError(
      response.ok ? "accessapi returned an invalid response." : `Could not reach accessapi (HTTP ${response.status}).`,
      { status: response.status },
    );
  }

  if (!payload || payload.ok !== true) {
    throw new AccessApiError(payload?.error || payload?.message || "The request failed.", {
      status: payload?.status || response.status,
      enforced: payload?.enforced,
      payload,
    });
  }
  return payload;
}

/** GET /version -> { ok, version, enforced } */
export function getVersion() {
  return request("version");
}

/** GET /admin/state -> { ok, version, me, catalog, roles, matrix, people, deleg, overrides, log, enforced } */
export function getAdminState(cycleId) {
  // cycleId: list people for this cycle's Delegation (default: the Active cycle)
  return request(cycleId ? "admin/state?cycle=" + encodeURIComponent(cycleId) : "admin/state");
}

/** POST /apply { reason, changes } -> { ok, applied, batch, version, enforced } */
export function apply(reason, changes) {
  return request("apply", { method: "POST", body: { reason, changes } });
}

/** GET /cycles -> { ok, cycles:[{ id, name, status }], activeCycleId, enforced } */
export function getCycles() {
  return request("cycles");
}

/** GET /delegation?cycle=<id> -> { ok, rows:[...], enforced } */
export function getDelegation(cycleId) {
  return request("delegation", { params: { cycle: cycleId } });
}

/** POST /delegation/fill { cycleId, replace:true } -> { ok, matched, unmatched, ..., enforced } */
export function fillDelegation(cycleId) {
  return request("delegation/fill", { method: "POST", body: { cycleId, replace: true } });
}
