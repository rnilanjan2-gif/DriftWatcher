import {
  AlertTriangle, CheckCircle2, Clock3, Info, Bell, ShieldAlert,
  RefreshCw, Server, Activity, ChevronRight, CircleAlert, Filter,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import "../App.css";

const STORAGE_KEYS = [
  "driftwatcher.workflowResult",
  "driftwatcher.latestWorkflowResult",
  "driftwatcher.workflow_result",
];

function getStoredWorkflowResult() {
  for (const key of STORAGE_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed;
    } catch (error) {
      console.error(`Failed to read ${key}:`, error);
    }
  }
  return null;
}

function getValue(object, keys, fallback = null) {
  if (!object || typeof object !== "object") return fallback;
  for (const key of keys) {
    if (object[key] !== undefined && object[key] !== null) return object[key];
  }
  return fallback;
}

function cleanText(value) {
  return String(value ?? "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/^\s*[-•]+\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value === null || value === undefined || value === "") return null;
  const normalized = String(value).replace(/%/g, "").replace(/,(?=\d{3}(\D|$))/g, "").trim();
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : null;
}

function formatMetric(label, raw) {
  const value = parseNumber(raw);
  if (value === null) return cleanText(raw);
  const key = label.toLowerCase().replace(/[^a-z0-9]/g, "");
  const percentKeys = ["accuracy", "precision", "recall", "f1", "f1score", "rocauc", "auc", "specificity", "balancedaccuracy"];
  if (percentKeys.includes(key)) return `${(value >= 0 && value <= 1 ? value * 100 : value).toFixed(2)}%`;
  if (["mae", "mse", "rmse", "r2", "r2score", "loss"].includes(key)) return value.toFixed(4);
  if (key.includes("error") || key.includes("count")) return Math.round(value).toLocaleString("en-IN");
  return cleanText(raw);
}

function getMetricSources(result) {
  const retraining = result?.retraining?.retraining_result || result?.retraining || {};
  return [
    result?.current_metrics, result?.model_performance, result?.metrics,
    result?.monitoring?.current_metrics, result?.monitoring?.metrics,
    result?.model_evaluation?.metrics, result?.evaluation?.metrics,
    result?.performance?.metrics, retraining?.current_metrics,
    retraining?.production_metrics, retraining?.current_model_metrics,
    retraining?.model_metrics, retraining?.metrics,
  ].filter((item) => item && typeof item === "object" && !Array.isArray(item));
}

function getMetricCards(result, predictionErrors = null) {
  const aliases = [
    ["Accuracy", ["accuracy", "accuracy_score"]], ["Precision", ["precision"]],
    ["Recall", ["recall"]], ["F1-score", ["f1", "f1_score", "f1-score"]],
    ["ROC-AUC", ["roc_auc", "rocauc", "auc"]], ["Specificity", ["specificity"]],
    ["Balanced Accuracy", ["balanced_accuracy"]], ["MAE", ["mae", "mean_absolute_error"]],
    ["MSE", ["mse", "mean_squared_error"]], ["RMSE", ["rmse", "root_mean_squared_error"]],
    ["R²", ["r2", "r2_score"]],
  ];
  const sources = getMetricSources(result);
  const cards = [];
  const normalize = (key) => key.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const [label, keys] of aliases) {
    let found;
    for (const source of sources) {
      const entry = Object.entries(source).find(([key, value]) =>
        keys.map(normalize).includes(normalize(key)) && parseNumber(value) !== null
      );
      if (entry) { found = entry[1]; break; }
    }
    if (found !== undefined) cards.push({ label, value: formatMetric(label, found) });
  }
  if (predictionErrors !== null) cards.push({ label: "Prediction errors", value: formatMetric("count", predictionErrors) });
  return cards;
}

function getPredictionErrors(result, drift) {
  const sources = [result?.monitoring, result?.data_stream, result?.stream_result, result?.streamResult, drift, result];
  const keys = ["total_prediction_errors", "totalPredictionErrors", "prediction_error_count", "predictionErrorCount", "prediction_errors_count", "predictionErrorsCount", "prediction_errors", "predictionErrors", "error_count", "errorCount"];
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    for (const key of keys) {
      const value = parseNumber(source[key]);
      if (value !== null && value >= 0) return Math.round(value);
    }
  }
  return null;
}

function getEventTime(result, fallback = null) {
  const candidates = [
    result?.workflow_completed_at, result?.workflowCompletedAt, result?.completed_at,
    result?.completedAt, result?.execution_time, result?.executionTime,
    result?.executed_at, result?.executedAt, result?.generated_at, result?.generatedAt,
    fallback?.completed_at, fallback?.completedAt, fallback?.executed_at,
  ];
  const value = candidates.find(Boolean);
  if (!value) return { date: "", time: "Recorded" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: "", time: "Recorded" };
  return {
    date: date.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }),
    time: date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
  };
}

function extractInterpretation(raw) {
  const text = cleanText(raw);
  const match = text.match(/INTERPRETATION\s*:\s*(.*?)(?=RECOMMENDED\s+NEXT\s+STEP\s*:|DETECTION\s+SOURCE\s*:|$)/i);
  if (match?.[1]) return cleanText(match[1]);
  return text
    .replace(/^(DRIFT\s+STATUS|DETECTORS|MODEL\s+PERFORMANCE)\s*:\s*/i, "")
    .replace(/RECOMMENDED\s+NEXT\s+STEP\s*:.*/i, "")
    .trim();
}

function getDetectorNames(drift) {
  const results = drift?.detector_results || drift?.detectorResults || {};
  const detected = Object.entries(results).filter(([, value]) =>
    value === true || String(value).toLowerCase() === "drift" || String(value).toLowerCase() === "drift_detected"
  ).map(([name]) => name.toLowerCase() === "pagehinkley" ? "Page-Hinkley" : name.toUpperCase());
  if (detected.length) return detected.join(" + ");
  const summary = drift?.detector_summary || {};
  const names = [];
  if (Number(summary.adwin_detections || 0) > 0) names.push("ADWIN");
  if (Number(summary.ddm_detections || 0) > 0) names.push("DDM");
  if (Number(summary.page_hinkley_detections || 0) > 0) names.push("Page-Hinkley");
  return names.length ? names.join(" + ") : "Drift detection";
}

function getQualityCounts(data) {
  const sources = [data, data?.quality_summary, data?.summary, data?.findings, data?.data_quality].filter(Boolean);
  const read = (keys) => {
    for (const source of sources) for (const key of keys) {
      const n = parseNumber(source?.[key]);
      if (n !== null && n >= 0) return n;
    }
    return 0;
  };
  return {
    missing: read(["missing_values", "missingValues"]),
    duplicates: read(["duplicate_records", "duplicateRecords", "duplicate_rows", "duplicateRows"]),
    infinite: read(["infinite_values", "infiniteValues"]),
    outliers: read(["potential_outliers", "potentialOutliers", "outliers"]),
    unseen: read(["unseen_categories", "unseenCategories"]),
  };
}

function findNestedText(value, depth = 0) {
  if (depth > 5 || value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map((item) => findNestedText(item, depth + 1)).join(" ");
  if (typeof value === "object") return Object.entries(value)
    .map(([key, item]) => `${key}: ${findNestedText(item, depth + 1)}`).join(" ");
  return "";
}

function getMetricValue(sources, aliases) {
  const normalize = (key) => key.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    for (const [key, value] of Object.entries(source)) {
      if (aliases.map(normalize).includes(normalize(key)) && parseNumber(value) !== null) {
        const number = parseNumber(value);
        return number >= 0 && number <= 1 ? number * 100 : number;
      }
    }
  }
  return null;
}

function getCandidateComparison(workflowResult, retraining, candidateMetrics) {
  const currentSources = getMetricSources(workflowResult);
  const candidateSources = [candidateMetrics, retraining?.candidate_model_metrics, retraining?.candidate_evaluation, retraining?.evaluation?.candidate_metrics].filter(Boolean);
  const currentRecall = getMetricValue(currentSources, ["recall", "recall_score"]);
  const candidateRecall = getMetricValue(candidateSources, ["recall", "recall_score"]);
  const delta = currentRecall !== null && candidateRecall !== null ? candidateRecall - currentRecall : null;
  return { currentRecall, candidateRecall, recallDelta: delta };
}

function getRecommendedSteps(alert) {
  if (alert.id === "drift") return [
    "Investigate the Page-Hinkley signal and compare recent data windows with the reference data.",
    "Check feature and target distribution changes; the current detector disagreement is not, by itself, proof of concept drift.",
    "Validate the current model on a recent labelled sample and review its confusion matrix before deciding on retraining.",
  ];
  if (alert.id === "data-quality") return [
    "Inspect the reported data-quality findings in the affected columns.",
    "Correct or handle missing, duplicate, infinite, or unseen values using the model's preprocessing rules.",
    "Run the data-quality checks again before using the data for retraining.",
  ];
  if (alert.id === "candidate-evaluation" && alert.decision === "rejected") return [
    "Retain the existing current model as the active model; do not deploy the rejected candidate.",
    "Review the candidate confusion matrix, especially false negatives, to investigate the recall reduction.",
    "Investigate the training data, model parameters, and decision threshold before training another candidate.",
    "Evaluate the next candidate against the same validation dataset and all configured acceptance criteria.",
  ];
  if (alert.id === "candidate-evaluation") return [
    "Review candidate metrics against the current model using the same evaluation dataset.",
    "Confirm the acceptance decision from the Decision Agent.",
    "Do not treat the candidate as the active model until deployment is confirmed.",
  ];
  if (alert.id === "retraining") return [
    "Review the training dataset, evaluation metrics, and retraining outcome.",
    "Compare the candidate with the currently active model using the configured acceptance rules.",
  ];
  if (alert.id === "deployment") return [
    "Verify the active model version in the model registry.",
    "Run a post-deployment health check and monitor predictions for unexpected changes.",
  ];
  return ["Review the workflow output and confirm the next action before proceeding."];
}

function renderDescription(alert) {
  const metricCards = alert.id === "drift" ? getMetricCards(alert.workflowResult, alert.predictionErrors) : [];
  return (
    <div className="alert-analysis-grid">
      <section className="alert-analysis-section" style={{ border: "1px solid #e2e8f0", borderLeft: "3px solid #475569", borderRadius: 10, padding: "12px 14px", background: "#fff", minWidth: 0 }}>
        <h5 style={{ margin: "0 0 7px", color: "#102a43", fontSize: 13, fontWeight: 700 }}>Interpretation</h5>
        <p style={{ margin: 0, color: "#64748b", fontSize: 12.5, lineHeight: 1.7, overflowWrap: "anywhere" }}>{alert.description}</p>
        {alert.decision === "rejected" && alert.comparison?.recallDelta !== null && alert.comparison?.recallDelta !== undefined && <div style={{ marginTop: 10, padding: "9px 10px", borderRadius: 8, background: "#fff7f7", border: "1px solid #fecaca", color: "#991b1b", fontSize: 12 }}><strong>Recall change:</strong> {alert.comparison.currentRecall.toFixed(2)}% → {alert.comparison.candidateRecall.toFixed(2)}% ({alert.comparison.recallDelta.toFixed(2)} percentage points)</div>}
        {alert.detector && <p style={{ margin: "8px 0 0", color: "#475569", fontSize: 11.5 }}><strong>Detection source:</strong> {alert.detector}</p>}
      </section>
      {metricCards.length > 0 && (
        <section className="alert-analysis-section" style={{ border: "1px solid #e2e8f0", borderLeft: "3px solid #0f766e", borderRadius: 10, padding: "12px 14px", background: "#fff", minWidth: 0 }}>
          <h5 style={{ margin: "0 0 9px", color: "#102a43", fontSize: 13, fontWeight: 700 }}>Current Model Metrics</h5>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(105px, 1fr))", gap: 8 }}>
            {metricCards.map((metric) => <div key={metric.label} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 10px", minWidth: 0 }}><div style={{ color: "#64748b", fontSize: 10, marginBottom: 4, fontWeight: 600 }}>{metric.label}</div><div style={{ color: "#102a43", fontSize: 13, fontWeight: 700, overflowWrap: "anywhere" }}>{metric.value}</div></div>)}
          </div>
          {alert.predictionErrors !== null && <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: 11 }}>Count only; an error rate is not shown because the evaluation denominator was not provided.</p>}
        </section>
      )}
      <section className="alert-analysis-section" style={{ border: "1px solid #e2e8f0", borderLeft: "3px solid #b45309", borderRadius: 10, padding: "12px 14px", background: "#fff", minWidth: 0 }}>
        <h5 style={{ margin: "0 0 9px", color: "#102a43", fontSize: 13, fontWeight: 700 }}>Recommended Next Steps</h5>
        <ol style={{ margin: 0, paddingLeft: 19, color: "#64748b", fontSize: 12.5, lineHeight: 1.8 }}>{getRecommendedSteps(alert).map((step, index) => <li key={index}>{step}</li>)}</ol>
      </section>
    </div>
  );
}

function Alerts() {
  const [filter, setFilter] = useState("All");
  const [workflowResult, setWorkflowResult] = useState(() =>
    typeof window !== "undefined" ? (window.__driftWatcherWorkflowResult || getStoredWorkflowResult()) : null
  );

  useEffect(() => {
    const load = () => setWorkflowResult(window.__driftWatcherWorkflowResult || getStoredWorkflowResult());
    const onWorkflow = (event) => setWorkflowResult(event?.detail || window.__driftWatcherWorkflowResult || getStoredWorkflowResult());
    const onStorage = (event) => { if (STORAGE_KEYS.includes(event.key) || event.key === null) load(); };
    load();
    window.addEventListener("driftwatcher:workflow-result", onWorkflow);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("driftwatcher:workflow-result", onWorkflow);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const alerts = useMemo(() => {
    if (!workflowResult) return [];
    const generated = [];
    const drift = workflowResult.drift_detection || null;
    const quality = workflowResult.data_quality || null;
    const retrainingWrapper = workflowResult.retraining || null;
    const retraining = retrainingWrapper?.retraining_result || retrainingWrapper || null;
    const decisionWrapper = workflowResult.decision || null;
    const decisionResult = decisionWrapper?.decision_result || decisionWrapper || null;
    const actionResult = workflowResult.action || null;
    const eventTime = getEventTime(workflowResult, drift);

    const driftDetected = Boolean(getValue(drift, ["drift_detected", "driftDetected"], false));
    if (driftDetected) {
      const detector = getDetectorNames(drift);
      const backendExplanation = getValue(drift, ["reasoning", "explanation", "message", "interpretation"], null);
      generated.push({
        id: "drift", icon: ShieldAlert, type: "Warning", title: "Drift Signal Detected",
        description: backendExplanation ? extractInterpretation(backendExplanation) : "One or more drift detectors raised a signal in the monitored data or prediction behaviour. This is an indication for investigation, not proof of confirmed concept drift.",
        time: eventTime.time, date: eventTime.date, source: "Drift Detection Agent", status: "Active", detector,
        workflowResult, predictionErrors: getPredictionErrors(workflowResult, drift),
      });
    }

    const qualityCounts = getQualityCounts(quality);
    const issueCount = Object.values(qualityCounts).reduce((sum, value) => sum + value, 0);
    const qualityFinding = String(getValue(quality, ["overall_status", "overallStatus", "quality_status", "qualityStatus", "state"], "")).toLowerCase();
    const qualityHasIssue = issueCount > 0 || ["issues_detected", "issue", "warning", "poor", "failed"].some((word) => qualityFinding.includes(word));
    if (qualityHasIssue) {
      const descriptions = [];
      if (qualityCounts.missing) descriptions.push(`${qualityCounts.missing} missing value(s)`);
      if (qualityCounts.duplicates) descriptions.push(`${qualityCounts.duplicates} duplicate record(s)`);
      if (qualityCounts.infinite) descriptions.push(`${qualityCounts.infinite} infinite value(s)`);
      if (qualityCounts.outliers) descriptions.push(`${qualityCounts.outliers} potential outlier(s)`);
      if (qualityCounts.unseen) descriptions.push(`${qualityCounts.unseen} unseen categor(ies)`);
      generated.push({
        id: "data-quality", icon: AlertTriangle, type: "Warning", title: "Data Quality Needs Review",
        description: descriptions.length ? `The data-quality results report ${descriptions.join(", ")}.` : "The Data Quality Agent reported a quality finding that needs review. The execution status is not being used as the quality result.",
        time: eventTime.time, date: eventTime.date, source: "Data Quality Agent", status: "Active", detector: "Data Quality Analysis",
      });
    }

    const decisionText = findNestedText(decisionResult).toLowerCase() + " " + findNestedText(retraining).toLowerCase() + " " + findNestedText(actionResult).toLowerCase();
    const candidateMetrics = getValue(retraining, ["candidate_metrics", "candidateMetrics", "candidate_model_metrics", "candidateModelMetrics"], getValue(retrainingWrapper, ["candidate_metrics", "candidateMetrics"], null));
    const candidateEntries = candidateMetrics && typeof candidateMetrics === "object" ? Object.entries(candidateMetrics).filter(([, value]) => parseNumber(value) !== null) : [];
    const rejected = /\breject(?:ed|ion)?\b|not[_\s-]*deploy|do[_\s-]*not[_\s-]*deploy|candidate[_\s-]*failed/.test(decisionText);
    const accepted = /\baccept(?:ed|ance)?\b/.test(decisionText) && !rejected;
    if (candidateEntries.length) {
      const metricText = candidateEntries.map(([key, value]) => `${key.replace(/_/g, " ")}: ${formatMetric(key, value)}`).join(" | ");
      const comparison = getCandidateComparison(workflowResult, retraining, candidateMetrics);
      const recallReason = comparison.recallDelta !== null && comparison.recallDelta < 0
        ? ` Recall decreased from ${comparison.currentRecall.toFixed(2)}% to ${comparison.candidateRecall.toFixed(2)}% (${comparison.recallDelta.toFixed(2)} percentage points), failing the configured recall acceptance criterion.`
        : " The candidate did not meet the reported acceptance decision.";
      const description = rejected
        ? `Candidate evaluation metrics: ${metricText}. ${recallReason} The Decision Agent rejected the candidate. The existing current model remains active, and this candidate was not deployed.`
        : accepted
          ? `Candidate evaluation metrics: ${metricText}. The Decision Agent reports acceptance. Verify the deployment result separately before considering this candidate active.`
          : `Candidate evaluation metrics: ${metricText}. The workflow response does not expose an explicit acceptance or rejection decision, so the candidate is shown as evaluated only.`;
      generated.push({
        id: "candidate-evaluation", icon: rejected ? AlertTriangle : Info, type: rejected ? "Warning" : "Info",
        title: `Candidate Model ${rejected ? "Rejected" : accepted ? "Accepted" : "Evaluated"}`,
        description,
        time: eventTime.time, date: eventTime.date, source: "Retraining / Decision Agents", status: rejected || accepted ? "Resolved" : "Active", detector: "Candidate Model Evaluation", decision: rejected ? "rejected" : accepted ? "accepted" : "evaluated",
        comparison,
      });
    }
    const retrainingStatus = String(getValue(retraining, ["status", "state", "retraining_status", "retrainingStatus"], getValue(retrainingWrapper, ["status", "state"], ""))).toLowerCase();
    const retrainingCompleted = ["success", "completed", "trained", "retraining_completed"].includes(retrainingStatus);
    if (retrainingCompleted) {
      generated.push({ id: "retraining", icon: RefreshCw, type: "Info", title: "Retraining Stage Completed", description: "The backend reports that candidate model training completed. Training completion does not mean the candidate was accepted or deployed; check the separate evaluation and deployment outcomes.", time: eventTime.time, date: eventTime.date, source: "Retraining Agent", status: "Resolved", detector: "Adaptive Retraining Workflow" });
    }

    const action = String(getValue(actionResult, ["action", "type"], "")).toUpperCase();
    const actionStatus = String(getValue(actionResult, ["status", "state", "deployment_status", "deploymentStatus"], "")).toLowerCase();
    const deploymentConfirmed = action === "MODEL_DEPLOYED" || action === "DEPLOYED" || actionStatus === "deployed" || actionStatus === "deployment_success";
    if (deploymentConfirmed) {
      generated.push({ id: "deployment", icon: Server, type: "Success", title: "Model Deployment Confirmed", description: "The action result explicitly reports a deployed state. Verify the active model version in the registry and perform a post-deployment health check.", time: eventTime.time, date: eventTime.date, source: "Deployment System", status: "Resolved", detector: "Action Engine" });
    }
    return generated;
  }, [workflowResult]);

  const filteredAlerts = useMemo(() => filter === "All" ? alerts : alerts.filter((alert) => alert.status === filter), [alerts, filter]);
  const activeCount = alerts.filter((a) => a.status === "Active").length;
  const resolvedCount = alerts.filter((a) => a.status === "Resolved").length;
  const criticalCount = alerts.filter((a) => a.type === "Critical").length;
  const warningCount = alerts.filter((a) => a.type === "Warning").length;
  const infoCount = alerts.filter((a) => a.type === "Info").length;
  const successCount = alerts.filter((a) => a.type === "Success").length;
  const getTypeIcon = (type) => {
    if (type === "Critical") return <CircleAlert size={15} />;
    if (type === "Warning") return <AlertTriangle size={15} />;
    if (type === "Success") return <CheckCircle2 size={15} />;
    return <Info size={15} />;
  };

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-area">
        <Topbar title="Alerts" />
        <section className="dashboard-content alerts-page">
          <div className="alerts-header">
            <div>
              <div className="alerts-eyebrow"><Activity size={15} /> DRIFTWATCHER EVENT CENTER</div>
              <h2>Alerts &amp; Notifications</h2>
              <p>Review drift signals, data quality findings, model evaluation and lifecycle events from the latest workflow run.</p>
            </div>
            <div className="alerts-monitoring-status">
              <span className="alerts-pulse" />
              <div><strong>{workflowResult ? "Latest Workflow Result" : "Awaiting Workflow"}</strong><small>{workflowResult ? "Events are based on the latest available workflow response" : "Run the AI workflow to populate alerts"}</small></div>
            </div>
          </div>

          <div className="alerts-summary-grid">
            <div className="alerts-summary-card"><div className="alerts-summary-top"><div className="alerts-summary-icon total"><Bell size={19} /></div><span className="alerts-summary-label">TOTAL EVENTS</span></div><div className="alerts-summary-number">{alerts.length}</div><div className="alerts-summary-footer"><span>Latest monitoring cycle</span><ChevronRight size={15} /></div></div>
            <div className="alerts-summary-card active-card"><div className="alerts-summary-top"><div className="alerts-summary-icon active"><AlertTriangle size={19} /></div><span className="alerts-summary-label">ACTIVE ALERTS</span></div><div className="alerts-summary-number">{activeCount}</div><div className="alerts-summary-footer warning-text"><span>Requires attention</span><span className="mini-status-dot" /></div></div>
            <div className="alerts-summary-card"><div className="alerts-summary-top"><div className="alerts-summary-icon critical"><ShieldAlert size={19} /></div><span className="alerts-summary-label">CRITICAL</span></div><div className="alerts-summary-number">{criticalCount}</div><div className="alerts-summary-footer"><span>High-priority events</span><ChevronRight size={15} /></div></div>
            <div className="alerts-summary-card"><div className="alerts-summary-top"><div className="alerts-summary-icon resolved"><CheckCircle2 size={19} /></div><span className="alerts-summary-label">RESOLVED</span></div><div className="alerts-summary-number">{resolvedCount}</div><div className="alerts-summary-footer success-text"><span>Completed or evaluated events</span><CheckCircle2 size={14} /></div></div>
          </div>

          <div className="alerts-main-grid">
            <div className="alerts-panel alerts-timeline-panel">
              <div className="alerts-panel-header"><div><div className="alerts-panel-title"><Bell size={18} /><h3>Event Timeline</h3></div><p>Events generated from the latest DriftWatcher workflow response</p></div><div className="alerts-live-badge"><span /> Latest Workflow</div></div>
              <div className="alerts-filter-bar"><div className="alerts-filter-label"><Filter size={14} /> Filter</div>{["All", "Active", "Resolved"].map((item) => <button key={item} className={`alerts-filter-btn ${filter === item ? "selected" : ""}`} onClick={() => setFilter(item)}>{item}</button>)}</div>
              <div className="alerts-timeline">
                {filteredAlerts.map((alert, index) => {
                  const Icon = alert.icon;
                  return <div className={`alert-timeline-item ${alert.type.toLowerCase()}`} key={alert.id}>
                    <div className="alert-timeline-rail"><div className="alert-timeline-dot"><Icon size={15} /></div>{index !== filteredAlerts.length - 1 && <div className="alert-timeline-line" />}</div>
                    <div className="alert-event-card">
                      <div className="alert-event-top"><div className="alert-event-heading"><h4>{alert.title}</h4><span className={`alert-severity ${alert.type.toLowerCase()}`}>{getTypeIcon(alert.type)}{alert.type}</span></div><span className={`alert-event-status ${alert.status.toLowerCase()}`}>{alert.status === "Active" ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}{alert.status}</span></div>
                      <div className="alert-event-description">{renderDescription(alert)}</div>
                      <div className="alert-event-meta"><span><Clock3 size={14} />{alert.time}{alert.date ? ` · ${alert.date}` : ""}</span><span><Info size={14} />{alert.source}</span><span className="alert-detector">{alert.detector}</span></div>
                    </div>
                  </div>;
                })}
                {filteredAlerts.length === 0 && <div className="alerts-empty-state"><CheckCircle2 size={32} /><h4>{workflowResult ? "No alerts found" : "No workflow data available"}</h4><p>{workflowResult ? "There are no events matching the selected filter for this workflow run." : "Run the monitoring workflow to view drift, data quality and model lifecycle events here."}</p></div>}
              </div>
            </div>

            <div className="alerts-side-column">
              <div className="alerts-panel severity-panel">
                <div className="alerts-panel-header compact"><div><div className="alerts-panel-title"><ShieldAlert size={17} /><h3>Severity Overview</h3></div><p>Current event distribution</p></div></div>
                <div className="severity-list">
                  {[{ label: "Critical", count: criticalCount, key: "critical" }, { label: "Warning", count: warningCount, key: "warning" }, { label: "Info", count: infoCount, key: "info" }, { label: "Success", count: successCount, key: "success" }].map((item) => <div key={item.key}><div className="severity-row"><div className="severity-row-left"><span className={`severity-dot ${item.key}`} /><span>{item.label}</span></div><strong>{item.count}</strong></div><div className="severity-progress"><span style={{ width: `${alerts.length ? (item.count / alerts.length) * 100 : 0}%` }} /></div></div>)}
                </div>
              </div>
              <div className="alerts-panel sources-panel">
                <div className="alerts-panel-header compact"><div><div className="alerts-panel-title"><Activity size={17} /><h3>Alert Sources</h3></div><p>Components represented in the workflow response</p></div></div>
                <div className="alert-source-list">
                  {[{ name: "Drift Detection", detail: "Drift Detection Agent", key: "drift_detection", cls: "drift", Icon: ShieldAlert }, { name: "Data Quality", detail: "Data Quality Agent", key: "data_quality", cls: "quality", Icon: AlertTriangle }, { name: "Retraining", detail: "Retraining Agent", key: "retraining", cls: "retraining", Icon: RefreshCw }, { name: "Deployment", detail: "Action / Deployment", key: "action", cls: "deployment", Icon: Server }].map((source) => {
                    const present = Boolean(workflowResult?.[source.key]);
                    const Icon = source.Icon;
                    return <div className="alert-source-item" key={source.key}><div className={`source-icon ${source.cls}`}><Icon size={16} /></div><div><strong>{source.name}</strong><span>{source.detail}</span></div><span className="source-active">{present ? "Result available" : "Not run / no result"}</span></div>;
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="alerts-policy-panel">
            <div className="alerts-policy-heading"><div className="alerts-policy-icon"><Bell size={18} /></div><div><h3>Notification Guidance</h3><p>How DriftWatcher presents workflow findings</p></div></div>
            <div className="alerts-policy-items">
              <div className="policy-item"><span className="policy-indicator critical" /><div><strong>Critical</strong><span>Use only for explicitly reported high-severity conditions</span></div></div>
              <div className="policy-item"><span className="policy-indicator warning" /><div><strong>Warning</strong><span>Drift signals or data-quality findings that need investigation</span></div></div>
              <div className="policy-item"><span className="policy-indicator info" /><div><strong>Info</strong><span>Candidate evaluation and retraining-stage updates</span></div></div>
              <div className="policy-item"><span className="policy-indicator success" /><div><strong>Success</strong><span>Show only when a successful outcome is explicitly confirmed</span></div></div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default Alerts;
