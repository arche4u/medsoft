"use client";
import { PlanShell } from "@/components/plan/shared";

export default function ConfigMgmtPlanPage() {
  return (
    <PlanShell
      planType="CONFIG_MGMT"
      pageTitle="Software Configuration Management Plan"
      pageSubtitle="IEC 62304 §8.1 — Configuration management process"
      entityLabel="Plan"
    />
  );
}
