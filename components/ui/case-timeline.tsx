import { cn } from "@/lib/utils";

/**
 * CaseTimeline — pipeline progress for a case.
 *
 * Contract (masterplan §2.2): per-stage states pending | running (pulse) |
 * done | failed. Failures always name the stage (never a generic error) —
 * the retry affordance lives with the parent surface.
 */

const STAGES = ["INTAKE", "EXTRACTING", "CLASSIFYING", "DIAGNOSING", "REVIEW"] as const;
export type CaseStage = (typeof STAGES)[number];

const STAGE_DISPLAY: Record<CaseStage, string> = {
  INTAKE: "Intake",
  EXTRACTING: "Extraction",
  CLASSIFYING: "Classification",
  DIAGNOSING: "Diagnosis",
  REVIEW: "Report ready",
};

type StageState = "pending" | "running" | "done" | "failed";

export interface CaseTimelineProps {
  /** Current case status. FAILED requires failedStage. */
  status: CaseStage | "FAILED" | "CLOSED";
  /** Stage that failed when status === "FAILED". */
  failedStage?: CaseStage;
  className?: string;
}

function stateFor(stage: CaseStage, props: CaseTimelineProps): StageState {
  const { status, failedStage } = props;
  const order = STAGES.indexOf(stage);

  if (status === "FAILED") {
    const failedIdx = failedStage ? STAGES.indexOf(failedStage) : 0;
    if (order < failedIdx) return "done";
    if (order === failedIdx) return "failed";
    return "pending";
  }
  if (status === "CLOSED") return "done";

  const currentIdx = STAGES.indexOf(status);
  if (order < currentIdx) return "done";
  if (order === currentIdx) return status === "REVIEW" ? "done" : "running";
  return "pending";
}

const DOT_CLASS: Record<StageState, string> = {
  pending: "bg-ink-700",
  running: "bg-brand-500 animate-pulse",
  done: "bg-conf-high",
  failed: "bg-risk-critical",
};
const LABEL_CLASS: Record<StageState, string> = {
  pending: "text-ink-400",
  running: "text-brand-300",
  done: "text-ink-200",
  failed: "text-risk-critical",
};
const STATE_TEXT: Record<StageState, string> = {
  pending: "pending",
  running: "running",
  done: "done",
  failed: "failed",
};

export function CaseTimeline(props: CaseTimelineProps) {
  return (
    <ol
      aria-label="Case pipeline progress"
      className={cn(
        "flex flex-wrap items-center gap-x-1 gap-y-2 rounded-md border border-ink-700 bg-ink-900 px-4 py-3",
        props.className,
      )}
    >
      {STAGES.map((stage, i) => {
        const state = stateFor(stage, props);
        return (
          <li key={stage} className="flex items-center gap-1">
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className={cn("size-2 shrink-0 rounded-full", DOT_CLASS[state])}
              />
              <span className={cn("text-caption font-medium", LABEL_CLASS[state])}>
                {STAGE_DISPLAY[stage]}
              </span>
              <span role="status" className="sr-only">
                {STAGE_DISPLAY[stage]}: {STATE_TEXT[state]}
              </span>
              {state === "failed" ? (
                <span className="text-caption text-risk-critical">
                  — {STAGE_DISPLAY[stage]} failed, retry available
                </span>
              ) : null}
            </span>
            {i < STAGES.length - 1 ? (
              <span aria-hidden="true" className="mx-1.5 h-px w-6 bg-ink-700" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
