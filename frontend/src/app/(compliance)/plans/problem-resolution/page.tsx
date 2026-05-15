"use client";
import { PlanShell } from "@/components/plan/shared";

export default function ProblemResolutionPlanPage() {
  return (
    <PlanShell
      planType="PROBLEM_RESOLUTION"
      pageTitle="Software Problem Resolution Plan"
      pageSubtitle="IEC 62304 §9 — Problem resolution process"
      entityLabel="Plan"
    />
  );
}
