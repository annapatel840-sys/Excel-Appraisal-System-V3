import { useEffect, useState } from "react";
import { Check, LogOut, RotateCcw, Save, Settings2 } from "lucide-react";
import { AppShell } from "@/components/appraisal/AppShell";
import { Button } from "@/components/ui/button";
import { useSettings, DEFAULT_SETTINGS } from "@/lib/settings-store";
import { useCatalystSignOut } from "@/lib/catalyst-auth";

const THEMES = [
  { id: "navy", label: "Navy Blue", description: "Current project theme", swatch: "#173b63" },
  { id: "slate", label: "Slate Blue", description: "A softer alternate blue", swatch: "#334155" },
  { id: "mono", label: "Black & White", description: "High-contrast monochrome", swatch: "#111111" },
];

export function SettingsPage() {
  const { settings, saveSettings, resetSettings } = useSettings();
  const signOut = useCatalystSignOut();
  const [draft, setDraft] = useState(settings);
  useEffect(() => setDraft(settings), [settings]);
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const save = () => saveSettings(draft);
  const reset = () => { resetSettings(); setDraft(DEFAULT_SETTINGS); };

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <Settings2 className="size-5 text-primary" />
            <div>
              <h2 className="text-lg font-semibold">Settings & Configuration</h2>
              <p className="text-xs text-muted-foreground">Change the application appearance and navigation layout.</p>
            </div>
          </div>
        </div>
        <section className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold">Theme</h3>
          <p className="mt-1 text-xs text-muted-foreground">Choose the main project color and visual style.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {THEMES.map((theme) => {
              const selected = draft.theme === theme.id;
              return (
                <button key={theme.id} type="button" onClick={() => update("theme", theme.id)}
                  className={"rounded-lg border p-3 text-left transition " + (selected ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/50")}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="size-9 rounded-md border border-black/10" style={{ backgroundColor: theme.swatch }} />
                    {selected && <span className="flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="size-3.5" /></span>}
                  </div>
                  <p className="mt-3 text-sm font-medium">{theme.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{theme.description}</p>
                </button>
              );
            })}
          </div>
        </section>
        <section className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold">Navigation</h3>
          <p className="mt-1 text-xs text-muted-foreground">Select where the main project navigation should appear.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {[
              ["top", "Top Header", "Current default layout with the project heading and menu across the top."],
              ["left", "Left / Vertical", "Places the project heading and navigation in a vertical sidebar."],
            ].map(([id, label, description]) => (
              <button key={id} type="button" onClick={() => update("menuPosition", id)}
                className={"rounded-lg border p-4 text-left transition " + (draft.menuPosition === id ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/50")}>
                <p className="text-sm font-medium">{label}</p><p className="mt-1 text-xs text-muted-foreground">{description}</p>
              </button>
            ))}
          </div>
          {draft.menuPosition === "left" && (
            <label className="mt-4 flex cursor-pointer items-center justify-between rounded-lg border border-border p-3">
              <span><span className="block text-sm font-medium">Collapse navigation labels</span><span className="block text-xs text-muted-foreground">Show only navigation icons in the vertical sidebar.</span></span>
              <input type="checkbox" checked={draft.menuCollapsed} onChange={(e) => update("menuCollapsed", e.target.checked)} className="size-4 accent-[var(--app-brand)]" />
            </label>
          )}
        </section>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-3">
          <button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-muted"><RotateCcw className="size-3.5" />Reset to Default</button>
          <button type="button" onClick={signOut} className="inline-flex items-center gap-2 rounded-md border border-red-200 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50"><LogOut className="size-3.5" />Sign Out</button>
          <Button type="button" onClick={save} className="gap-2"><Save className="size-3.5" />Save Changes</Button>
        </div>
      </div>
    </AppShell>
  );
}
