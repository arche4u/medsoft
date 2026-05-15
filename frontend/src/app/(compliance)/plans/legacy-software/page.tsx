"use client";
import { PlanShell } from "@/components/plan/shared";

export default function LegacySoftwarePlanPage() {
  return (
    <PlanShell
      planType="LEGACY_SOFTWARE"
      pageTitle="Legacy Software Plan"
      pageSubtitle="IEC 62304 §4.4 — Software systems not developed under this standard. Covers §4.4(a) continuous monitoring, §4.4(b) change impact assessment, §4.4(c) risk-based decision, §4.4(d) documented rationale."
      entityLabel="Plan"
    />
  );
}
