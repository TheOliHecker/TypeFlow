"use client";
import { suggestProofreading } from "@/lib/simulation/proofreading";
import type { ProofreadingSettings } from "@/lib/types";
export function ProofreadingPanel({
  text,
  settings,
  disabled,
  onChange,
}: {
  text: string;
  settings: ProofreadingSettings;
  disabled: boolean;
  onChange: (settings: ProofreadingSettings) => void;
}) {
  const suggestions = suggestProofreading(text, settings);
  return (
    <section className="settings-panel">
      <div className="panel-heading">
        <h2>Optional proofreading</h2>
      </div>
      <fieldset disabled={disabled}>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) =>
              onChange({ ...settings, enabled: e.target.checked })
            }
          />
          Add a proofreading stage
        </label>
        {settings.enabled && (
          <>
            <p className="setting-hint">
              Simulated slips are always restored. These suggestions change your
              supplied wording only when you approve them below.
            </p>
            {(
              [
                ["spelling", "Correct spelling"],
                ["grammar", "Correct grammar"],
                ["punctuation", "Correct punctuation"],
                ["style", "Improve clarity and style"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={settings[key]}
                  onChange={(e) =>
                    onChange({ ...settings, [key]: e.target.checked })
                  }
                />
                {label}
              </label>
            ))}
            {suggestions.length === 0 && (
              <p className="setting-hint">
                No suggestions from the available rules. Your text will stay
                exactly as supplied.
              </p>
            )}
            {suggestions.map((s) => (
              <label key={s.id} className="suggestion">
                <input
                  type="checkbox"
                  checked={settings.approvedIds.includes(s.id)}
                  onChange={(e) =>
                    onChange({
                      ...settings,
                      approvedIds: e.target.checked
                        ? [...settings.approvedIds, s.id]
                        : settings.approvedIds.filter((id) => id !== s.id),
                    })
                  }
                />
                <span>
                  <del>{s.before}</del> → <ins>{s.after}</ins>
                  <small>{s.reason} · approve change</small>
                </span>
              </label>
            ))}
            <p className="setting-hint">
              Local rules only; review suggestions in context. No external AI
              service is used.
            </p>
          </>
        )}
      </fieldset>
    </section>
  );
}
