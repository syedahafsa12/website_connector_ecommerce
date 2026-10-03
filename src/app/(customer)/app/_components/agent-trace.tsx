"use client";

export interface TraceStep {
  label: string;
  state: "pending" | "active" | "done";
}

/** A lightweight, honest activity trace: steps reflect what the current request is actually doing, not invented substeps. */
export function AgentTrace({ steps }: { steps: TraceStep[] }) {
  return (
    <div className="am-trace">
      {steps.map((s) => (
        <div key={s.label} className={`am-trace-step ${s.state}`}>
          <span className="am-trace-dot" />
          {s.label}
        </div>
      ))}
    </div>
  );
}
