import { useEffect, useState } from "react";
import { X } from "lucide-react";

const ELIGIBLE_REASONS = ["ML", "Withdrew resignation", "Others"];

const NOT_ELIGIBLE_REASONS = ["PIP", "ML", "Resigned", "Other"];

export function EligibilityModal({ employee, onClose, onSave }) {
  const [status, setStatus] = useState(
    employee?.eligible === "Yes" ? "Yes" : "No",
  );

  const [reason, setReason] = useState(employee?.eligibleReason || "");

  const [otherReason, setOtherReason] = useState("");

  useEffect(() => {
    if (!employee) {
      return;
    }

    setStatus(employee.eligible === "Yes" ? "Yes" : "No");

    const reasons =
      employee.eligible === "Yes" ? ELIGIBLE_REASONS : NOT_ELIGIBLE_REASONS;

    if (employee.eligibleReason && !reasons.includes(employee.eligibleReason)) {
      setReason(employee.eligible === "Yes" ? "Others" : "Other");

      setOtherReason(employee.eligibleReason);
    } else {
      setReason(employee.eligibleReason || "");
      setOtherReason("");
    }
  }, [employee]);

  if (!employee) {
    return null;
  }

  const reasons = status === "Yes" ? ELIGIBLE_REASONS : NOT_ELIGIBLE_REASONS;

  const isOther = reason === "Others" || reason === "Other";

  const save = () => {
    const finalReason = isOther ? otherReason.trim() : reason;

    onSave({
      empId: employee.empId,
      eligible: status,
      eligibleReason: finalReason,
    });
  };

  return (
    <div className="em-modal-overlay">
      <div className="em-modal em-small-modal">
        <div className="em-modal-header">
          <div>
            <strong>Change Eligibility</strong>
            <span>
              {employee.name} · {employee.empId}
            </span>
          </div>

          <button type="button" onClick={onClose}>
            <X size={17} />
          </button>
        </div>

        <div className="em-modal-body">
          <div className="em-field">
            <label>Eligibility</label>

            <select
              className="em-date-input"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setReason("");
                setOtherReason("");
              }}
            >
              <option value="Yes">Eligible</option>
              <option value="No">Not Eligible</option>
            </select>
          </div>

          <div className="em-field">
            <label>Reason</label>

            <select
              className="em-date-input"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            >
              <option value="">Select reason</option>

              {reasons.map((item) => (
                <option value={item} key={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          {isOther && (
            <div className="em-field">
              <label>Other Reason</label>

              <input
                className="em-date-input"
                value={otherReason}
                onChange={(event) => setOtherReason(event.target.value)}
                placeholder="Enter reason"
              />
            </div>
          )}
        </div>

        <div className="em-modal-footer">
          <button
            type="button"
            className="em-btn em-btn-ghost"
            onClick={onClose}
          >
            Cancel
          </button>

          <button
            type="button"
            className="em-btn em-btn-primary"
            onClick={save}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
