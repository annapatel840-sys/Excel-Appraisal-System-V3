import { useEffect, useRef, useState } from "react";
import {
  Download,
  FileSpreadsheet,
  History,
  Menu,
  Search,
  Upload,
} from "lucide-react";

export function EmployeeMasterToolbar({
  search,
  setSearch,
  statusFilter,
  setStatusFilter,
  onDownloadTemplate,
  onUpload,
  onDownloadData,
  onAuditHistory,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // ============================================================
  // CLOSE MENU WHEN CLICKING OUTSIDE
  // ============================================================
  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  // ============================================================
  // SEARCH CHANGE
  // ============================================================
  const handleSearchChange = (event) => {
    setSearch(event.target.value);
    setMenuOpen(false);
  };

  // ============================================================
  // STATUS CHANGE
  // ============================================================
  const handleStatusChange = (event) => {
    setStatusFilter(event.target.value);
    setMenuOpen(false);
  };

  // ============================================================
  // MENU ITEM HANDLERS
  // ============================================================
  const handleDownloadTemplate = () => {
    setMenuOpen(false);
    onDownloadTemplate();
  };

  const handleUpload = () => {
    setMenuOpen(false);
    onUpload?.();
  };

  const handleDownloadData = () => {
    setMenuOpen(false);
    onDownloadData();
  };

  const handleAuditHistory = () => {
    setMenuOpen(false);
    onAuditHistory?.();
  };

  return (
    <div className="em-toolbar">
      {/* ======================================================
          SEARCH
          ====================================================== */}
      <div className="em-search">
        <Search size={14} />

        <input
          value={search}
          onChange={handleSearchChange}
          placeholder="Search employee..."
        />
      </div>

      {/* ======================================================
          STATUS FILTER
          ====================================================== */}
      <select
        className="em-status-select"
        value={statusFilter}
        onChange={handleStatusChange}
      >
        <option value="All">All Status</option>
        <option value="Active">Active</option>
        <option value="Inactive">Inactive</option>
      </select>

      <div className="em-toolbar-spacer" />

      {/* ======================================================
          MENU
          ====================================================== */}
      <div className="em-menu-wrapper" ref={menuRef}>
        <button
          type="button"
          className="em-btn em-btn-ghost"
          onClick={(event) => {
            event.stopPropagation();
            setMenuOpen((current) => !current);
          }}
          aria-label="Menu"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
        >
          <Menu size={18} />
        </button>

        {menuOpen && (
          <div
            className="em-menu-dropdown"
            role="menu"
            onMouseDown={(event) => {
              event.stopPropagation();
            }}
          >
            {/* Download Template */}
            <button
              type="button"
              role="menuitem"
              onClick={handleDownloadTemplate}
            >
              <FileSpreadsheet size={14} />
              <span>Download Template</span>
            </button>

            {/* Upload Employee Data (only when the user may write) */}
            {onUpload && (
              <button type="button" role="menuitem" onClick={handleUpload}>
                <Upload size={14} />
                <span>Upload Employee Data</span>
              </button>
            )}

            {/* Download Visible Data */}
            <button type="button" role="menuitem" onClick={handleDownloadData}>
              <Download size={14} />
              <span>Download Visible Data</span>
            </button>

            {/* ==================================================
                AUDIT HISTORY
                ================================================== */}
            {onAuditHistory && (
              <button type="button" role="menuitem" onClick={handleAuditHistory}>
                <History size={14} />
                <span>Audit History</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
