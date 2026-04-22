"use client";
import { useState, useEffect } from "react";

export function useActiveProject(): [string, (id: string) => void] {
  const [projectId, setProjectIdState] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("medsoft_active_project") ?? "";
    if (saved) setProjectIdState(saved);

    const handler = (e: Event) => {
      const pid = (e as CustomEvent<{ projectId: string }>).detail?.projectId ?? "";
      setProjectIdState(pid);
    };
    window.addEventListener("medsoft:project_changed", handler);
    return () => window.removeEventListener("medsoft:project_changed", handler);
  }, []);

  const setProjectId = (pid: string) => {
    setProjectIdState(pid);
    if (typeof window !== "undefined") {
      localStorage.setItem("medsoft_active_project", pid);
      window.dispatchEvent(new CustomEvent("medsoft:project_changed", { detail: { projectId: pid } }));
    }
  };

  return [projectId, setProjectId];
}
