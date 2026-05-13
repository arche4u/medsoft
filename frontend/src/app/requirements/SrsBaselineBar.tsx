"use client";
/**
 * SRS baseline bar — orchestrator for the two-tier SRS UI.
 *
 * Loads composite baselines (full detail) + per-category baseline summaries
 * + lock state, then composes:
 *   • SrsCompositeCard for the top-level release manifest
 *   • SrsCategoryCard per requirement category
 *   • SrsHistoryDetail for clicking into a frozen snapshot (with diff)
 *
 * The page uses `onState` to know which baselines exist (so the SRS PDF can
 * render the right manifest).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api, CompositeBaseline, CompositeBaselineSummary,
  RequirementCategory, RequirementCategoryBaselineSummary, RequirementsLockState,
} from "@/lib/api";
import SrsCompositeCard from "./SrsCompositeCard";
import SrsCategoryCard from "./SrsCategoryCard";
import SrsHistoryDetail from "./SrsHistoryDetail";

type Props = {
  projectId: string;
  projectName?: string;
  /**
   * Project-defined requirement categories (built-in USER/SYSTEM/SOFTWARE + any
   * custom). Drives which category cards render in the bar, so every category
   * — including newly-added custom ones — gets its own versioned lifecycle.
   */
  categories: RequirementCategory[];
  /**
   * Optional focus: when set (e.g. via `?type=USER` from a sidebar sub-item),
   * the bar renders only that single category's card and hides the composite
   * section. The cross-category composite is only meaningful when looking at
   * the whole SRS, not when filtering to one department's view.
   */
  focusCategory?: string;
  onLockChange?: (state: RequirementsLockState | null) => void;
  onState?: (state: {
    composites: CompositeBaseline[];
    composite_summaries: CompositeBaselineSummary[];
    categoryBaselines: RequirementCategoryBaselineSummary[];
    lock: RequirementsLockState | null;
  }) => void;
  onMutated?: () => void;
};

export default function SrsBaselineBar({ projectId, projectName, categories, focusCategory, onLockChange, onState, onMutated }: Props) {
  const [composites, setComposites] = useState<CompositeBaseline[]>([]);
  const [composite_summaries, setCompositeSummaries] = useState<CompositeBaselineSummary[]>([]);
  const [categoryBaselines, setCategoryBaselines] = useState<RequirementCategoryBaselineSummary[]>([]);
  const [lock, setLock] = useState<RequirementsLockState | null>(null);
  const [error, setError] = useState("");
  const [openCatSnapshotId, setOpenCatSnapshotId] = useState<string | null>(null);

  // Stash the parent-supplied callbacks in refs so `refresh` has a stable
  // identity. Without this, inline arrow props (`onState={s => ...}`) get a
  // new identity every render, retriggering refresh → setState → render
  // forever — the API logs flooded with /baselines/lock-state hits.
  const onLockChangeRef = useRef(onLockChange);
  const onStateRef = useRef(onState);
  const onMutatedRef = useRef(onMutated);
  useEffect(() => {
    onLockChangeRef.current = onLockChange;
    onStateRef.current = onState;
    onMutatedRef.current = onMutated;
  });

  const refresh = useCallback(async () => {
    if (!projectId) return;
    try {
      const [summaries, cats, lk] = await Promise.all([
        api.requirements.baselines.list(projectId),
        api.requirements.categoryBaselines.list(projectId),
        api.requirements.baselines.lockState(projectId),
      ]);
      // Hydrate composite details (needed for components / signoff trail).
      const details = await Promise.all(summaries.map(s => api.requirements.baselines.get(s.id)));
      setComposites(details);
      setCompositeSummaries(summaries);
      setCategoryBaselines(cats);
      setLock(lk);
      onLockChangeRef.current?.(lk);
      onStateRef.current?.({ composites: details, composite_summaries: summaries, categoryBaselines: cats, lock: lk });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);

  // Every project-defined category (built-in + custom) gets its own card so
  // newly added categories can be baselined immediately. Order follows the
  // category's `sort_order` to match the requirements list above. When the
  // page is focused on a single category (sidebar sub-item), the list is
  // narrowed to just that one.
  const categoryNames = useMemo(() => {
    const fromProject = categories
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(c => c.name);
    const orphans = categoryBaselines
      .map(b => b.category_name)
      .filter(n => !fromProject.includes(n));
    const all = [...fromProject, ...Array.from(new Set(orphans))];
    if (focusCategory) {
      const focused = focusCategory.toUpperCase();
      return all.filter(n => n.toUpperCase() === focused);
    }
    return all;
  }, [categories, categoryBaselines, focusCategory]);

  function baselinesForCategory(cat: string): RequirementCategoryBaselineSummary[] {
    return categoryBaselines
      .filter(b => b.category_name === cat)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  function lockForCategory(cat: string) {
    return lock?.categories.find(c => c.category_name === cat);
  }

  const handleMutated = useCallback(async () => {
    await refresh();
    onMutatedRef.current?.();
  }, [refresh]);

  if (!projectId) return null;

  return (
    <div style={{ marginBottom: 14 }}>
      {error && <div style={styles.errorBanner}>{error}</div>}

      {/* Composite is the cross-category release manifest — only meaningful in
          the "all categories" view. Sub-category pages (e.g. ?type=USER) hide
          it so the user sees only their department's baseline workflow. */}
      {!focusCategory && (
        <SrsCompositeCard
          projectId={projectId}
          composites={composites}
          composite_summaries={composite_summaries}
          allCategoryBaselines={categoryBaselines}
          onMutated={handleMutated}
        />
      )}

      <div style={styles.subhead}>
        {focusCategory
          ? `${categories.find(c => c.name.toUpperCase() === focusCategory.toUpperCase())?.label ?? focusCategory} baselines`
          : "Per-category baselines"}
      </div>
      {categoryNames.map(cat => {
        const def = categories.find(c => c.name === cat);
        return (
          <SrsCategoryCard
            key={cat}
            projectId={projectId}
            category={cat}
            categoryLabel={def?.label ?? cat}
            categoryColor={def?.color ?? "#546e7a"}
            baselines={baselinesForCategory(cat)}
            lock={lockForCategory(cat)}
            onMutated={handleMutated}
            onOpenSnapshot={id => setOpenCatSnapshotId(id)}
          />
        );
      })}

      {openCatSnapshotId && (
        <SrsHistoryDetail
          selectedId={openCatSnapshotId}
          /* SrsHistoryDetail history list = all category baselines so the
             diff dropdown can pick from the same category's other versions. */
          history={categoryBaselines.filter(b => {
            const sel = categoryBaselines.find(x => x.id === openCatSnapshotId);
            return sel ? b.category_name === sel.category_name : false;
          })}
          projectName={projectName}
          categories={categories}
          onClose={() => setOpenCatSnapshotId(null)}
        />
      )}
    </div>
  );
}

const styles = {
  subhead: {
    fontSize: 11, fontWeight: 700, color: "#546e7a", textTransform: "uppercase" as const,
    letterSpacing: "0.05em", margin: "12px 0 6px",
  } as React.CSSProperties,
  errorBanner: {
    padding: "8px 12px", background: "#ffebee", border: "1px solid #ef9a9a",
    borderRadius: 6, color: "#b71c1c", fontSize: 13, marginBottom: 10,
  } as React.CSSProperties,
};
