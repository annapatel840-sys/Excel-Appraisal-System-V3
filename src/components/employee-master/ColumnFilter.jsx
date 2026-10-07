import { useEffect, useRef, useState } from "react";
import { Filter, Search, X } from "lucide-react";

const COLUMN_FILTER_OPEN_EVENT = "employee-master-column-filter-open";

export function ColumnFilter({ column, rows, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value?.type === "text" ? value.term : "");
  const [panelStyle, setPanelStyle] = useState({});

  const ref = useRef(null);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);

  const PANEL_WIDTH = 230;
  const PANEL_MAX_HEIGHT = 330;
  const PANEL_MARGIN = 8;

  const values = [
    ...new Set(
      rows.map((row) => column.get?.(row) ?? "").filter((item) => item !== ""),
    ),
  ].sort();

  const selectedValues =
    value?.type === "select" ? value.values : new Set(values);

  // ------------------------------------------------------------
  // KEEP TEXT FILTER IN SYNC
  // ------------------------------------------------------------
  useEffect(() => {
    if (value?.type === "text") {
      setText(value.term || "");
    } else if (!value) {
      setText("");
    }
  }, [value]);

  // ------------------------------------------------------------
  // CLOSE WHEN ANOTHER COLUMN FILTER OPENS
  // ------------------------------------------------------------
  useEffect(() => {
    if (!open) return;

    const handleAnotherFilterOpen = (event) => {
      if (event.detail !== ref.current) {
        setOpen(false);
      }
    };

    window.addEventListener(COLUMN_FILTER_OPEN_EVENT, handleAnotherFilterOpen);

    return () => {
      window.removeEventListener(
        COLUMN_FILTER_OPEN_EVENT,
        handleAnotherFilterOpen,
      );
    };
  }, [open]);

  // ------------------------------------------------------------
  // POSITION FILTER POPUP
  // ------------------------------------------------------------
  const updatePanelPosition = () => {
    const button = buttonRef.current;

    if (!button) return;

    const rect = button.getBoundingClientRect();

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const left = Math.min(
      Math.max(PANEL_MARGIN, rect.right - PANEL_WIDTH),
      Math.max(PANEL_MARGIN, viewportWidth - PANEL_WIDTH - PANEL_MARGIN),
    );

    const estimatedHeight = Math.min(
      PANEL_MAX_HEIGHT,
      Math.max(120, values.length * 28 + 70),
    );

    let top = rect.bottom + 4;

    if (top + estimatedHeight > viewportHeight - PANEL_MARGIN) {
      top = Math.max(PANEL_MARGIN, rect.top - estimatedHeight - 4);
    }

    setPanelStyle({
      position: "fixed",
      left: `${left}px`,
      top: `${top}px`,
      width: `${PANEL_WIDTH}px`,
      zIndex: 999999,
    });
  };

  // ------------------------------------------------------------
  // OUTSIDE CLICK
  // ------------------------------------------------------------
  useEffect(() => {
    if (!open) return;

    const handleDocumentMouseDown = (event) => {
      const target = event.target;

      const filterElement = ref.current;
      const buttonElement = buttonRef.current;
      const panelElement = panelRef.current;

      const clickedInsideFilter =
        filterElement && filterElement.contains(target);

      const clickedButton = buttonElement && buttonElement.contains(target);

      const clickedPanel = panelElement && panelElement.contains(target);

      /*
       * If click happened anywhere inside this
       * filter or its popup, keep it open.
       */
      if (clickedInsideFilter || clickedButton || clickedPanel) {
        return;
      }

      /*
       * Otherwise close immediately.
       */
      setOpen(false);
    };

    /*
     * Capture phase is important here.
     * It allows this listener to receive the event
     * before parent components stop propagation.
     */
    document.addEventListener("mousedown", handleDocumentMouseDown, true);

    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown, true);
    };
  }, [open]);

  // ------------------------------------------------------------
  // ESCAPE
  // ------------------------------------------------------------
  useEffect(() => {
    if (!open) return;

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  // ------------------------------------------------------------
  // CLOSE ON SCROLL / RESIZE
  // ------------------------------------------------------------
  useEffect(() => {
    if (!open) return;

    const handleScroll = () => {
      setOpen(false);
    };

    const handleResize = () => {
      setOpen(false);
    };

    window.addEventListener("scroll", handleScroll, true);

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("scroll", handleScroll, true);

      window.removeEventListener("resize", handleResize);
    };
  }, [open]);

  // ------------------------------------------------------------
  // OPEN / CLOSE FILTER
  // ------------------------------------------------------------
  const handleFilterButtonClick = (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (open) {
      setOpen(false);
      return;
    }

    /*
     * Close all other ColumnFilter instances.
     */
    window.dispatchEvent(
      new CustomEvent(COLUMN_FILTER_OPEN_EVENT, {
        detail: ref.current,
      }),
    );

    /*
     * Calculate popup position before opening.
     */
    updatePanelPosition();

    setOpen(true);
  };

  // ------------------------------------------------------------
  // SELECT / UNSELECT
  // ------------------------------------------------------------
  const toggleValue = (item) => {
    const next = new Set(selectedValues);

    if (next.has(item)) {
      next.delete(item);
    } else {
      next.add(item);
    }

    onChange({
      type: "select",
      values: next,
    });
  };

  // ------------------------------------------------------------
  // SELECT ALL
  // ------------------------------------------------------------
  const selectAll = () => {
    onChange({
      type: "select",
      values: new Set(values),
    });
  };

  // ------------------------------------------------------------
  // CLEAR FILTER
  // ------------------------------------------------------------
  const clearFilter = () => {
    onChange(null);
    setText("");
    setOpen(false);
  };

  // ------------------------------------------------------------
  // TEXT FILTER
  // ------------------------------------------------------------
  const applyText = () => {
    const trimmed = text.trim();

    if (!trimmed) {
      onChange(null);
    } else {
      onChange({
        type: "text",
        term: trimmed,
      });
    }

    setOpen(false);
  };

  // ------------------------------------------------------------
  // FILTER ACTIVE STATE
  // ------------------------------------------------------------
  const hasFilter =
    value &&
    ((value.type === "text" && value.term) ||
      (value.type === "select" && value.values.size !== values.length));

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------
  return (
    <div ref={ref} className="em-column-filter">
      {/* ======================================================
          FILTER BUTTON
          ====================================================== */}

      <button
        ref={buttonRef}
        type="button"
        className={`em-filter-button ${hasFilter ? "active" : ""}`}
        onClick={handleFilterButtonClick}
        title={`Filter ${column.label}`}
        aria-label={`Filter ${column.label}`}
        aria-expanded={open}
      >
        <Filter size={12} />
      </button>

      {/* ======================================================
          FILTER PANEL
          ====================================================== */}

      {open && (
        <div
          ref={panelRef}
          className="em-column-filter-panel"
          style={panelStyle}
          onMouseDown={(event) => {
            event.stopPropagation();
          }}
        >
          {/* ==================================================
              TEXT FILTER
              ================================================== */}

          {column.type === "text" ? (
            <div className="em-text-filter">
              <div className="em-filter-search">
                <Search size={13} />

                <input
                  autoFocus
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      applyText();
                    }

                    if (event.key === "Escape") {
                      event.preventDefault();
                      setOpen(false);
                    }
                  }}
                  placeholder="Search..."
                />
              </div>

              <div className="em-filter-actions">
                <button type="button" onClick={applyText}>
                  Apply
                </button>

                <button type="button" onClick={clearFilter}>
                  Clear
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* ==============================================
                  SELECT / CLEAR
                  ============================================== */}

              <div className="em-filter-top">
                <button type="button" onClick={selectAll}>
                  Select all
                </button>

                <button type="button" onClick={clearFilter}>
                  Clear
                </button>
              </div>

              {/* ==============================================
                  VALUES
                  ============================================== */}

              <div className="em-filter-values">
                {values.map((item) => (
                  <label key={item} className="em-filter-option">
                    <input
                      type="checkbox"
                      checked={selectedValues.has(item)}
                      onChange={() => toggleValue(item)}
                    />

                    <span>{item}</span>
                  </label>
                ))}
              </div>

              {/* ==============================================
                  DONE
                  ============================================== */}

              <button
                type="button"
                className="em-filter-close"
                onClick={() => setOpen(false)}
              >
                <X size={12} />
                Done
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
