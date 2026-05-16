"use client";
import { PlanShell } from "@/components/plan/shared";

export default function CybersecurityPlanPage() {
  return (
    <PlanShell
      planType="CYBERSECURITY"
      pageTitle="Cybersecurity Plan"
      pageSubtitle="IEC 81001-5-1 — health-software cybersecurity activities across the product lifecycle (pairs with §7 risks tagged risk_class=SECURITY)"
      entityLabel="Plan"
    />
  );
}
