"use client";
import { useState } from "react";
import { planRevisions } from "../lib/simulation/revisions";
export function RevisionPreview({
  before,
  after,
  onApproval,
}: {
  before: string;
  after: string;
  onApproval?: (approved: boolean) => void;
}) {
  const changes = planRevisions(before, after);
  const [approval, setApproval] = useState<{
    signature: string;
    ids: number[];
  }>({ signature: "", ids: [] });
  const signature = before + "\u0000" + after;
  const ids = approval.signature === signature ? approval.ids : [];
  let current = before,
    position = 0;
  const parts = [];
  for (const [i, c] of changes.entries()) {
    const unchanged = current.slice(position, c.index);
    current =
      current.slice(0, c.index) +
      c.inserted +
      current.slice(c.index + c.removed.length);
    position = c.index + c.inserted.length;
    parts.push(
      <span key={i}>
        <span className="revision-unchanged">{unchanged}</span>
        <span
          className="revision-group"
          data-kind={
            c.removed && c.inserted
              ? "replaced"
              : c.removed
                ? "deleted"
                : "added"
          }
        >
          {c.removed && <del>{c.removed}</del>}
          {c.inserted && <ins>{c.inserted}</ins>}
        </span>
      </span>,
    );
  }
  return (
    <div className="revision-preview">
      <p className="hint">
        Changes at their original positions · <ins>Added</ins> ·{" "}
        <del>Deleted</del> · paired passages are replacements. Plain text is
        unchanged.
      </p>
      <div className="revision-document">
        {parts}
        {current.slice(position)}
      </div>
      {changes.map(
        (c, i) =>
          c.major && (
            <label className="check" key={i}>
              <input
                type="checkbox"
                checked={ids.includes(i)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...ids, i]
                    : ids.filter((n) => n !== i);
                  setApproval({ signature, ids: next });
                  onApproval?.(
                    changes.every((x, n) => !x.major || next.includes(n)),
                  );
                }}
              />
              Approve {c.kind} replacement {i + 1} at offset {c.index}
            </label>
          ),
      )}
    </div>
  );
}
