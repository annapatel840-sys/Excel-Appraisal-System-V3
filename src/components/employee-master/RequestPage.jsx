import { useMemo, useState } from "react";
import { useCatalystUser } from "@/lib/catalyst-auth";
import { useAccess } from "@/lib/access-store";
import DelegationScreen from "./DelegationScreen";

export function RequestPage() {
  const user = useCatalystUser();
  const canDelegate = useAccess().canAction("delegateRequest");
  const [view, setView] = useState("menu");
  const [employeeId, setEmployeeId] = useState("");
  const [details, setDetails] = useState("");
  const [message, setMessage] = useState("");
  const requestKey = useMemo(() => "appraisal-screen-requests", []);

  const submitScreenRequest = () => {
    const text = details.trim();
    if (!text) { setMessage("Please enter the screen request details."); return; }
    const current = JSON.parse(localStorage.getItem(requestKey) || "[]");
    current.unshift({
      id: `SR-${Date.now()}`,
      employeeId: employeeId.trim(),
      details: text,
      requestedBy: user?.name || user?.email || "Tech Ed",
      requestedAt: new Date().toISOString(),
      status: "Pending",
    });
    localStorage.setItem(requestKey, JSON.stringify(current));
    setEmployeeId("");
    setDetails("");
    setMessage("Screen request saved as Pending.");
  };

  if (view === "delegation" && canDelegate) {
    const submitDelegationRequest = () => {
      const reason = details.trim();
      if (!employeeId.trim() || !reason) { setMessage("Employee ID and reason are required."); return; }
      const current = JSON.parse(localStorage.getItem("appraisal-delegation-requests") || "[]");
      current.unshift({
        id: `DR-${Date.now()}`,
        no: `DR-${Date.now()}`,
        rowId: employeeId.trim(),
        empId: employeeId.trim(),
        empName: employeeId.trim(),
        field: "comp",
        oldId: "",
        newId: "Requested change",
        reason,
        byId: user?.id || user?.email || "teched",
        byName: user?.name || user?.email || "Tech Ed",
        on: new Date().toISOString(),
        status: "Pending",
        decidedBy: "",
        decidedOn: "",
        remarks: "",
      });
      localStorage.setItem("appraisal-delegation-requests", JSON.stringify(current));
      setEmployeeId("");
      setDetails("");
      setMessage("Delegation request sent to HR.");
    };
    return (
      <div className="rounded-md border border-[#d5dce5] bg-white p-4">
        <button type="button" onClick={() => setView("menu")} className="text-xs font-medium text-[#173b63] hover:underline">← Back to Request</button>
        <h2 className="mt-3 text-sm font-semibold text-[#173b63]">Delegation Request</h2>
        <p className="mt-1 text-[11px] text-slate-500">Raise a delegation change for HR approval.</p>
        <div className="mt-4 grid max-w-xl gap-3">
          <input value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} placeholder="Employee ID" className="h-9 rounded-md border px-3 text-xs outline-none focus:border-[#173b63]" />
          <textarea value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Reason / requested delegation change" rows={5} className="rounded-md border px-3 py-2 text-xs outline-none focus:border-[#173b63]" />
          <button type="button" onClick={submitDelegationRequest} className="w-fit rounded-md bg-[#173b63] px-4 py-2 text-xs font-semibold text-white">Send Delegation Request</button>
          {message && <div className="text-xs text-slate-600">{message}</div>}
        </div>
      </div>
    );
  }
  if (view === "screen") {
    return (
      <div className="rounded-md border border-[#d5dce5] bg-white p-4">
        <button type="button" onClick={() => setView("menu")} className="text-xs font-medium text-[#173b63] hover:underline">← Back to Request</button>
        <h2 className="mt-3 text-sm font-semibold text-[#173b63]">Screen Request</h2>
        <p className="mt-1 text-[11px] text-slate-500">This temporary workflow stores the request locally until the Screen Request Data Store/API is connected.</p>
        <div className="mt-4 grid gap-3 max-w-xl">
          <input value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} placeholder="Employee ID (optional)" className="h-9 rounded-md border px-3 text-xs outline-none focus:border-[#173b63]" />
          <textarea value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Describe the screen/request change" rows={5} className="rounded-md border px-3 py-2 text-xs outline-none focus:border-[#173b63]" />
          <button type="button" onClick={submitScreenRequest} className="w-fit rounded-md bg-[#173b63] px-4 py-2 text-xs font-semibold text-white">Send Screen Request</button>
          {message && <div className="text-xs text-slate-600">{message}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-[#d5dce5] bg-white">
      <div className="border-b border-[#d5dce5] px-4 py-3">
        <h2 className="text-sm font-semibold text-[#173b63]">Request</h2>
        <p className="mt-1 text-[11px] text-slate-500">Choose the type of request you want to raise.</p>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-2">
        {canDelegate && (
          <button type="button" onClick={() => setView("delegation")} className="rounded-md border border-[#cbd5e1] bg-white p-4 text-left hover:bg-slate-50">
            <div className="text-sm font-semibold text-[#173b63]">Delegation Request</div>
            <div className="mt-1 text-[11px] text-slate-500">Request Comp Manager or Appraiser Tech Ed delegation changes for HR approval.</div>
          </button>
        )}
        <button type="button" onClick={() => setView("screen")} className="rounded-md border border-[#cbd5e1] bg-white p-4 text-left hover:bg-slate-50">
          <div className="text-sm font-semibold text-[#173b63]">Screen Request</div>
          <div className="mt-1 text-[11px] text-slate-500">Raise a request for a change to the appraisal/detail screen.</div>
        </button>
      </div>
    </div>
  );
}