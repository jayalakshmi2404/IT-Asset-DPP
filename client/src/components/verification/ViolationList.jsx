import React from 'react';

/**
 * Lists ledger violations with where each one is and what the verifier found.
 * Every value comes from the server's verification result; nothing is inferred here.
 * `diagnosis` entries are read-only hints and are labelled as such: they are not proof of tampering.
 */
export default function ViolationList({ violations = [], limit = 25, heading = 'What broke the chain' }) {
  if (!violations.length) return null;
  const shown = violations.slice(0, limit);
  const hidden = violations.length - shown.length;

  return (
    <div className="mt-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-rose-300">{heading}</h3>
      <ol className="space-y-2">
        {shown.map((v, i) => (
          <li key={i} className="rounded-lg bg-rose-500/10 px-3 py-2.5 text-xs text-rose-200 ring-1 ring-inset ring-rose-400/25">
            <p className="font-medium text-rose-100">{v.reason}</p>
            <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px] text-rose-200/80">
              {v.eventType && (<><dt>Record</dt><dd>{v.eventType}</dd></>)}
              {v.assetId && (<><dt>Asset</dt><dd className="break-all font-mono">{v.assetId}</dd></>)}
              {v.eventId && (<><dt>Event ID</dt><dd className="break-all font-mono">{v.eventId}</dd></>)}
              {v.blockIndex !== undefined && v.blockIndex !== null && (<><dt>Ledger block</dt><dd>#{v.blockIndex}</dd></>)}
            </dl>
            {Array.isArray(v.diagnosis) && v.diagnosis.length > 0 && (
              <div className="mt-2 rounded-md bg-black/20 p-2">
                <p className="mb-1 font-semibold text-rose-100">Diagnostic hints (not proof of tampering)</p>
                <ul className="list-disc space-y-0.5 pl-4">
                  {v.diagnosis.map((hint, j) => (
                    <li key={j}>{hint}</li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        ))}
      </ol>
      {hidden > 0 && <p className="mt-2 text-[11px] text-ink-400">{hidden} more not shown.</p>}
    </div>
  );
}
