import { useEffect, useMemo, useState } from "react";

import {
  Bot,
  BrainCircuit,
  Database,
  RefreshCw,
  FileText,
  ShieldCheck,
  ArrowDown,
  CheckCircle2,
  Clock3,
  Zap,
  Rocket,
  BellRing,
  Search,
  Ban,
  Play,
  AlertTriangle,
} from "lucide-react";

import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import "../App.css";

import { runWorkflow } from "../services/api";

/*
 * These agents correspond to the specialized agents implemented
 * in the DriftWatcher backend workflow.
 */
const agents = [
  {
    name: "Drift Detection Agent",
    description:
      "Interprets drift evidence from ADWIN, DDM and Page-Hinkley and explains the detected drift.",
    icon: ShieldCheck,
    color: "blue",
  },
  {
    name: "Root Cause Agent",
    description:
      "Analyzes changed features and identifies probable causes of detected drift.",
    icon: BrainCircuit,
    color: "purple",
  },
  {
    name: "Data Quality Agent",
    description:
      "Assesses data-quality evidence including missing values, duplicates, outliers and unseen categories.",
    icon: Database,
    color: "green",
  },
  {
    name: "Retraining Agent",
    description:
      "Trains and evaluates a candidate model when adaptation is required.",
    icon: RefreshCw,
    color: "orange",
  },
  {
    name: "Report Agent",
    description:
      "Generates an AI-powered concept drift monitoring report.",
    icon: FileText,
    color: "cyan",
  },
  {
    name: "Decision Agent",
    description:
      "Combines evidence from the workflow and determines the next action.",
    icon: Bot,
    color: "pink",
  },
];

/*
 * These represent the types of actions that can be surfaced
 * by the Action Engine.
 */
const actions = [
  {
    name: "RETRAIN_AND_DEPLOY",
    description:
      "Register an accepted candidate model and deploy it as the active production model.",
    icon: Rocket,
    color: "green",
  },
  {
    name: "RETRAIN_ONLY",
    description:
      "Retrain and evaluate a candidate model without changing the active production model.",
    icon: RefreshCw,
    color: "blue",
  },
  {
    name: "INVESTIGATE",
    description:
      "Trigger further investigation when additional analysis or data-quality review is required.",
    icon: Search,
    color: "orange",
  },
  {
    name: "ALERT_ONLY",
    description:
      "Notify the user about the detected condition without retraining or deployment.",
    icon: BellRing,
    color: "purple",
  },
  {
    name: "NO_ACTION",
    description:
      "Keep the current production model when no corrective action is required.",
    icon: Ban,
    color: "gray",
  },
];

/*
 * Safely convert any backend value to readable text.
 */
function formatValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "number") {
    return Number.isInteger(value)
      ? value.toLocaleString()
      : value.toFixed(4);
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/*
 * Extract the actual reasoning text returned by an agent.
 */
function getReasoning(result) {
  if (!result) {
    return "";
  }

  if (typeof result.reasoning === "string") {
    return result.reasoning;
  }

  if (typeof result.interpretation === "string") {
    return result.interpretation;
  }

  if (typeof result.explanation === "string") {
    return result.explanation;
  }

  if (typeof result.message === "string") {
    return result.message;
  }

  if (typeof result.report_conclusion === "string") {
    return result.report_conclusion;
  }

  return "";
}

/*
 * Get a safe status from an agent result.
 */
function getAgentStatus(result) {
  if (!result) {
    return "Waiting";
  }

  if (result.status) {
    return String(result.status);
  }

  return "Completed";
}

/*
 * Format backend status for UI.
 */
function displayStatus(status) {
  if (!status) {
    return "Waiting";
  }

  const normalized = String(status).toLowerCase();

  if (
    normalized === "success" ||
    normalized === "completed"
  ) {
    return "Completed";
  }

  if (
    normalized === "error" ||
    normalized === "failed" ||
    normalized === "failure"
  ) {
    return "Failed";
  }

  return String(status);
}


/*
 * Build a concise, model-agnostic fallback for Retraining Agent.
 * It highlights the metric checks that actually caused rejection,
 * rather than always showing the primary metric's improvement.
 */
function getRetrainingFallback(comparison) {
  if (!comparison || typeof comparison !== "object") {
    return "Candidate-model training and evaluation results appear when retraining is triggered.";
  }

  const decision = comparison.comparison_decision || "completed";
  const accepted = comparison.candidate_accepted;
  const metricComparison =
    comparison.metric_comparison && typeof comparison.metric_comparison === "object"
      ? comparison.metric_comparison
      : {};

  const higherIsBetter = new Set([
    "accuracy", "precision", "recall", "f1", "f1_score", "r2", "r2_score",
    "auc", "roc_auc", "specificity",
  ]);
  const lowerIsBetter = new Set([
    "mae", "mse", "rmse", "log_loss", "loss", "error", "error_rate", "mape", "msle",
  ]);

  const labelFor = (key) => {
    const normalized = String(key).toLowerCase();
    const labels = {
      r2: "R²",
      r2_score: "R²",
      f1: "F1 Score",
      f1_score: "F1 Score",
      mae: "MAE",
      mse: "MSE",
      rmse: "RMSE",
    };
    return labels[normalized] || String(key).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  };

  if (accepted === false) {
    const failedMetrics = Object.entries(metricComparison)
      .filter(([key, details]) => {
        if (!details || typeof details !== "object") return false;
        return (
          details.improved === false ||
          details.non_worsening === false ||
          (String(key).toLowerCase() === String(comparison.primary_metric || "").toLowerCase() &&
            comparison.primary_metric_passed === false)
        );
      })
      .map(([key, details]) => {
        const normalized = String(key).toLowerCase();
        const current = Number(details.current);
        const candidate = Number(details.candidate);
        let change = "did not satisfy the configured acceptance rule";

        if (Number.isFinite(current) && Number.isFinite(candidate)) {
          if (lowerIsBetter.has(normalized) && candidate > current) {
            change = `increased (${formatValue(candidate - current)})`;
          } else if (higherIsBetter.has(normalized) && candidate < current) {
            const difference = current - candidate;
            change =
              normalized !== "r2" &&
              normalized !== "r2_score" &&
              current >= 0 && current <= 1 &&
              candidate >= 0 && candidate <= 1
                ? `decreased by ${(difference * 100).toFixed(2)} percentage points`
                : `decreased (${formatValue(difference)})`;
          } else if (
            normalized === String(comparison.primary_metric || "").toLowerCase() &&
            comparison.primary_metric_passed === false
          ) {
            change = "did not meet the required improvement threshold";
          }
        }

        return `${labelFor(key)} ${change} (${formatValue(details.current)} → ${formatValue(details.candidate)})`;
      });

    if (!failedMetrics.length && comparison.decision_metric) {
      const metric = comparison.decision_metric;
      failedMetrics.push(
        `${metric.label || labelFor(metric.key || "Evaluation metric")} contributed to candidate rejection`
      );
    }

    if (!failedMetrics.length && Array.isArray(comparison.rejection_reasons)) {
      failedMetrics.push(...comparison.rejection_reasons.map(String));
    }

    const explanation = failedMetrics.length
      ? `Decision-critical metric(s): ${failedMetrics.join("; ")}.`
      : "The candidate did not satisfy the configured acceptance criteria.";

    return `Candidate evaluation: ${decision}. ${explanation} Keep the current production model.`;
  }

  if (accepted === true) {
    const primary = comparison.primary_metric;
    const improvement = comparison.score_improvement;
    return `Candidate evaluation: ${decision}. ${
      primary ? `${labelFor(primary)} improvement: ${formatValue(improvement)}.` : "Candidate passed the configured acceptance criteria."
    }`;
  }

  return `Candidate evaluation: ${decision}. A definitive acceptance result was not supplied.`;
}

/*
 * Convert the agent's Markdown-like response into readable sections.
 * This is intentionally dependency-free and preserves the original text.
 */
function parseReasoningSections(text) {
  if (!text || typeof text !== "string") return [];

  const normalized = text
    .replace(/\r\n?/g, "\n")
    .replace(/@@SECTION@@/g, "\n")
    .replace(/\*\*([A-Z][A-Z0-9 /&()_-]{2,}:)\*\*/g, "\n$1\n")
    .replace(/[ \t]+(?=(?:DRIFT STATUS|DETECTORS|MODEL PERFORMANCE|INTERPRETATION|RECOMMENDED NEXT STEP)\s*:)/gi, "\n")
    .trim();

  const knownHeadings = new Set([
    "DRIFT STATUS",
    "DETECTORS",
    "MODEL PERFORMANCE",
    "INTERPRETATION",
    "RECOMMENDED NEXT STEP",
  ]);

  const sections = [];
  let currentTitle = "";
  let currentLines = [];

  const flushSection = () => {
    const body = currentLines.join("\n").trim();
    if (body) {
      sections.push({
        title: currentTitle || (sections.length === 0 ? "Summary" : "Analysis"),
        body,
      });
    }
    currentLines = [];
  };

  normalized.split("\n").forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) {
      if (currentLines.length && currentLines[currentLines.length - 1] !== "") {
        currentLines.push("");
      }
      return;
    }

    const cleanedHeading = line
      .replace(/^\*\*/, "")
      .replace(/\*\*$/, "")
      .replace(/:$/, "")
      .trim()
      .toUpperCase();

    // Only the five intentional reasoning headings may start a section.
    // Detector names such as ADWIN, DDM and PageHinkley must remain content.
    if (knownHeadings.has(cleanedHeading)) {
      flushSection();
      currentTitle = cleanedHeading;
      return;
    }

    // Also support a heading and its first value on the same line.
    const inlineHeading = line.match(
      /^(DRIFT STATUS|DETECTORS|MODEL PERFORMANCE|INTERPRETATION|RECOMMENDED NEXT STEP)\s*:\s*(.+)$/i
    );

    if (inlineHeading) {
      flushSection();
      currentTitle = inlineHeading[1].toUpperCase();
      currentLines.push(inlineHeading[2].trim());
      return;
    }

    currentLines.push(line);
  });

  flushSection();

  // Keep each required section unique. If the LLM accidentally emits
  // another DETECTORS heading for a narrative explanation, move that
  // extra content into INTERPRETATION instead of rendering a duplicate card.
  const consolidated = [];
  const sectionByTitle = new Map();

  sections.forEach((section) => {
    const title = String(section.title || "Analysis").toUpperCase();
    const existing = sectionByTitle.get(title);

    if (!existing) {
      const copy = { ...section, title };
      sectionByTitle.set(title, copy);
      consolidated.push(copy);
      return;
    }

    // Repeated DETECTORS content belongs in INTERPRETATION.
    const destinationTitle =
      title === "DETECTORS" ? "INTERPRETATION" : title;
    let destination = sectionByTitle.get(destinationTitle);

    if (!destination) {
      destination = { title: destinationTitle, body: "" };
      sectionByTitle.set(destinationTitle, destination);
      consolidated.push(destination);
    }

    destination.body = [destination.body, section.body]
      .filter(Boolean)
      .join("\n\n");
  });

  return consolidated.length
    ? consolidated
    : [{ title: "Analysis", body: normalized || text.trim() }];
}

function renderInlineFormatting(text) {
  const parts = String(text || "").split(/(\*\*.*?\*\*|`[^`]+`)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

function StructuredReasoning({ text, fallback }) {
  const [showDetails, setShowDetails] = useState(false);
  const sections = parseReasoningSections(text);
  const content = text || fallback || "No detailed reasoning was returned by this agent.";

  return (
    <div className="structured-reasoning">
      {text ? (
        <div className="structured-reasoning-sections">
          {sections.map((section, index) => {
            const lines = section.body
              .split(/\n/)
              .map((line) => line.trim())
              .filter(Boolean);

            return (
              <section className="structured-reasoning-section" key={`${section.title}-${index}`}>
                {section.title && <h5>{section.title.replace(/_/g, " ")}</h5>}
                {lines.some((line) => /^([-•*]|\d+[.)])\s/.test(line)) ? (
                  <ul>
                    {lines.map((line, lineIndex) => {
                      const item = line.replace(/^([-•*]|\d+[.)])\s*/, "");
                      return <li key={lineIndex}>{renderInlineFormatting(item)}</li>;
                    })}
                  </ul>
                ) : (
                  lines.map((line, lineIndex) => (
                    <p key={lineIndex}>{renderInlineFormatting(line.replace(/^[-•]\s*/, ""))}</p>
                  ))
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <p className="structured-reasoning-empty">{fallback || content}</p>
      )}

      {text && (
        <details
          className="reasoning-raw-details"
          open={showDetails}
          onToggle={(event) => setShowDetails(event.currentTarget.open)}
        >
          <summary>{showDetails ? "Hide original response" : "View original response"}</summary>
          <pre>{content}</pre>
        </details>
      )}
    </div>
  );
}

function AIAgents() {
  const [workflowResult, setWorkflowResult] = useState(
    () => window.__driftWatcherWorkflowResult || null
  );

  const [workflowStatus, setWorkflowStatus] =
    useState("Ready");

  const [workflowError, setWorkflowError] =
    useState("");

  const [running, setRunning] = useState(false);

  const [configuration, setConfiguration] =
    useState(null);

  /*
   * ---------------------------------------------------------
   * Load existing project configuration
   * ---------------------------------------------------------
   */
  useEffect(() => {
    try {
      const modelConfig = JSON.parse(
        localStorage.getItem(
          "driftwatcher.modelConfig"
        ) || "null"
      );

      const datasetConfig = JSON.parse(
        localStorage.getItem(
          "driftwatcher.datasetConfig"
        ) || "null"
      );

      const monitoringConfig = JSON.parse(
        localStorage.getItem(
          "driftwatcher.monitoringConfig"
        ) || "null"
      );

      setConfiguration({
        modelConfig,
        datasetConfig,
        monitoringConfig,
      });
    } catch (error) {
      console.error(
        "Failed to load DriftWatcher configuration:",
        error
      );
    }

    /*
     * If another page already completed the workflow during
     * this browser session, load that result.
     */
    if (window.__driftWatcherWorkflowResult) {
      setWorkflowResult(
        window.__driftWatcherWorkflowResult
      );

      setWorkflowStatus("Completed");
    }

    /*
     * Listen for workflow results from this page or another
     * component.
     */
    const handleWorkflowResult = (event) => {
      const result =
        event?.detail ||
        window.__driftWatcherWorkflowResult ||
        null;

      if (result) {
        setWorkflowResult(result);
        setWorkflowStatus("Completed");
        setWorkflowError("");
      }
    };

    window.addEventListener(
      "driftwatcher:workflow-result",
      handleWorkflowResult
    );

    return () => {
      window.removeEventListener(
        "driftwatcher:workflow-result",
        handleWorkflowResult
      );
    };
  }, []);

  /*
   * ---------------------------------------------------------
   * Run complete backend workflow
   * ---------------------------------------------------------
   */
  const handleRunWorkflow = async () => {
    setWorkflowError("");

    const modelPath =
      configuration?.modelConfig?.modelPath;

    const referenceDatasetPath =
      configuration?.datasetConfig
        ?.referenceDatasetPath;

    const currentDatasetPath =
      configuration?.datasetConfig
        ?.currentDatasetPath;

    const preprocessorPath =
      configuration?.monitoringConfig
        ?.preprocessorPath || null;

    const targetColumn =
      configuration?.monitoringConfig?.targetColumn ||
      configuration?.datasetConfig?.targetColumn ||
      null;

    const problemType =
      configuration?.monitoringConfig?.problemType ||
      configuration?.datasetConfig?.problemType ||
      null;

    const monitoringFeature =
      configuration?.monitoringConfig?.monitoringFeature ||
      null;

    const timestampColumn =
      configuration?.monitoringConfig?.timestampColumn ||
      null;

    if (!modelPath) {
      setWorkflowError(
        "Model configuration is missing. Please upload the model first."
      );

      setWorkflowStatus("Configuration required");

      return;
    }

    if (!referenceDatasetPath) {
      setWorkflowError(
        "Reference dataset configuration is missing. Please upload the reference dataset first."
      );

      setWorkflowStatus("Configuration required");

      return;
    }

    if (!currentDatasetPath) {
      setWorkflowError(
        "Current monitoring dataset configuration is missing. Please upload the current dataset first."
      );

      setWorkflowStatus("Configuration required");

      return;
    }

    if (!targetColumn) {
      setWorkflowError(
        "Target column is missing. Please create the monitoring configuration first."
      );

      setWorkflowStatus("Configuration required");

      return;
    }

    setRunning(true);
    setWorkflowStatus("Running workflow...");

    try {
      /*
       * This calls the real FastAPI:
       *
       * POST /run-workflow
       */
      const result = await runWorkflow({
        referenceDatasetPath,
        currentDatasetPath,
        modelPath,
        targetColumn,
        preprocessorPath,
        problemType,
        monitoringFeature,
        timestampColumn,
      });

      if (!result) {
        throw new Error(
          "Backend returned an empty workflow result."
        );
      }

      if (
        result.status &&
        String(result.status).toLowerCase() !==
          "completed"
      ) {
        throw new Error(
          result.message ||
            "Workflow did not complete successfully."
        );
      }

      /*
       * Keep the result in React state for this page.
       */
      setWorkflowResult(result);

      /*
       * Keep the latest result in browser memory so
       * already-mounted DriftWatcher pages can access it.
       */
      window.__driftWatcherWorkflowResult = result;

      /*
       * Persist the latest completed workflow result so pages such as
       * Root Cause, Retraining, Deployment, Reports and Alerts can
       * read the same workflow result after React route navigation.
       *
       * This does not call the backend again and does not replace the
       * backend result. It only shares the result between frontend pages.
       */
      // Browser storage is optional. Large XGBoost workflow results
      // must not turn a successful backend execution into a UI failure.
      try {
        localStorage.setItem(
          "driftwatcher.workflowResult",
          JSON.stringify(result)
        );
      } catch (storageError) {
        console.warn(
          "Workflow completed, but the result could not be saved to localStorage:",
          storageError
        );

        // Remove an older oversized result if possible. The current
        // result remains available in React state and window memory.
        try {
          localStorage.removeItem("driftwatcher.workflowResult");
        } catch (cleanupError) {
          console.warn(
            "Could not clear the previous workflow result:",
            cleanupError
          );
        }
      }

      /*
       * Notify any already-mounted component.
       */
      window.dispatchEvent(
        new CustomEvent(
          "driftwatcher:workflow-result",
          {
            detail: result,
          }
        )
      );

      setWorkflowStatus("Completed");
    } catch (error) {
      console.error(
        "DriftWatcher workflow failed:",
        error
      );

      const rawDetail =
        error?.response?.data?.detail;

      const message =
        typeof rawDetail === "string"
          ? rawDetail
          : Array.isArray(rawDetail)
            ? rawDetail
                .map((item) =>
                  typeof item === "string"
                    ? item
                    : item?.msg ||
                      item?.detail ||
                      JSON.stringify(item)
                )
                .join("; ")
            : rawDetail &&
                typeof rawDetail === "object"
              ? rawDetail.message ||
                rawDetail.detail ||
                JSON.stringify(rawDetail)
              : error?.message ||
                "Workflow execution failed.";

      setWorkflowError(message);
      setWorkflowStatus("Failed");
      setWorkflowResult(null);

      window.__driftWatcherWorkflowResult = null;
      try {
        localStorage.removeItem("driftwatcher.workflowResult");
      } catch (storageError) {
        console.warn(
          "Could not clear the previous workflow result:",
          storageError
        );
      }
    } finally {
      setRunning(false);
    }
  };

  /*
   * ---------------------------------------------------------
   * Extract individual agent results
   * ---------------------------------------------------------
   */
  const driftResult =
    workflowResult?.drift_detection || null;

  const rootCauseResult =
    workflowResult?.root_cause || null;

  const dataQualityResult =
    workflowResult?.data_quality || null;

  const retrainingWrapper =
    workflowResult?.retraining || null;

  const retrainingResult =
    retrainingWrapper?.retraining_result ||
    retrainingWrapper ||
    null;

  const reportResult =
    workflowResult?.report || null;

  const decisionWrapper =
    workflowResult?.decision || null;

  const decisionResult =
    decisionWrapper?.decision_result ||
    null;

  const actionResult =
    workflowResult?.action || null;

  /*
   * ---------------------------------------------------------
   * Decision
   * ---------------------------------------------------------
   */
  const decision =
    decisionResult?.decision ||
    "Waiting for decision";

  const action =
    actionResult?.action ||
    "NOT EXECUTED";

  const actionStatus =
    actionResult?.status ||
    "NOT EXECUTED";

  /*
   * ---------------------------------------------------------
   * Candidate evaluation
   * ---------------------------------------------------------
   */
  const comparison =
    retrainingResult?.comparison || {};

  const candidateAccepted =
    comparison?.candidate_accepted;

  /*
   * ---------------------------------------------------------
   * Agent card status
   * ---------------------------------------------------------
   */
  const agentResults = useMemo(
    () => ({
      "Drift Detection Agent": driftResult,
      "Root Cause Agent": rootCauseResult,
      "Data Quality Agent": dataQualityResult,
      "Retraining Agent": retrainingResult,
      "Report Agent": reportResult,
      "Decision Agent": decisionWrapper,
    }),
    [
      driftResult,
      rootCauseResult,
      dataQualityResult,
      retrainingResult,
      reportResult,
      decisionWrapper,
    ]
  );

  return (
    <div className="app-shell">
      <Sidebar />

      <main className="main-area">
        <Topbar title="AI Agents" />
        <style>{`
          .reasoning-panel-structured {
            display: grid;
            grid-template-columns: minmax(0, 1fr);
            gap: 16px;
          }
          .reasoning-item-structured {
            min-width: 0;
            display: block;
            padding: 20px;
            border: 1px solid #e2e8f0;
            border-radius: 14px;
            background: #ffffff;
            text-align: left;
          }
          .structured-reasoning-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 16px;
            margin-bottom: 14px;
          }
          .structured-reasoning-header h4 {
            margin: 8px 0 0;
            color: #172b4d;
            font-size: 16px;
            font-weight: 700;
          }
          .structured-status-dot {
            width: 10px;
            height: 10px;
            flex: 0 0 10px;
            margin-top: 7px;
            border-radius: 50%;
            background: #94a3b8;
          }
          .structured-status-dot.is-complete { background: #16a34a; }
          .structured-reasoning-sections {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 12px;
          }
          .structured-reasoning-section {
            min-width: 0;
            padding: 13px 14px;
            border-radius: 10px;
            background: #f8fafc;
            overflow-wrap: anywhere;
          }
          .structured-reasoning-section:first-child:last-child {
            grid-column: 1 / -1;
          }
          .structured-reasoning-section h5 {
            margin: 0 0 8px;
            color: #334155;
            font-size: 12px;
            font-weight: 800;
            letter-spacing: .045em;
            text-transform: uppercase;
          }
          .structured-reasoning-section p {
            margin: 0 0 8px;
            color: #526581;
            font-size: 13px;
            line-height: 1.65;
            white-space: pre-wrap;
          }
          .structured-reasoning-section p:last-child { margin-bottom: 0; }
          .structured-reasoning-section ul {
            margin: 0;
            padding-left: 19px;
            color: #526581;
            font-size: 13px;
            line-height: 1.7;
          }
          .structured-reasoning-section li { margin: 3px 0; }
          .structured-reasoning-section strong { color: #263b59; }
          .structured-reasoning-section code {
            padding: 2px 4px;
            border-radius: 4px;
            background: #e2e8f0;
          }
          .structured-reasoning-empty {
            margin: 0;
            color: #64748b;
            font-size: 13px;
            line-height: 1.6;
          }
          .reasoning-raw-details {
            margin-top: 14px;
            padding-top: 12px;
            border-top: 1px solid #e2e8f0;
          }
          .reasoning-raw-details summary {
            color: #2563eb;
            cursor: pointer;
            font-size: 12px;
            font-weight: 700;
          }
          .reasoning-raw-details pre {
            max-height: 320px;
            margin-top: 10px;
            padding: 12px;
            overflow: auto;
            border-radius: 8px;
            background: #f1f5f9;
            color: #475569;
            font: 12px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace;
            white-space: pre-wrap;
            overflow-wrap: anywhere;
          }
          @media (max-width: 760px) {
            .structured-reasoning-sections { grid-template-columns: minmax(0, 1fr); }
            .reasoning-item-structured { padding: 14px; }
          }
        `}</style>

        <section className="dashboard-content">
          {/* =========================
              Page Heading
          ========================== */}
          <div className="page-heading">
            <div>
              <h2>AI Agents</h2>

              <p>
                Collaborative Agentic AI reasoning for
                continuous ML monitoring.
              </p>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                flexWrap: "wrap",
              }}
            >
              <div className="summary-status success">
                <span className="status-dot"></span>

                6 Specialized Agents
              </div>

              <button
                type="button"
                className="primary-action"
                onClick={handleRunWorkflow}
                disabled={running}
              >
                <Play size={17} />

                {running
                  ? "Running Workflow..."
                  : "Run AI Workflow"}
              </button>
            </div>
          </div>

          {/* =========================
              Workflow Status
          ========================== */}
          <div
            className="panel-card"
            style={{
              marginBottom: "20px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "20px",
                flexWrap: "wrap",
              }}
            >
              <div>
                <strong>
                  Workflow Status
                </strong>

                <p
                  style={{
                    marginTop: "5px",
                  }}
                >
                  {workflowStatus ===
                  "Completed"
                    ? "The latest multi-agent workflow result is available."
                    : workflowStatus ===
                        "Running workflow..."
                      ? "FastAPI is executing the complete DriftWatcher workflow."
                      : "Run the workflow to execute the backend agents."}
                </p>
              </div>

              <span
                className={
                  workflowStatus === "Completed"
                    ? "active-badge"
                    : workflowStatus === "Failed"
                      ? "table-status danger"
                      : "live-badge"
                }
              >
                {workflowStatus}
              </span>
            </div>
          </div>

          {/* =========================
              Error Message
          ========================== */}
          {workflowError && (
            <div
              className="panel-card"
              style={{
                marginBottom: "20px",
                borderColor: "#fecaca",
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  alignItems: "flex-start",
                }}
              >
                <AlertTriangle size={20} />

                <div>
                  <strong>
                    Workflow Error
                  </strong>

                  <p
                    style={{
                      marginTop: "5px",
                    }}
                  >
                    {workflowError}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* =========================
              Multi-Agent Workflow
          ========================== */}
          <div className="section-header">
            <div>
              <h3>
                Multi-Agent AI Workflow
              </h3>

              <p>
                Specialized agents work together to detect,
                analyze, validate, adapt, report, decide and
                execute actions.
              </p>
            </div>
          </div>

          <div className="agent-workflow">
            {/* Detect */}
            <div className="workflow-step">
              <div className="workflow-icon blue">
                <ShieldCheck size={24} />
              </div>

              <strong>Detect</strong>
              <span>Drift Detection</span>
            </div>

            <ArrowDown
              className="workflow-arrow"
              size={22}
            />

            {/* Analyze */}
            <div className="workflow-step">
              <div className="workflow-icon purple">
                <BrainCircuit size={24} />
              </div>

              <strong>Analyze</strong>
              <span>Root Cause</span>
            </div>

            <ArrowDown
              className="workflow-arrow"
              size={22}
            />

            {/* Validate */}
            <div className="workflow-step">
              <div className="workflow-icon green">
                <Database size={24} />
              </div>

              <strong>Validate</strong>
              <span>Data Quality</span>
            </div>

            <ArrowDown
              className="workflow-arrow"
              size={22}
            />

            {/* Retrain */}
            <div className="workflow-step">
              <div className="workflow-icon orange">
                <RefreshCw size={24} />
              </div>

              <strong>Adapt</strong>
              <span>Retraining</span>
            </div>

            <ArrowDown
              className="workflow-arrow"
              size={22}
            />

            {/* Report */}
            <div className="workflow-step">
              <div className="workflow-icon cyan">
                <FileText size={24} />
              </div>

              <strong>Report</strong>
              <span>Report Agent</span>
            </div>

            <ArrowDown
              className="workflow-arrow"
              size={22}
            />

            {/* Decide */}
            <div className="workflow-step">
              <div className="workflow-icon pink">
                <Bot size={24} />
              </div>

              <strong>Decide</strong>
              <span>Decision Agent</span>
            </div>

            <ArrowDown
              className="workflow-arrow"
              size={22}
            />

            {/* Action */}
            <div className="workflow-step">
              <div className="workflow-icon blue">
                <Zap size={24} />
              </div>

              <strong>Action</strong>
              <span>Action Engine</span>
            </div>
          </div>

          {/* =========================
              Specialized Agents
          ========================== */}
          <div className="section-header">
            <div>
              <h3>
                Specialized AI Agents
              </h3>

              <p>
                Each agent performs a dedicated role in the
                DriftWatcher workflow.
              </p>
            </div>
          </div>

          <div className="agents-grid">
            {agents.map((agent) => {
              const Icon = agent.icon;

              const result =
                agentResults[agent.name];

              const hasResult = Boolean(result);

              return (
                <div
                  className="agent-card"
                  key={agent.name}
                >
                  <div
                    className={`agent-icon ${agent.color}`}
                  >
                    <Icon size={24} />
                  </div>

                  <div className="agent-card-content">
                    <div className="agent-card-title">
                      <h4>
                        {agent.name}
                      </h4>

                      <span className="agent-status">
                        <span className="status-dot"></span>

                        {hasResult
                          ? displayStatus(
                              getAgentStatus(
                                result
                              )
                            )
                          : "Ready"}
                      </span>
                    </div>

                    <p>
                      {agent.description}
                    </p>

                    <div className="agent-card-footer">
                      <span>
                        <CheckCircle2
                          size={15}
                        />

                        {hasResult
                          ? "Workflow completed"
                          : "Waiting for workflow"}
                      </span>

                      <span>
                        <Clock3 size={14} />

                        {hasResult
                          ? "Backend Result"
                          : "Backend Ready"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* =========================
              Action Engine
          ========================== */}
          <div className="section-header">
            <div>
              <h3>Action Engine</h3>

              <p>
                Executes the action selected by the
                Decision Agent.
              </p>
            </div>

            <div className="summary-status success">
              <span className="status-dot"></span>

              {workflowResult
                ? "EXECUTION RESULT"
                : "Ready"}
            </div>
          </div>

          <div className="action-engine-panel">
            {/* Decision Result */}
            <div className="action-decision-box">
              <div className="action-main-icon">
                <Zap size={28} />
              </div>

              <div>
                <span className="action-label">
                  DECISION STATUS
                </span>

                <h3>
                  {workflowResult
                    ? decision
                    : "Waiting for Workflow Result"}
                </h3>

                <p>
                  {workflowResult
                    ? "The Decision Agent evaluated the workflow evidence and returned the decision shown above."
                    : "The Decision Agent will determine the appropriate action after drift detection, root-cause analysis, data-quality assessment and model evaluation."}
                </p>
              </div>
            </div>

            {/* Action Flow */}
            <div className="action-flow">
              {/* Register Candidate */}
              <div className="action-flow-step">
                <div className="action-flow-icon orange">
                  <Database size={20} />
                </div>

                <strong>
                  Register
                </strong>

                <span>
                  Candidate model registration
                </span>
              </div>

              <ArrowDown
                className="workflow-arrow"
                size={20}
              />

              {/* Deploy Version */}
              <div className="action-flow-step">
                <div className="action-flow-icon green">
                  <Rocket size={20} />
                </div>

                <strong>
                  Deploy
                </strong>

                <span>
                  Candidate deployment when approved
                </span>
              </div>

              <ArrowDown
                className="workflow-arrow"
                size={20}
              />

              {/* Active Production Model */}
              <div className="action-flow-step">
                <div className="action-flow-icon blue">
                  <CheckCircle2 size={20} />
                </div>

                <strong>
                  Active Model
                </strong>

                <span>
                  Production model updated
                </span>
              </div>
            </div>

            {/* Execution Result */}
            <div className="action-result">
              {workflowResult ? (
                <>
                  <CheckCircle2 size={20} />

                  <div>
                    <strong>
                      {action}
                    </strong>

                    <p>
                      Action Engine status:{" "}
                      {actionStatus}
                    </p>
                  </div>

                  <span className="action-result-badge">
                    {String(actionStatus).toUpperCase()}
                  </span>
                </>
              ) : (
                <>
                  <Clock3 size={20} />

                  <div>
                    <strong>
                      Waiting for backend execution
                      result
                    </strong>

                    <p>
                      Run the AI workflow to populate
                      the Action Engine result.
                    </p>
                  </div>

                  <span className="action-result-badge">
                    NOT EXECUTED
                  </span>
                </>
              )}
            </div>
          </div>

          {/* =========================
              Available Actions
          ========================== */}
          <div className="section-header">
            <div>
              <h3>
                Available Actions
              </h3>

              <p>
                Actions that can be surfaced by the Decision
                Agent and Action Engine.
              </p>
            </div>
          </div>

          <div className="action-options-grid">
            {actions.map((actionItem) => {
              const Icon = actionItem.icon;

              const isSelected =
                workflowResult &&
                action === actionItem.name;

              return (
                <div
                  className={`action-option-card ${actionItem.color}`}
                  key={actionItem.name}
                  style={
                    isSelected
                      ? {
                          border:
                            "2px solid currentColor",
                        }
                      : undefined
                  }
                >
                  <div
                    className={`action-option-icon ${actionItem.color}`}
                  >
                    <Icon size={22} />
                  </div>

                  <div>
                    <div className="action-option-title">
                      <h4>
                        {actionItem.name}
                      </h4>

                      <span>
                        {isSelected
                          ? "Selected"
                          : "Available"}
                      </span>
                    </div>

                    <p>
                      {actionItem.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* =========================
              Latest Agent Reasoning
          ========================== */}
          <div className="section-header">
            <div>
              <h3>Latest Agent Reasoning</h3>
              <p>
                Key findings and recommended actions from each agent. Open the original response when you need the full technical detail.
              </p>
            </div>
          </div>

          <div className="reasoning-panel reasoning-panel-structured">
            {[
              {
                name: "Drift Detection Agent",
                result: driftResult,
                fallback: driftResult
                  ? `Drift detected: ${driftResult.drift_detected ? "Yes" : "No"}.`
                  : "Detector evidence will appear after the monitoring workflow runs.",
              },
              {
                name: "Root Cause Agent",
                result: rootCauseResult,
                fallback: rootCauseResult
                  ? (rootCauseResult.probable_reasons || []).join(" ") || "Root-cause analysis completed."
                  : "Possible causes will appear after drift analysis completes.",
              },
              {
                name: "Data Quality Agent",
                result: dataQualityResult,
                fallback: dataQualityResult
                  ? (dataQualityResult.issues || []).join(" ") || "Data-quality assessment completed."
                  : "Data-quality findings will appear after the workflow evaluates the data.",
              },
              {
                name: "Retraining Agent",
                result: retrainingResult,
                fallback: retrainingResult
                  ? getRetrainingFallback(comparison)
                  : "Candidate-model training and evaluation results appear when retraining is triggered.",
              },
              {
                name: "Decision Agent",
                result: decisionWrapper,
                fallback: decisionWrapper
                  ? `Decision: ${decision}`
                  : "The final decision and recommended action will appear after workflow execution.",
              },
              {
                name: "Report Agent",
                result: reportResult,
                fallback: reportResult
                  ? "The report agent completed its analysis."
                  : "The monitoring report will appear after the workflow runs.",
              },
              {
                name: "Action Engine",
                result: actionResult,
                fallback: actionResult
                  ? `Action: ${action}. Execution status: ${actionStatus}.`
                  : "Action execution details will appear after backend execution.",
              },
            ].map((item) => {
              const result = item.result;
              const reasoning = getReasoning(result);
              const status = result
                ? displayStatus(getAgentStatus(result))
                : "Pending";

              return (
                <article className="reasoning-item reasoning-item-structured" key={item.name}>
                  <div className="structured-reasoning-header">
                    <div>
                      <span className="reasoning-time">{status}</span>
                      <h4>{item.name}</h4>
                    </div>
                    <span className={`structured-status-dot ${status.toLowerCase() === "completed" ? "is-complete" : ""}`} />
                  </div>

                  <StructuredReasoning text={reasoning} fallback={item.fallback} />
                </article>
              );
            })}
          </div>

          {/* =========================
              Workflow Result Details
          ========================== */}
          {workflowResult && (
            <div
              className="panel-card"
              style={{
                marginTop: "20px",
              }}
            >
              <div className="panel-header">
                <div>
                  <h3>
                    Workflow Result Summary
                  </h3>

                  <p>
                    Structured information returned by the
                    DriftWatcher backend workflow.
                  </p>
                </div>

                <span className="active-badge">
                  COMPLETED
                </span>
              </div>

              <div className="summary-grid">
                <div>
                  <span>
                    Workflow
                  </span>

                  <strong>
                    {workflowResult.workflow ||
                      "DriftWatcher Multi-Agent Workflow"}
                  </strong>
                </div>

                <div>
                  <span>
                    Drift Detected
                  </span>

                  <strong>
                    {driftResult
                      ? driftResult.drift_detected
                        ? "YES"
                        : "NO"
                      : "—"}
                  </strong>
                </div>

                <div>
                  <span>
                    Candidate Accepted
                  </span>

                  <strong>
                    {candidateAccepted ===
                    undefined
                      ? "—"
                      : candidateAccepted
                        ? "YES"
                        : "NO"}
                  </strong>
                </div>

                <div>
                  <span>
                    Final Decision
                  </span>

                  <strong>
                    {decision}
                  </strong>
                </div>

                <div>
                  <span>
                    Final Action
                  </span>

                  <strong>
                    {action}
                  </strong>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default AIAgents;