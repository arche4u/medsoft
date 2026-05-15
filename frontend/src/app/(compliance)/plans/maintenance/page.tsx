"use client";
import { PlanShell } from "@/components/plan/shared";

export default function MaintenancePlanPage() {
  return (
    <PlanShell
      planType="MAINTENANCE"
      pageTitle="Software Maintenance Plan"
      pageSubtitle="IEC 62304 §6.1 — Establishes the software maintenance process"
      entityLabel="Plan"
    />
  );
}
