import { useEffect, useMemo, useState } from "react";

import {

  BrainCircuit,

  TrendingUp,

  Activity,

  AlertTriangle,

  CheckCircle2,

  BarChart3,

  Search,

} from "lucide-react";



import Sidebar from "../components/Sidebar";

import Topbar from "../components/Topbar";

import "../App.css";



const WORKFLOW_STORAGE_KEYS = [

  "driftwatcher.workflowResult",

  "driftwatcher.latestWorkflowResult",

  "driftwatcher.workflow_result",

];



function readStoredWorkflowResult() {
  // The workflow result may be too large for localStorage. The AI Agents
  // page keeps the latest result in memory for same-tab React navigation.
  try {
    const memoryResult = window.__driftWatcherWorkflowResult;
    if (memoryResult && typeof memoryResult === "object") return memoryResult;
  } catch (error) {
    console.warn("Could not read the in-memory workflow result:", error);
  }

  for (const key of WORKFLOW_STORAGE_KEYS) {
    try {
      const value = localStorage.getItem(key);
      if (!value) continue;
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object") return parsed;
    } catch (error) {
      console.error(`Failed to read workflow result from ${key}:`, error);
    }
  }
  return null;
}

function getValue(object, keys, fallback = null) {

  if (!object || typeof object !== "object") return fallback;

  for (const key of keys) {

    if (object[key] !== null && object[key] !== undefined && object[key] !== "") {

      return object[key];

    }

  }

  return fallback;

}



function getRootCauseResult(result) {

  return getValue(result, ["root_cause", "rootCause", "root_cause_result"], null);

}



function getDriftResult(result) {

  return getValue(result, ["drift_detection", "driftDetection", "drift_detection_result"], null);

}



function toFiniteNumber(value) {

  if (value === null || value === undefined || value === "") return null;

  const number = Number(value);

  return Number.isFinite(number) ? number : null;

}



function formatNumber(value, digits = 4) {

  const number = toFiniteNumber(value);

  return number === null ? (value == null || value === "" ? "—" : String(value)) : number.toFixed(digits);

}



function formatChange(value) {

  if (value === null || value === undefined || value === "") return "—";

  if (typeof value === "string" && !Number.isFinite(Number(value))) return value;

  const number = Number(value);

  if (!Number.isFinite(number)) return String(value);

  const percentage = Math.abs(number) <= 1 ? number * 100 : number;

  return `${percentage >= 0 ? "+" : ""}${percentage.toFixed(1)}%`;

}



function getFeatureName(item) {

  return getValue(item, ["feature", "feature_name", "name", "column", "variable"], "Unknown feature");

}



function getEvidenceScore(item) {

  return toFiniteNumber(getValue(item, [

    "evidence_score", "change_score", "score", "statistical_change", "importance"

  ], null));

}



function getFeatureChange(item) {

  return getValue(item, [

    "change_percent", "percentage_change", "percent_change", "change_percentage",

    "relative_change", "drift_percentage"

  ], null);

}



function getFeatureLevel(item, score) {

  const explicit = getValue(item, ["level", "severity", "significance"], null);

  if (explicit) return String(explicit);

  if (score === null) return "Observed";

  const magnitude = Math.abs(score);

  if (magnitude >= 0.5) return "Significant";

  if (magnitude >= 0.2) return "Noticeable";

  if (magnitude >= 0.05) return "Moderate";

  return "Low";

}



function normalizeFeatureChanges(rootCause) {

  if (!rootCause || typeof rootCause !== "object") return [];

  const raw = getValue(rootCause, [

    "top_features", "top_contributing_features", "feature_changes", "changed_features", "features"

  ], []);

  if (!Array.isArray(raw)) return [];



  return raw.map((item, index) => {

    const source = item && typeof item === "object" ? item : { feature: String(item) };

    const score = getEvidenceScore(source);

    const before = getValue(source, ["reference_mean", "reference_value", "before_mean", "baseline_mean", "reference"], null);

    const after = getValue(source, ["current_mean", "current_value", "after_mean", "observed_mean", "current"], null);

    const suppliedChange = getFeatureChange(source);

    let changeLabel = suppliedChange !== null ? formatChange(suppliedChange) : "—";



    if (changeLabel === "—" && before !== null && after !== null) {

      const beforeNumber = toFiniteNumber(before);

      const afterNumber = toFiniteNumber(after);

      if (beforeNumber !== null && afterNumber !== null) {

        const delta = afterNumber - beforeNumber;

        changeLabel = `${delta >= 0 ? "+" : ""}${formatNumber(delta, 3)} (${formatNumber(beforeNumber, 3)} → ${formatNumber(afterNumber, 3)})`;

      }

    }



    return {

      id: `${getFeatureName(source)}-${index}`,

      feature: String(getFeatureName(source)),

      score,

      value: score === null ? "—" : formatNumber(score),

      change: changeLabel,

      level: getFeatureLevel(source, score),

      direction: getValue(source, ["direction", "change_direction", "trend"], null),

      before,

      after,

      raw: source,

    };

  }).sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));

}



function normalizeProbableCauses(rootCause, features) {

  if (!rootCause || typeof rootCause !== "object") return [];

  const raw = getValue(rootCause, [

    "probable_causes", "probableCauses", "probable_reasons", "causes"

  ], []);

  if (!Array.isArray(raw)) return [];



  return raw.map((item) => {

    if (typeof item === "string") return { text: item, feature: null, score: null };

    if (!item || typeof item !== "object") return null;

    const feature = getValue(item, ["feature", "feature_name", "name", "column"], null);

    const score = toFiniteNumber(getValue(item, ["evidence_score", "score", "change_score"], null));

    const text = getValue(item, ["cause", "reason", "description", "explanation", "text"], null);

    return text ? { text: String(text), feature, score } : null;

  }).filter(Boolean).map((cause) => {

    if (!cause.feature) {

      const match = features.find((feature) =>

        cause.text.toLowerCase().includes(feature.feature.toLowerCase())

      );

      if (match) return { ...cause, feature: match.feature, score: cause.score ?? match.score };

    }

    return cause;

  }).sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));

}



function getRootCauseExplanation(rootCause) {

  if (!rootCause || typeof rootCause !== "object") return "";

  const value = getValue(rootCause, [

    "ai_explanation", "aiExplanation", "explanation", "analysis", "reasoning", "message"

  ], "");

  return typeof value === "string" ? value : JSON.stringify(value, null, 2);

}



function getRootCauseStatus(rootCause) {

  const status = getValue(rootCause, ["status", "analysis_status"], null);

  return status ? String(status).replaceAll("_", " ").toUpperCase() : "COMPLETED";

}



function getAnalyzedFeatureCount(rootCause, features) {

  const analysis = rootCause?.analysis_results;

  if (analysis && typeof analysis === "object") {

    const numeric = Array.isArray(analysis.numerical_features) ? analysis.numerical_features : [];

    const categorical = Array.isArray(analysis.categorical_features) ? analysis.categorical_features : [];

    const count = numeric.length + categorical.length;

    if (count) return count;

  }

  const explicit = getValue(rootCause, [

    "features_analyzed", "features_analyzed_count", "feature_count", "analyzed_features"

  ], null);

  if (typeof explicit === "number") return explicit;

  if (Array.isArray(explicit)) return explicit.length;

  return features.length || "—";

}



function formatEvidenceValue(value, fallback) {

  if (value == null || value === "") return fallback;

  if (typeof value === "string") return value;

  if (typeof value === "object") {

    return getValue(value, ["label", "description", "period", "name", "path", "filename"], fallback);

  }

  return String(value);

}



function renderInlineMarkdown(value) {
  const parts = String(value ?? "").split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);

  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    return <span key={index}>{part}</span>;
  });
}

function StructuredAIExplanation({ explanation }) {
  const lines = String(explanation || "").replace(/\r\n?/g, "\n").split("\n");
  const sections = [];
  let current = { title: "Analysis Summary", items: [] };

  const flush = () => {
    if (current.items.length) sections.push(current);
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;

    const isBullet = /^[-*•]\s+/.test(line);
    const cleaned = line.replace(/^[-*•]\s+/, "");
    const heading = cleaned
      .replace(/^#{1,6}\s+/, "")
      .replace(/^\*\*(.*?)\*\*:?(\s*)$/, "$1")
      .replace(/:$/, "")
      .trim();
    const isHeading = !isBullet && (
      /^#{1,6}\s+/.test(line) ||
      /^\*\*.+\*\*:?$/.test(line) ||
      (/^[A-Z][A-Z0-9 &()/,-]{2,}:?$/.test(heading) && heading.length < 70)
    );

    if (isHeading) {
      flush();
      current = { title: heading, items: [] };
      return;
    }

    current.items.push({
      bullet: isBullet,
      text: cleaned.replace(/\*\*/g, "").replace(/\*/g, "").trim(),
    });
  });
  flush();

  if (!sections.length) {
    return <p style={{ margin: 0, lineHeight: 1.75, color: "#52627a" }}>{renderInlineMarkdown(explanation)}</p>;
  }

  return (
    <div className="rc-structured-explanation" style={{ display: "flex", flexDirection: "column", gap: 12, textAlign: "left", width: "100%" }}>
      {sections.map((section, index) => (
        <section key={`${section.title}-${index}`} style={{ padding: 14, border: "1px solid #e5eaf3", borderRadius: 12, background: "#fff", minWidth: 0 }}>
          <h4 style={{ margin: "0 0 10px", color: "#17345f", fontSize: 14 }}>{section.title}</h4>
          {section.items.some((item) => item.bullet) ? (
            <ul style={{ margin: 0, paddingLeft: 20, color: "#52627a" }}>
              {section.items.map((item, itemIndex) => (
                <li key={itemIndex} style={{ marginBottom: 8, fontSize: 13, lineHeight: 1.75, overflowWrap: "anywhere" }}>{renderInlineMarkdown(item.text)}</li>
              ))}
            </ul>
          ) : section.items.map((item, itemIndex) => (
            <p key={itemIndex} style={{ margin: itemIndex === section.items.length - 1 ? 0 : "0 0 9px", color: "#52627a", fontSize: 13, lineHeight: 1.75, overflowWrap: "anywhere" }}>{renderInlineMarkdown(item.text)}</p>
          ))}
        </section>
      ))}
    </div>
  );
}

function RootCause() {

  const [workflowResult, setWorkflowResult] = useState(null);

  const [loadError, setLoadError] = useState("");



  useEffect(() => {

    const loadResult = () => {

      try {

        setWorkflowResult(readStoredWorkflowResult());

        setLoadError("");

      } catch (error) {

        console.error("Failed to load workflow result:", error);

        setWorkflowResult(null);

        setLoadError("Unable to load the latest workflow result.");

      }

    };

    loadResult();

    const handleStorageChange = (event) => {

      if (event.key === null || WORKFLOW_STORAGE_KEYS.includes(event.key)) loadResult();

    };

    window.addEventListener("storage", handleStorageChange);

    // Same-tab workflow updates are delivered through this custom event.
    // The event detail is preferred; the global is the fallback for route navigation.
    const handleWorkflowResult = (event) => {
      const result = event?.detail || window.__driftWatcherWorkflowResult || null;
      if (result && typeof result === "object") {
        window.__driftWatcherWorkflowResult = result;
        setWorkflowResult(result);
        setLoadError("");
      } else {
        loadResult();
      }
    };

    window.addEventListener("driftwatcher:workflow-result", handleWorkflowResult);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("driftwatcher:workflow-result", handleWorkflowResult);
    };

  }, []);



  const rootCause = useMemo(() => getRootCauseResult(workflowResult), [workflowResult]);

  const driftResult = useMemo(() => getDriftResult(workflowResult), [workflowResult]);

  const featureChanges = useMemo(() => normalizeFeatureChanges(rootCause), [rootCause]);

  const probableCauses = useMemo(() => normalizeProbableCauses(rootCause, featureChanges), [rootCause, featureChanges]);

  const explanation = useMemo(() => getRootCauseExplanation(rootCause), [rootCause]);

  const analysisStatus = rootCause ? getRootCauseStatus(rootCause) : "WAITING";

  const featureCount = rootCause ? getAnalyzedFeatureCount(rootCause, featureChanges) : "—";

  const driftDetected = getValue(driftResult, ["drift_detected", "driftDetected"], null);

  const driftStatus = typeof driftDetected === "boolean"

    ? (driftDetected ? "DETECTED" : "NO DRIFT")

    : workflowResult ? "AVAILABLE" : "WAITING";



  const referenceEvidence = formatEvidenceValue(getValue(rootCause, [

    "reference_dataset", "reference_data", "reference_period", "reference_window"

  ], null), "Reference dataset");

  const currentEvidence = formatEvidenceValue(getValue(rootCause, [

    "current_dataset", "current_data", "current_period", "current_window"

  ], null), "Current dataset");



  const modelType = String(getValue(workflowResult, ["problem_type", "task_type", "model_type"], "") || "").toLowerCase();

  const isRegression = modelType.includes("regression");

  const sortedCauses = probableCauses;



  return (

    <div className="app-shell">

      <Sidebar />

      <main className="main-area">

        <Topbar title="Root Cause Analysis" />

        <section className="dashboard-content root-cause-page">

          <div className="page-heading root-cause-heading">

            <div className="page-heading-text">

              <h2>Root Cause Analysis</h2>

              <p>Identify the features whose data distributions changed and may be contributing to the detected drift.</p>

            </div>

            <div className={`summary-status ${rootCause ? "success" : ""}`}>

              {rootCause ? <CheckCircle2 size={16} /> : <Activity size={16} />}

              <span>{rootCause ? "Analysis Completed" : "Waiting for Workflow"}</span>

            </div>

          </div>



          <div className="rc-overview-grid">

            <div className="rc-overview-card"><div className="rc-overview-icon blue"><BrainCircuit size={22} /></div><div className="rc-overview-content"><span className="rc-overview-label">Analysis Status</span><strong className="rc-overview-value">{analysisStatus}</strong><small className="rc-overview-meta">Root Cause Agent</small></div></div>

            <div className="rc-overview-card"><div className="rc-overview-icon purple"><BarChart3 size={22} /></div><div className="rc-overview-content"><span className="rc-overview-label">Features Analyzed</span><strong className="rc-overview-value">{featureCount}</strong><small className="rc-overview-meta">Input features examined</small></div></div>

            <div className="rc-overview-card"><div className="rc-overview-icon orange"><TrendingUp size={22} /></div><div className="rc-overview-content"><span className="rc-overview-label">Top Features Identified</span><strong className="rc-overview-value">{featureChanges.length || "—"}</strong><small className="rc-overview-meta">Ranked by evidence score</small></div></div>

            <div className="rc-overview-card"><div className="rc-overview-icon green"><Activity size={22} /></div><div className="rc-overview-content"><span className="rc-overview-label">Drift Status</span><strong className="rc-overview-value">{driftStatus}</strong><small className="rc-overview-meta">Workflow result</small></div></div>

          </div>



          {loadError && <div className="rc-panel rc-full-panel"><div className="rc-ai-box"><div className="rc-ai-highlight"><div className="rc-ai-highlight-icon"><AlertTriangle size={19} /></div><p>{loadError}</p></div></div></div>}

          {!workflowResult && !loadError && <div className="rc-panel rc-full-panel"><div className="rc-ai-box"><div className="rc-ai-highlight"><div className="rc-ai-highlight-icon"><AlertTriangle size={19} /></div><p>No completed workflow result is available. Run the AI Workflow from the AI Agents page first.</p></div></div></div>}



          <div className="rc-analysis-grid">

            <div className="rc-panel">

              <div className="rc-panel-header"><div className="rc-panel-heading-text"><h3>Top Contributing Features</h3><p>Features are ordered from the highest to the lowest evidence score. A higher score indicates stronger statistical evidence of change, not proof of the cause.</p></div><div className="rc-panel-icon blue"><BarChart3 size={20} /></div></div>

              <div className="rc-feature-list">

                {featureChanges.length ? featureChanges.map((item, index) => (

                  <div className="rc-feature-row" key={item.id}>

                    <div className="rc-feature-main">

                      <strong className="rc-feature-name">{index + 1}. {item.feature}</strong>

                      <span className="rc-feature-evidence">Evidence score: <b>{item.value}</b></span>

                      {item.direction && <span className="rc-feature-evidence">Observed direction: <b>{String(item.direction).replaceAll("_", " ")}</b></span>}

                    </div>

                    <div className="rc-feature-result">

                      <strong className="rc-change-value">{item.change}</strong>

                      <span className={`rc-level rc-level-${item.level.toLowerCase().replace(/\s+/g, "-")}`}>{item.level}</span>

                    </div>

                  </div>

                )) : <div className="rc-feature-row"><div className="rc-feature-main"><strong className="rc-feature-name">No feature-level result available</strong><span className="rc-feature-evidence">The latest workflow did not return ranked feature evidence.</span></div></div>}

              </div>

            </div>



            <div className="rc-panel">

              <div className="rc-panel-header"><div className="rc-panel-heading-text"><h3>AI Explanation</h3><p>Interpretation of the observed feature-level evidence.</p></div><div className="rc-panel-icon purple"><BrainCircuit size={20} /></div></div>

              <div className="rc-ai-box">

                <div className="rc-ai-highlight"><div className="rc-ai-highlight-icon"><BrainCircuit size={19} /></div><p>{explanation ? "The explanation below is returned by the Root Cause Agent." : "No separate AI explanation was returned for this workflow."}</p></div>

                <div className="rc-ai-text">

                  {explanation ? <StructuredAIExplanation explanation={explanation} /> : <p>Feature rankings and statistical evidence are shown separately. No additional agent-generated interpretation is available.</p>}

                </div>

              </div>

            </div>

          </div>



          <div className="rc-panel rc-full-panel">

            <div className="rc-panel-header"><div className="rc-panel-heading-text"><h3>Probable Causes</h3><p>Potential contributors inferred from the available evidence. These are hypotheses for investigation, not confirmed real-world causes.</p></div><div className="rc-panel-icon orange"><Search size={20} /></div></div>

            <div className="rc-cause-grid">

              {sortedCauses.length ? sortedCauses.map((cause, index) => (

                <div className="rc-cause-item" key={`${cause.text}-${index}`}>

                  <div className="rc-cause-number">{index + 1}</div>

                  <div className="rc-cause-content">

                    <strong>{cause.feature ? `${cause.feature}: ` : ""}{cause.text}</strong>

                    <span>{cause.score !== null ? `Evidence score: ${formatNumber(cause.score)}. ` : ""}Suggested interpretation only; validate against the data collection and business context.</span>

                  </div>

                </div>

              )) : (

                <div className="rc-cause-item"><div className="rc-cause-number">—</div><div className="rc-cause-content"><strong>No probable causes were returned</strong><span>The page will not invent causes. Review the ranked feature evidence above.</span></div></div>

              )}

            </div>

          </div>



          <div className="rc-panel rc-full-panel">

            <div className="rc-panel-header"><div className="rc-panel-heading-text"><h3>Root Cause Evidence Summary</h3><p>Datasets and analysis categories used by the Root Cause Agent.</p></div><div className="rc-panel-icon green"><CheckCircle2 size={20} /></div></div>

            <div className="rc-evidence-grid">

              <div className="rc-evidence-item"><div className="rc-evidence-icon warning"><AlertTriangle size={18} /></div><div className="rc-evidence-content"><strong>Reference Dataset</strong><span>{referenceEvidence}</span></div></div>

              <div className="rc-evidence-item"><div className="rc-evidence-icon blue"><TrendingUp size={18} /></div><div className="rc-evidence-content"><strong>Current Dataset</strong><span>{currentEvidence}</span></div></div>

              <div className="rc-evidence-item"><div className="rc-evidence-icon purple"><BarChart3 size={18} /></div><div className="rc-evidence-content"><strong>Numerical Analysis</strong><span>Statistical changes in numerical features, when supplied by the workflow.</span></div></div>

              <div className="rc-evidence-item"><div className="rc-evidence-icon green"><Activity size={18} /></div><div className="rc-evidence-content"><strong>Categorical Analysis</strong><span>Distribution changes in categorical features, when supplied by the workflow.</span></div></div>

            </div>

            {isRegression && <p style={{ margin: "12px 0 0", color: "#64748b", fontSize: 12 }}>Regression task detected: this page explains input-feature distribution changes. It does not treat prediction residuals or target-value changes as feature causes unless the backend supplies that evidence.</p>}

          </div>

        </section>

      </main>

    </div>

  );

}



export default RootCause;
