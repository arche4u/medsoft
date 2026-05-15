"use client";
import { PlanShell } from "@/components/plan/shared";

export default function RiskMgmtPlanPage() {
  return (
    <PlanShell
      planType="RISK_MGMT"
      pageTitle="Software Risk Management Plan"
      pageSubtitle="IEC 62304 §7 — Software risk management, aligned with ISO 14971"
      entityLabel="Plan"
    />
  );
}
