import { useEffect, useMemo, useState } from "react";
import api from "../services/api";

import {

  RefreshCw,

  BrainCircuit,

  CheckCircle2,

  TrendingUp,

  TrendingDown,

  Minus,

  BarChart3,

  Clock3,

  Database,

  ShieldCheck,

  ArrowUpRight,

  AlertTriangle,
  Download,

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

  for (const key of WORKFLOW_STORAGE_KEYS) {

    try {

      const value = localStorage.getItem(key);

      if (!value) {

        continue;

      }

      const parsed = JSON.parse(value);

      if (parsed && typeof parsed === "object") {

        return parsed;

      }

    } catch (error) {

      console.error(

        `Failed to read DriftWatcher workflow result from ${key}:`,

        error

      );

    }

  }

  return null;

}



function getValue(object, keys, fallback = null) {

  if (!object || typeof object !== "object") {

    return fallback;

  }



  for (const key of keys) {

    if (

      Object.prototype.hasOwnProperty.call(object, key) &&

      object[key] !== null &&

      object[key] !== undefined

    ) {

      return object[key];

    }

  }



  return fallback;

}



function formatNumber(value, digits = 2) {

  if (value === null || value === undefined || value === "") {

    return "—";

  }



  const number = Number(value);



  if (!Number.isFinite(number)) {

    return String(value);

  }



  return number.toLocaleString(undefined, {

    minimumFractionDigits: digits,

    maximumFractionDigits: digits,

  });

}



function formatMetric(value) {

  if (value === null || value === undefined || value === "") {

    return "—";

  }



  const number = Number(value);



  if (!Number.isFinite(number)) {

    return String(value);

  }



  return `${(number * 100).toFixed(2)}%`;

}



function formatPercentageChange(value) {

  if (value === null || value === undefined || value === "") {

    return "—";

  }



  const number = Number(value);



  if (!Number.isFinite(number)) {

    return String(value);

  }



  const percentage = Math.abs(number) <= 1 ? number * 100 : number;



  return `${percentage >= 0 ? "+" : ""}${percentage.toFixed(2)}%`;

}



function formatText(value, fallback = "—") {

  if (value === null || value === undefined || value === "") {

    return fallback;

  }



  if (typeof value === "string") {

    return value;

  }



  if (typeof value === "number") {

    return String(value);

  }



  try {

    return JSON.stringify(value);

  } catch {

    return String(value);

  }

}



function getRetrainingResult(workflowResult) {

  if (!workflowResult || typeof workflowResult !== "object") {

    return null;

  }



  const wrapper =

    workflowResult.retraining ||

    workflowResult.retrainingResult ||

    workflowResult.retraining_result ||

    null;



  if (!wrapper) {

    return null;

  }



  return (

    wrapper.retraining_result ||

    wrapper.retrainingResult ||

    wrapper

  );

}



function getRetrainingWrapper(workflowResult) {

  if (!workflowResult || typeof workflowResult !== "object") {

    return null;

  }



  return (

    workflowResult.retraining ||

    workflowResult.retrainingResult ||

    workflowResult.retraining_result ||

    null

  );

}



function getCandidateModelFilename(retrainingResult) {
  const candidatePath = getValue(
    retrainingResult,
    ["candidate_model_path", "candidateModelPath"],
    null
  );

  if (typeof candidatePath !== "string" || !candidatePath.trim()) {
    return null;
  }

  // Only the filename is sent to the backend, never a local filesystem path.
  const filename = candidatePath.trim().split(/[\\\\/]/).pop();
  return filename && filename.toLowerCase().endsWith(".joblib")
    ? filename
    : null;
}

function getDecisionResult(workflowResult) {

  if (!workflowResult || typeof workflowResult !== "object") {

    return null;

  }



  const wrapper =

    workflowResult.decision ||

    workflowResult.decisionResult ||

    workflowResult.decision_result ||

    null;



  if (!wrapper) {

    return null;

  }



  return (

    wrapper.decision_result ||

    wrapper.decisionResult ||

    wrapper

  );

}



function getDriftResult(workflowResult) {

  if (!workflowResult || typeof workflowResult !== "object") {

    return null;

  }



  return (

    workflowResult.drift_detection ||

    workflowResult.driftDetection ||

    workflowResult.drift_detection_result ||

    null

  );

}



function getComparison(retrainingResult) {

  if (!retrainingResult || typeof retrainingResult !== "object") {

    return {};

  }



  return (

    retrainingResult.comparison ||

    retrainingResult.model_comparison ||

    retrainingResult.evaluation_comparison ||

    {}

  );

}



function normalizeMetricObject(metrics = {}) {

  if (!metrics || typeof metrics !== "object") {

    return {};

  }



  const normalized = { ...metrics };



  const aliases = {

    accuracy: ["accuracy", "accuracy_score", "acc"],

    precision: ["precision", "precision_score", "prec"],

    recall: ["recall", "recall_score", "sensitivity"],

    f1_score: ["f1_score", "f1", "f1score", "f1Score"],

    mae: ["mae", "mean_absolute_error"],

    mse: ["mse", "mean_squared_error"],

    rmse: ["rmse", "root_mean_squared_error"],

    r2: ["r2", "r2_score", "r_squared"],

  };



  for (const [canonicalKey, possibleKeys] of Object.entries(aliases)) {

    if (

      normalized[canonicalKey] !== null &&

      normalized[canonicalKey] !== undefined

    ) {

      continue;

    }



    for (const key of possibleKeys) {

      if (

        metrics[key] !== null &&

        metrics[key] !== undefined

      ) {

        normalized[canonicalKey] = metrics[key];

        break;

      }

    }

  }



  return normalized;

}



const METRIC_DEFINITIONS = {

  accuracy: {

    key: "accuracy",

    label: "Accuracy",

    higherIsBetter: true,

    format: "percentage",

  },



  precision: {

    key: "precision",

    label: "Precision",

    higherIsBetter: true,

    format: "percentage",

  },



  recall: {

    key: "recall",

    label: "Recall",

    higherIsBetter: true,

    format: "percentage",

  },



  f1_score: {

    key: "f1_score",

    label: "F1 Score",

    higherIsBetter: true,

    format: "percentage",

  },



  r2: {

    key: "r2",

    label: "R²",

    higherIsBetter: true,

    format: "decimal",

  },



  mae: {

    key: "mae",

    label: "MAE",

    higherIsBetter: false,

    format: "number",

  },



  mse: {

    key: "mse",

    label: "MSE",

    higherIsBetter: false,

    format: "number",

  },



  rmse: {

    key: "rmse",

    label: "RMSE",

    higherIsBetter: false,

    format: "number",

  },

};



const METRIC_ORDER = [

  "accuracy",

  "precision",

  "recall",

  "f1_score",

  "r2",

  "mae",

  "mse",

  "rmse",

];



function getPrimaryMetricKey(

  workflowResult,

  retrainingResult,

  comparison,

  currentMetrics,

  candidateMetrics

) {

  const explicitValues = [

    getValue(

      comparison,

      [

        "primary_metric",

        "primaryMetric",

        "primary_metric_name",

        "primaryMetricName",

        "metric",

        "metric_name",

        "metricName",

        "acceptance_metric",

        "acceptanceMetric",

        "objective_metric",

        "objectiveMetric",

      ],

      null

    ),



    getValue(

      retrainingResult,

      [

        "primary_metric",

        "primaryMetric",

        "primary_metric_name",

        "primaryMetricName",

        "metric",

        "metric_name",

        "metricName",

      ],

      null

    ),



    getValue(

      workflowResult,

      [

        "primary_metric",

        "primaryMetric",

        "primary_metric_name",

        "primaryMetricName",

        "metric",

        "metric_name",

        "metricName",

      ],

      null

    ),

  ];



  const aliases = {

    f1: "f1_score",

    f1score: "f1_score",

    f1_score: "f1_score",

    accuracy_score: "accuracy",

    precision_score: "precision",

    recall_score: "recall",

    mean_absolute_error: "mae",

    mean_squared_error: "mse",

    root_mean_squared_error: "rmse",

    r2_score: "r2",

    r_squared: "r2",

  };



  for (const value of explicitValues) {

    if (value === null || value === undefined) {

      continue;

    }



    const normalized = String(value)

      .trim()

      .toLowerCase()

      .replace(/[-\s]/g, "_");



    const key = aliases[normalized] || normalized;



    if (

      currentMetrics?.[key] !== undefined ||

      candidateMetrics?.[key] !== undefined

    ) {

      return key;

    }

  }



  const available = new Set([

    ...Object.keys(currentMetrics || {}),

    ...Object.keys(candidateMetrics || {}),

  ]);



  const hasClassificationMetrics = ["f1_score", "accuracy", "precision", "recall"].some((key) => available.has(key));
  const fallbackOrder = hasClassificationMetrics
    ? ["f1_score", "accuracy", "precision", "recall"]
    : ["r2", "rmse", "mae", "mse"];

  return fallbackOrder.find((key) => available.has(key)) || null;

}



function getMetricDefinitions(currentMetrics, candidateMetrics) {

  const available = new Set([

    ...Object.keys(currentMetrics || {}),

    ...Object.keys(candidateMetrics || {}),

  ]);



  const knownMetrics = METRIC_ORDER

    .filter((key) => available.has(key))

    .map((key) => METRIC_DEFINITIONS[key]);



  if (knownMetrics.length > 0) {

    return knownMetrics;

  }



  return Array.from(available)

    .filter((key) => {

      const current = Number(currentMetrics?.[key]);

      const candidate = Number(candidateMetrics?.[key]);



      return (

        Number.isFinite(current) ||

        Number.isFinite(candidate)

      );

    })

    .map((key) => ({

      key,

      label: key

        .replace(/_/g, " ")

        .replace(/\b\w/g, (char) => char.toUpperCase()),

      higherIsBetter: null,

      format: "number",

    }));

}



function formatDynamicMetric(value, metricDefinition) {

  if (value === null || value === undefined || value === "") {

    return "—";

  }



  const number = Number(value);



  if (!Number.isFinite(number)) {

    return String(value);

  }



  if (metricDefinition?.format === "percentage") {

    const percentage =

      Math.abs(number) <= 1

        ? number * 100

        : number;



    return `${percentage.toFixed(2)}%`;

  }



  if (metricDefinition?.format === "decimal") {

    return number.toFixed(4);

  }



  // Keep large regression values compact so they fit cleanly in the table.

  const absolute = Math.abs(number);



  if (absolute >= 1_000_000_000) {

    return `${(number / 1_000_000_000).toFixed(2)}B`;

  }



  if (absolute >= 1_000_000) {

    return `${(number / 1_000_000).toFixed(2)}M`;

  }



  if (absolute >= 1_000) {

    return `${(number / 1_000).toFixed(2)}K`;

  }



  return number.toLocaleString(undefined, {

    minimumFractionDigits: 2,

    maximumFractionDigits: 4,

  });

}

function getAcceptanceMargin(

  comparison,

  retrainingResult,

  primaryMetricKey

) {

  if (!primaryMetricKey) {

    return null;

  }



  return getValue(

    comparison,

    [

      "acceptance_margin",

      "acceptanceMargin",

      `${primaryMetricKey}_acceptance_margin`,

      `${primaryMetricKey}AcceptanceMargin`,

      "minimum_improvement",

      "minimum_metric_improvement",

    ],

    getValue(

      retrainingResult,

      [

        "acceptance_margin",

        "acceptanceMargin",

        `${primaryMetricKey}_acceptance_margin`,

        `${primaryMetricKey}AcceptanceMargin`,

        "minimum_improvement",

        "minimum_metric_improvement",

      ],

      null

    )

  );

}



function getMetricDisplayText(

  value,

  metricDefinition

) {

  return formatDynamicMetric(

    value,

    metricDefinition

  );

}



function getMetricsObject(workflowResult, retrainingResult, comparison) {
  const firstObject = (...values) => values.find(
    (value) => value && typeof value === "object" && !Array.isArray(value)
  ) || {};

  const currentMetrics = normalizeMetricObject(firstObject(
    workflowResult?.current_metrics,
    workflowResult?.currentMetrics,
    retrainingResult?.current_metrics,
    retrainingResult?.currentMetrics,
    comparison?.current_metrics,
    comparison?.currentMetrics,
    retrainingResult?.evaluation?.current_metrics,
    retrainingResult?.evaluation?.currentMetrics
  ));

  const candidateMetrics = normalizeMetricObject(firstObject(
    retrainingResult?.candidate_metrics,
    retrainingResult?.candidateMetrics,
    comparison?.candidate_metrics,
    comparison?.candidateMetrics,
    retrainingResult?.evaluation?.candidate_metrics,
    retrainingResult?.evaluation?.candidateMetrics
  ));

  const metricComparison = firstObject(
    comparison?.metric_comparison,
    comparison?.metricComparison,
    retrainingResult?.metric_comparison,
    retrainingResult?.metricComparison
  );

  for (const [rawKey, details] of Object.entries(metricComparison)) {
    if (!details || typeof details !== "object") continue;
    const normalized = normalizeMetricObject({ [rawKey]: 0 });
    const canonicalKey = Object.keys(normalized).find((key) => key !== rawKey) || rawKey;
    const oldValue = getValue(details, ["current", "current_value", "currentValue", "baseline"], null);
    const newValue = getValue(details, ["candidate", "candidate_value", "candidateValue", "new_value", "newValue"], null);
    if (currentMetrics[canonicalKey] === undefined && oldValue !== null) currentMetrics[canonicalKey] = oldValue;
    if (candidateMetrics[canonicalKey] === undefined && newValue !== null) candidateMetrics[canonicalKey] = newValue;
  }

  const primaryRaw = getValue(comparison, ["primary_metric", "primaryMetric", "metric"], null);
  if (primaryRaw) {
    const normalizedPrimary = String(primaryRaw).trim().toLowerCase().replace(/[-\s]/g, "_");
    const aliases = {
      f1: "f1_score", f1score: "f1_score", r2_score: "r2",
      r_squared: "r2", accuracy_score: "accuracy",
      precision_score: "precision", recall_score: "recall",
      mean_absolute_error: "mae", mean_squared_error: "mse",
      root_mean_squared_error: "rmse"
    };
    const key = aliases[normalizedPrimary] || normalizedPrimary;
    const oldScore = getValue(comparison, ["current_score", "currentScore"], null);
    const newScore = getValue(comparison, ["candidate_score", "candidateScore"], null);
    if (currentMetrics[key] === undefined && oldScore !== null) currentMetrics[key] = oldScore;
    if (candidateMetrics[key] === undefined && newScore !== null) candidateMetrics[key] = newScore;
  }

  const currentF1 = getValue(comparison, ["current_f1", "current_f1_score", "currentF1", "currentF1Score"], null);
  const candidateF1 = getValue(comparison, ["candidate_f1", "candidate_f1_score", "candidateF1", "candidateF1Score"], null);
  if (currentMetrics.f1_score == null && currentF1 !== null) currentMetrics.f1_score = currentF1;
  if (candidateMetrics.f1_score == null && candidateF1 !== null) candidateMetrics.f1_score = candidateF1;

  return { currentMetrics, candidateMetrics };
}

function formatMetricChange(

  value,

  metricDefinition

) {

  if (

    value === null ||

    value === undefined ||

    value === ""

  ) {

    return "—";

  }



  const number = Number(value);



  if (!Number.isFinite(number)) {

    return String(value);

  }



  if (

    metricDefinition?.format === "percentage"

  ) {

    return formatPercentageChange(number);

  }



  const absolute = Math.abs(number);

  const sign = number >= 0 ? "+" : "";



  if (absolute >= 1_000_000_000) {

    return `${sign}${(number / 1_000_000_000).toFixed(2)}B`;

  }



  if (absolute >= 1_000_000) {

    return `${sign}${(number / 1_000_000).toFixed(2)}M`;

  }



  if (absolute >= 1_000) {

    return `${sign}${(number / 1_000).toFixed(2)}K`;

  }



  return `${sign}${number.toLocaleString(undefined, {

    minimumFractionDigits: 2,

    maximumFractionDigits: 4,

  })}`;

}

function getImprovement(

  comparison,

  currentMetrics,

  candidateMetrics,

  metricDefinition

) {

  const metricKey = metricDefinition.key;



  const higherIsBetter =

    metricDefinition.higherIsBetter !== false;



  const directImprovement = getValue(

    comparison,

    [

      `${metricKey}_improvement`,

      `${metricKey}Improvement`,

    ],

    null

  );



  if (directImprovement !== null) {

    return formatMetricChange(

      directImprovement,

      metricDefinition

    );

  }



  const directChange = getValue(

    comparison,

    [

      `${metricKey}_change`,

      `${metricKey}Change`,

    ],

    null

  );



  if (directChange !== null) {

    const numericChange = Number(directChange);



    if (Number.isFinite(numericChange)) {

      return formatMetricChange(

        higherIsBetter

          ? numericChange

          : -numericChange,

        metricDefinition

      );

    }



    return formatMetricChange(

      directChange,

      metricDefinition

    );

  }



  const current = Number(

    currentMetrics?.[metricKey]

  );



  const candidate = Number(

    candidateMetrics?.[metricKey]

  );



  if (

    Number.isFinite(current) &&

    Number.isFinite(candidate)

  ) {

    const improvement = higherIsBetter

      ? candidate - current

      : current - candidate;



    return formatMetricChange(

      improvement,

      metricDefinition

    );

  }



  return "—";

}



function getCandidateAccepted(

  comparison,

  retrainingResult

) {

  const value = getValue(

    comparison,

    [

      "candidate_accepted",

      "candidateAccepted",

      "accepted",

      "is_accepted",

      "isAccepted",

    ],

    null

  );



  if (typeof value === "boolean") {

    return value;

  }



  const resultValue = getValue(

    retrainingResult,

    [

      "candidate_accepted",

      "candidateAccepted",

      "accepted",

      "is_accepted",

      "isAccepted",

    ],

    null

  );



  return typeof resultValue === "boolean"

    ? resultValue

    : null;

}



function getReasoning(

  retrainingResult,

  comparison

) {

  const reasoning = getValue(

    retrainingResult,

    [

      "reasoning",

      "explanation",

      "analysis",

      "message",

      "decision_reason",

      "decisionReason",

    ],

    null

  );



  if (reasoning) {

    return String(reasoning);

  }



  const comparisonReason = getValue(

    comparison,

    [

      "reasoning",

      "explanation",

      "message",

      "acceptance_reason",

      "acceptanceReason",

    ],

    null

  );



  return comparisonReason

    ? String(comparisonReason)

    : "";

}



function getRejectionExplanation(
  comparison,
  currentMetrics,
  candidateMetrics,
  candidateAccepted,
  problemType
) {
  if (candidateAccepted !== false) return "";

  const task = String(
    problemType || comparison?.problem_type || ""
  ).trim().toLowerCase();
  const isClassification = task === "classification" || (
    currentMetrics?.recall !== undefined && candidateMetrics?.recall !== undefined
  );
  const isRegression = task === "regression" || (
    (currentMetrics?.r2 !== undefined || currentMetrics?.r2_score !== undefined) &&
    (candidateMetrics?.r2 !== undefined || candidateMetrics?.r2_score !== undefined)
  );

  const metricValue = (metrics, key) => {
    const aliases = {
      r2: ["r2", "r2_score", "r_squared"],
      f1_score: ["f1_score", "f1"],
      accuracy: ["accuracy", "accuracy_score"],
      precision: ["precision", "precision_score"],
      recall: ["recall", "recall_score"],
      mae: ["mae", "mean_absolute_error"],
      mse: ["mse", "mean_squared_error"],
      rmse: ["rmse", "root_mean_squared_error"],
    };
    for (const alias of aliases[key] || [key]) {
      if (metrics?.[alias] !== undefined && metrics?.[alias] !== null && metrics?.[alias] !== "") {
        const n = Number(metrics[alias]);
        if (Number.isFinite(n)) return n;
      }
    }
    return null;
  };

  const fmt = (value, digits = 4) => {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
    return Number(value).toLocaleString(undefined, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  };

  const lines = ["Candidate rejected: the candidate model did not meet the configured acceptance criteria."];

  if (isRegression) {
    const oldR2 = metricValue(currentMetrics, "r2");
    const newR2 = metricValue(candidateMetrics, "r2");
    const margin = Number(getValue(comparison, ["acceptance_margin", "acceptanceMargin"], 0.01));

    if (oldR2 !== null && newR2 !== null) {
      const delta = newR2 - oldR2;
      lines.push(`R²: ${fmt(oldR2)} → ${fmt(newR2)} (change: ${delta >= 0 ? "+" : ""}${fmt(delta)}; required improvement: +${fmt(margin)}).`);
    }

    for (const key of ["mae", "mse", "rmse"]) {
      const oldValue = metricValue(currentMetrics, key);
      const newValue = metricValue(candidateMetrics, key);
      if (oldValue === null || newValue === null) continue;
      const change = newValue - oldValue;
      const label = key.toUpperCase();
      const digits = key === "mse" ? 2 : 2;
      const direction = change > 0 ? "increased" : change < 0 ? "decreased" : "did not change";
      const quality = change > 0 ? "worse" : change < 0 ? "better" : "unchanged";
      lines.push(`${label}: ${fmt(oldValue, digits)} → ${fmt(newValue, digits)} (${direction}; ${quality}, because lower is better).`);
    }
  } else if (isClassification) {
    const oldF1 = metricValue(currentMetrics, "f1_score");
    const newF1 = metricValue(candidateMetrics, "f1_score");
    const margin = Number(getValue(comparison, ["acceptance_margin", "acceptanceMargin"], 0.01));
    if (oldF1 !== null && newF1 !== null) {
      const delta = newF1 - oldF1;
      lines.push(`F1-score: ${fmt(oldF1)} → ${fmt(newF1)} (change: ${delta >= 0 ? "+" : ""}${fmt(delta)}; required improvement: +${fmt(margin)}).`);
    }

    const oldRecall = metricValue(currentMetrics, "recall");
    const newRecall = metricValue(candidateMetrics, "recall");
    if (oldRecall !== null && newRecall !== null) {
      const delta = newRecall - oldRecall;
      lines.push(`Recall: ${fmt(oldRecall)} → ${fmt(newRecall)} (change: ${delta >= 0 ? "+" : ""}${fmt(delta)}).`);
      if (delta < 0) lines.push("Recall decreased; the configured recall safety rule prevents deployment of this candidate.");
    }
  } else {
    const backendReason = getValue(
      comparison,
      ["reason", "rejection_reason", "rejectionReason", "acceptance_reason", "acceptanceReason", "explanation", "message"],
      null
    );
    if (backendReason && typeof backendReason === "string") lines.push(backendReason);
  }

  lines.push("Decision: keep the current production model deployed.");
  return lines.join("\n");
}


function getStatus(

  workflowResult,

  retrainingWrapper,

  retrainingResult

) {

  if (!workflowResult) {

    return "WAITING";

  }



  const status = getValue(

    retrainingWrapper,

    ["status", "state"],

    null

  );



  if (status) {

    return String(status).toUpperCase();

  }



  const resultStatus = getValue(

    retrainingResult,

    ["status", "state"],

    null

  );



  if (resultStatus) {

    return String(resultStatus).toUpperCase();

  }



  return "COMPLETED";

}



function getSampleCount(

  object,

  keys

) {

  const value = getValue(

    object,

    keys,

    null

  );



  if (value === null) {

    return "—";

  }



  return formatNumber(

    value,

    0

  );

}



function getFeatureCount(

  retrainingResult,

  candidateMetrics

) {

  const trainingFeatures = getValue(

    retrainingResult,

    ["training_features"],

    null

  );



  if (trainingFeatures !== null) {

    return formatNumber(

      trainingFeatures,

      0

    );

  }



  const direct = getValue(

    retrainingResult,

    [

      "feature_count",

      "features",

      "n_features",

      "number_of_features",

      "num_features",

    ],

    null

  );



  if (typeof direct === "number") {

    return formatNumber(

      direct,

      0

    );

  }



  if (Array.isArray(direct)) {

    return formatNumber(

      direct.length,

      0

    );

  }



  const metricFeatureCount =

    getValue(

      candidateMetrics,

      [

        "feature_count",

        "n_features",

        "number_of_features",

      ],

      null

    );



  if (metricFeatureCount !== null) {

    return formatNumber(

      metricFeatureCount,

      0

    );

  }



  return "—";

}



function Retraining() {

  const [candidateDownloadState, setCandidateDownloadState] = useState({
    loading: false,
    error: "",
  });

  const [

    workflowResult,

    setWorkflowResult,

  ] = useState(

    () =>

      window.__driftWatcherWorkflowResult ||

      readStoredWorkflowResult()

  );



  const [

    loadError,

    setLoadError,

  ] = useState("");



  useEffect(() => {

    const loadResult = () => {

      try {

        const result =

          window.__driftWatcherWorkflowResult ||

          readStoredWorkflowResult();



        setWorkflowResult(result);

        setLoadError("");

      } catch (error) {

        console.error(

          "Failed to load DriftWatcher workflow result:",

          error

        );



        setWorkflowResult(null);



        setLoadError(

          "Unable to load the latest workflow result."

        );

      }

    };



    loadResult();



    const handleWorkflowResult = (

      event

    ) => {

      const result =

        event?.detail ||

        window.__driftWatcherWorkflowResult ||

        readStoredWorkflowResult();



      setWorkflowResult(

        result || null

      );



      setLoadError("");

    };



    const handleStorageChange = (

      event

    ) => {

      if (

        WORKFLOW_STORAGE_KEYS.includes(

          event.key

        ) ||

        event.key === null

      ) {

        loadResult();

      }

    };



    window.addEventListener(
      "driftwatcher:workflow-result",
      handleWorkflowResult
    );

    window.addEventListener(
      "driftwatcher:workflow-updated",
      handleWorkflowResult
    );



    window.addEventListener(

      "storage",

      handleStorageChange

    );



    return () => {

      window.removeEventListener(
        "driftwatcher:workflow-result",
        handleWorkflowResult
      );

      window.removeEventListener(
        "driftwatcher:workflow-updated",
        handleWorkflowResult
      );



      window.removeEventListener(

        "storage",

        handleStorageChange

      );

    };

  }, []);



  const retrainingWrapper =

    useMemo(

      () =>

        getRetrainingWrapper(

          workflowResult

        ),

      [workflowResult]

    );



  const retrainingResult =

    useMemo(

      () =>

        getRetrainingResult(

          workflowResult

        ),

      [workflowResult]

    );



  const comparison =

    useMemo(

      () =>

        getComparison(

          retrainingResult

        ),

      [retrainingResult]

    );



  const {

    currentMetrics,

    candidateMetrics,

  } = useMemo(

    () =>

      getMetricsObject(

        workflowResult,

        retrainingResult,

        comparison

      ),

    [

      workflowResult,

      retrainingResult,

      comparison,

    ]

  );



  const driftResult =

    useMemo(

      () =>

        getDriftResult(

          workflowResult

        ),

      [workflowResult]

    );



  const decisionResult =

    useMemo(

      () =>

        getDecisionResult(

          workflowResult

        ),

      [workflowResult]

    );



  const status =

    getStatus(

      workflowResult,

      retrainingWrapper,

      retrainingResult

    );



  const candidateAccepted =

    getCandidateAccepted(

      comparison,

      retrainingResult

    );



  const modelType =

    formatText(

      getValue(

        retrainingResult,

        [

          "model_type",

          "modelType",

          "algorithm",

        ],

        null

      )

    );



  const candidateModelFilename = getCandidateModelFilename(retrainingResult);

  const candidateModelId =
  getValue(retrainingResult, ["candidate_id", "candidateId"], null) ||
  getValue(
    workflowResult?.retraining?.retraining_result,
    ["candidate_id", "candidateId"],
    null
  ) ||
  getValue(
    workflowResult?.retraining?.retrainingResult,
    ["candidate_id", "candidateId"],
    null
  );

  
const handleCandidateDownload = async () => {
  if (!candidateModelFilename || candidateDownloadState.loading) return;

  setCandidateDownloadState({ loading: true, error: "" });

  try {
    const response = await api.get("/download-candidate-model", {
      params: {
        filename: candidateModelFilename,
        ...(candidateModelId
          ? { candidate_id: candidateModelId }
          : {}),
      },
      responseType: "blob",
    });

    const blob = response.data;
    const downloadUrl = window.URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download =
      candidateModelFilename.replace(/\.joblib$/i, "") + "_artifacts.zip";

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => {
      window.URL.revokeObjectURL(downloadUrl);
    }, 1000);

    setCandidateDownloadState({ loading: false, error: "" });

  } catch (error) {
    console.error("Candidate model download failed:", error);

    let message = "Candidate model download failed.";

    if (error.response?.data instanceof Blob) {
      try {
        const errorText = await error.response.data.text();
        const errorData = JSON.parse(errorText);
        message = errorData.detail || message;
      } catch {
        // Keep default message.
      }
    } else {
      message = error.response?.data?.detail ||
        error.message ||
        message;
    }

    setCandidateDownloadState({
      loading: false,
      error: message,
    });
  }
};


  const trainingSamples =

    getSampleCount(

      retrainingResult,

      [

        "training_samples",

        "training_rows",

        "train_samples",

        "train_rows",

        "training_size",

        "train_size",

        "n_train",

      ]

    );



  const validationSamples =

    getSampleCount(

      retrainingResult,

      [

        "validation_samples",

        "validation_rows",

        "val_samples",

        "val_rows",

        "validation_size",

        "val_size",

        "n_validation",

      ]

    );



  const featureCount =

    getFeatureCount(

      retrainingResult,

      candidateMetrics

    );



  const primaryMetricKey =

    getPrimaryMetricKey(

      workflowResult,

      retrainingResult,

      comparison,

      currentMetrics,

      candidateMetrics

    );



  const metricDefinitions =

    getMetricDefinitions(

      currentMetrics,

      candidateMetrics

    );



  const primaryMetricDefinition =

    metricDefinitions.find(

      (metric) =>

        metric.key ===

        primaryMetricKey

    ) ||

    (

      primaryMetricKey

        ? METRIC_DEFINITIONS[

            primaryMetricKey

          ] || {

            key: primaryMetricKey,

            label:

              primaryMetricKey

                .replace(

                  /_/g,

                  " "

                )

                .replace(

                  /\b\w/g,

                  (char) =>

                    char.toUpperCase()

                ),

            higherIsBetter: true,

            format: "number",

          }

        : {

            key: "primary_metric",

            label: "Primary Metric",

            higherIsBetter: true,

            format: "number",

          }

    );



  const acceptanceMargin =

    getAcceptanceMargin(

      comparison,

      retrainingResult,

      primaryMetricDefinition.key

    );



  const acceptanceMarginText =

    acceptanceMargin !== null

      ? `${formatMetricChange(

          acceptanceMargin,

          primaryMetricDefinition

        )} ${primaryMetricDefinition.label}`

      : "—";



  const metrics =

    metricDefinitions.map(

      (metric) => {

        // Display the raw movement consistently: Candidate - Current.
        // This keeps the sign intuitive for every metric:
        // positive = the metric value increased; negative = it decreased.
        const currentValue = Number(currentMetrics?.[metric.key]);
        const candidateValue = Number(candidateMetrics?.[metric.key]);
        const rawChange =
          Number.isFinite(currentValue) &&
          Number.isFinite(candidateValue)
            ? candidateValue - currentValue
            : null;
        const improvement =
          rawChange === null
            ? "—"
            : formatMetricChange(rawChange, metric);



        return {

          ...metric,



          current:

            getMetricDisplayText(

              currentMetrics?.[

                metric.key

              ],

              metric

            ),



          candidate:

            getMetricDisplayText(

              candidateMetrics?.[

                metric.key

              ],

              metric

            ),



          improvement,



          positive:
            rawChange !== null &&
            metric.higherIsBetter !== null &&
            metric.higherIsBetter !== undefined &&
            (metric.higherIsBetter ? rawChange > 0 : rawChange < 0),

          negative:
            rawChange !== null &&
            metric.higherIsBetter !== null &&
            metric.higherIsBetter !== undefined &&
            (metric.higherIsBetter ? rawChange < 0 : rawChange > 0),

        };

      }

    );



  const primaryCandidate =

    getMetricDisplayText(

      candidateMetrics?.[

        primaryMetricDefinition.key

      ],

      primaryMetricDefinition

    );



  const primaryCurrent =

    getMetricDisplayText(

      currentMetrics?.[

        primaryMetricDefinition.key

      ],

      primaryMetricDefinition

    );



  const primaryImprovement =

    getImprovement(

      comparison,

      currentMetrics,

      candidateMetrics,

      primaryMetricDefinition

    );


  // Describe the actual metric movement (increase/decrease), while
  // separately determining whether that movement is beneficial.
  const primaryCurrentRaw = Number(
    currentMetrics?.[primaryMetricDefinition.key]
  );
  const primaryCandidateRaw = Number(
    candidateMetrics?.[primaryMetricDefinition.key]
  );
  const primaryMetricRawDelta =
    Number.isFinite(primaryCurrentRaw) &&
    Number.isFinite(primaryCandidateRaw)
      ? primaryCandidateRaw - primaryCurrentRaw
      : null;
  const primaryMetricTrendLabel =
    primaryMetricRawDelta === null
      ? `${primaryMetricDefinition.label} Change`
      : primaryMetricRawDelta > 0
        ? `${primaryMetricDefinition.label} Increased`
        : primaryMetricRawDelta < 0
          ? `${primaryMetricDefinition.label} Decreased`
          : `${primaryMetricDefinition.label} Unchanged`;
  const primaryMetricMovementIsPositive =
    primaryMetricRawDelta !== null &&
    (primaryMetricDefinition.higherIsBetter !== false
      ? primaryMetricRawDelta > 0
      : primaryMetricRawDelta < 0);



  const decision =

    getValue(

      decisionResult,

      [

        "decision",

        "action",

        "recommendation",

      ],

      null

    );



  const reasoning =

    getReasoning(

      retrainingResult,

      comparison

    );

  const declaredProblemType = getValue(
    retrainingResult,
    ["problem_type", "problemType", "task_type", "taskType"],
    getValue(workflowResult, ["problem_type", "problemType", "task_type", "taskType"], getValue(comparison, ["problem_type", "problemType"], ""))
  );
  const hasRegressionMetrics = ["r2", "mae", "mse", "rmse"].some(
    (key) => currentMetrics?.[key] !== undefined || candidateMetrics?.[key] !== undefined
  );
  const hasClassificationMetrics = ["accuracy", "precision", "recall", "f1_score"].some(
    (key) => currentMetrics?.[key] !== undefined || candidateMetrics?.[key] !== undefined
  );
  const problemType = String(
    declaredProblemType || (hasRegressionMetrics && !hasClassificationMetrics ? "regression" : hasClassificationMetrics ? "classification" : "")
  ).trim().toLowerCase();

  const rejectionExplanation = getRejectionExplanation(
    comparison,
    currentMetrics,
    candidateMetrics,
    candidateAccepted,
    problemType
  );



  const driftDetected =

    getValue(

      driftResult,

      [

        "drift_detected",

        "driftDetected",

      ],

      null

    );



  const retrainingRequested =

    getValue(

      retrainingResult,

      [

        "retraining_requested",

        "retrainingRequested",

      ],

      null

    );



  const workflowAvailable =

    Boolean(workflowResult);



  const acceptedLabel =

    candidateAccepted === true

      ? "Accepted"

      : candidateAccepted === false

        ? "Rejected"

        : "Not returned";



  const evaluationAction =

    candidateAccepted === true

      ? "ACCEPT_CANDIDATE"

      : candidateAccepted === false

        ? "REJECT_CANDIDATE"

        : "NOT RETURNED";



  const statusIsCompleted =

    workflowAvailable &&

    status !== "FAILED" &&

    status !== "ERROR";



  const retrainingSteps = [

    {

      title: "Drift detected",



      description:

        driftDetected === true

          ? "Concept drift was detected in the monitored data."

          : driftDetected === false

            ? "The workflow reported no detected concept drift."

            : "Drift detection result is available from the workflow.",



      status:

        driftDetected === true

          ? "Completed"

          : workflowAvailable

            ? "Completed"

            : "Waiting",

    },



    {

      title: "Retraining triggered",



      description:

        retrainingRequested === false

          ? "The workflow did not request candidate model retraining."

          : "The Retraining Agent processed the current monitoring data.",



      status:

        retrainingRequested === false

          ? "Skipped"

          : retrainingResult

            ? "Completed"

            : "Waiting",

    },



    {

      title: "Candidate evaluated",



      description:

        retrainingResult

          ? "The candidate model was evaluated against the current production model."

          : "Candidate evaluation will appear after the workflow completes.",



      status:

        retrainingResult

          ? "Completed"

          : "Waiting",

    },



    {

      title: "Candidate",



      description:

        candidateAccepted === true

          ? "The candidate satisfied the returned acceptance criterion."

          : candidateAccepted === false

            ? "The candidate did not satisfy the returned acceptance criterion."

            : "The backend did not return a candidate acceptance result.",



      status:

        candidateAccepted === true

          ? "Accepted"

          : candidateAccepted === false

            ? "Rejected"

            : "Pending",

    },

  ];



  return (

    <div className="app-shell">

      <Sidebar />



      <main className="main-area">

        <Topbar title="Retraining" />



        <section className="dashboard-content retraining-page">



          <div className="page-heading retraining-heading">

            <div>

              <h2>Model Retraining</h2>



              <p>

                Automated candidate model training and evaluation after

                detected concept drift.

              </p>

            </div>



            <div

              className={`summary-status ${

                statusIsCompleted

                  ? "success"

                  : ""

              }`}

            >

              {statusIsCompleted ? (

                <CheckCircle2 size={16} />

              ) : (

                <Clock3 size={16} />

              )}



              <span>

                {workflowAvailable

                  ? `Retraining ${status.toLowerCase()}`

                  : "Waiting for Workflow"}

              </span>

            </div>

          </div>



          {loadError && (

            <div

              className="rt-panel"

              style={{

                marginBottom: "20px",

                borderColor: "#fecaca",

              }}

            >

              <div className="rt-ai-reasoning">

                <div className="rt-ai-icon">

                  <AlertTriangle size={22} />

                </div>



                <p>{loadError}</p>

              </div>

            </div>

          )}



          {!workflowResult && !loadError && (

            <div

              className="rt-panel"

              style={{

                marginBottom: "20px",

              }}

            >

              <div className="rt-ai-reasoning">

                <div className="rt-ai-icon">

                  <Clock3 size={22} />

                </div>



                <p>

                  No completed workflow result is available yet.

                  Run the AI Workflow from the AI Agents page first.

                </p>

              </div>

            </div>

          )}



          <div className="rt-overview-grid">



            <div className="rt-overview-card">

              <div className="rt-overview-icon orange">

                <RefreshCw size={22} />

              </div>



              <div className="rt-overview-content">

                <span className="rt-label">

                  Retraining Status

                </span>



                <strong className="rt-value">

                  {status}

                </strong>



                <small className="rt-description">

                  Retraining Agent

                </small>

              </div>

            </div>



            <div className="rt-overview-card">

              <div className="rt-overview-icon blue">

                <Database size={22} />

              </div>



              <div className="rt-overview-content">

                <span className="rt-label">

                  Training Samples

                </span>



                <strong className="rt-value">

                  {trainingSamples}

                </strong>



                <small className="rt-description">

                  Candidate training data

                </small>

              </div>

            </div>



            <div className="rt-overview-card">

              <div className="rt-overview-icon purple">

                <BarChart3 size={22} />

              </div>



              <div className="rt-overview-content">

                <span className="rt-label">

                  Validation Samples

                </span>



                <strong className="rt-value">

                  {validationSamples}

                </strong>



                <small className="rt-description">

                  Candidate validation data

                </small>

              </div>

            </div>



            <div className="rt-overview-card">

              <div
                className={`rt-overview-icon ${
                  primaryMetricRawDelta === null || primaryMetricRawDelta === 0
                    ? "orange"
                    : primaryMetricMovementIsPositive
                      ? "green"
                      : "red"
                }`}
              >
                {primaryMetricRawDelta === null || primaryMetricRawDelta === 0 ? (
                  <Minus size={22} />
                ) : primaryMetricRawDelta > 0 ? (
                  <TrendingUp size={22} />
                ) : (
                  <TrendingDown size={22} />
                )}
              </div>



              <div className="rt-overview-content">

                <span className="rt-label">

                  {primaryMetricTrendLabel}

                </span>



                <strong className="rt-value">

                  {primaryImprovement}

                </strong>



                <small className="rt-description">

                  Candidate vs current

                </small>

              </div>

            </div>



          </div>



          <div className="rt-two-column">



            <div className="rt-panel">



              <div className="rt-panel-header">

                <div>

                  <h3>Model Comparison</h3>



                  <p>

                    Current production model versus the newly trained

                    candidate model.

                  </p>

                </div>



                <div className="rt-panel-icon blue">

                  <BarChart3 size={20} />

                </div>

              </div>



              <div className="rt-comparison-table">



                <div className="rt-comparison-header">

                  <div>Metric</div>

                  <div>Current</div>

                  <div>Candidate</div>

                  <div>Change</div>

                </div>



                {metrics.map((metric) => (

                  <div

                    className="rt-comparison-row"

                    key={metric.key}

                  >

                    <div className="rt-metric-name">

                      {metric.label}

                    </div>



                    <div

                      className="rt-metric-value"

                      style={{

                        whiteSpace: "nowrap",

                      }}

                    >

                      {metric.current}

                    </div>



                    <div

                      className="rt-metric-value candidate"

                      style={{

                        whiteSpace: "nowrap",

                      }}

                    >&#x20;

                      {metric.candidate}

                    </div>



                    <div

                      className={`rt-metric-change ${
                        metric.positive
                          ? "positive"
                          : metric.negative
                            ? "negative"
                            : ""
                      }`}

                      style={{

                        whiteSpace: "nowrap",

                      }}

                    >

                      {metric.improvement}

                    </div>

                  </div>

                ))}



              </div>
              <div
                className="rt-candidate-download"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "12px",
                  marginTop: "18px",
                  padding: "14px 16px",
                  border: "1px solid #e2e8f0",
                  borderRadius: "12px",
                  background: "#ffffff",
                }}
              >
                <div style={{ minWidth: "180px", flex: "1 1 220px" }}>
                  <strong style={{ display: "block", color: "#1e293b", fontSize: "14px" }}>
                    Candidate Model
                  </strong>
                  <span style={{ display: "block", color: "#64748b", fontSize: "12px", marginTop: "4px" }}>
                    Download the saved model and its matching preprocessor as a ZIP.
                  </span>
                  {candidateDownloadState.error && (
                    <span
                      role="alert"
                      style={{ display: "block", color: "#dc2626", fontSize: "12px", marginTop: "6px" }}
                    >
                      {candidateDownloadState.error}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleCandidateDownload}
                  disabled={!candidateModelFilename || candidateDownloadState.loading}
                  title={
                    !candidateModelFilename
                      ? "No saved candidate model artifact was returned by the workflow."
                      : "Download candidate model artifacts"
                  }
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    padding: "10px 16px",
                    border: "none",
                    borderRadius: "9px",
                    background: !candidateModelFilename ? "#cbd5e1" : "#2563eb",
                    color: "#ffffff",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: !candidateModelFilename || candidateDownloadState.loading
                      ? "not-allowed"
                      : "pointer",
                    opacity: candidateDownloadState.loading ? 0.75 : 1,
                    whiteSpace: "nowrap",
                  }}
                >
                  <Download size={16} />
                  {candidateDownloadState.loading ? "Preparing ZIP..." : "Download Candidate"}
                </button>
              </div>


            </div>



            <div className="rt-panel">



              <div className="rt-panel-header">

                <div>

                  <h3>Candidate Evaluation</h3>



                  <p>

                    Evaluation performed using the configured acceptance

                    criteria.

                  </p>

                </div>



                <div
                  className={`rt-panel-icon ${candidateAccepted === false ? "red" : candidateAccepted === true ? "green" : "orange"}`}
                  style={candidateAccepted === false ? { color: "#dc2626", background: "#fef2f2" } : undefined}
                >
                  <ShieldCheck size={20} />
                </div>

              </div>



              <div
                className={`rt-decision-result ${
                  candidateAccepted === false
                    ? "rejected"
                    : candidateAccepted === true
                      ? "accepted"
                      : "pending"
                }`}
                style={
                  candidateAccepted === false
                    ? {
                        background: "#fff7f7",
                        border: "1px solid #fecaca",
                      }
                    : candidateAccepted === true
                      ? {
                          background: "#f0fdf4",
                          border: "1px solid #bbf7d0",
                        }
                      : undefined
                }
              >



                <div
                  className="rt-decision-icon"
                  style={candidateAccepted === false ? { color: "#dc2626", background: "#fee2e2" } : candidateAccepted === true ? { color: "#16a34a", background: "#dcfce7" } : undefined}
                >
                  {candidateAccepted === false ? (
                    <AlertTriangle size={30} />
                  ) : candidateAccepted === true ? (
                    <CheckCircle2 size={30} />
                  ) : (
                    <Clock3 size={30} />
                  )}
                </div>



                <h3>

                  {candidateAccepted === true

                    ? "Candidate Accepted"

                    : candidateAccepted === false

                      ? "Candidate Rejected"

                      : "Evaluation Pending"}

                </h3>



                <div
                  className="rt-decision-action"
                  style={candidateAccepted === false ? { color: "#b91c1c" } : candidateAccepted === true ? { color: "#15803d" } : { color: "#a16207" }}
                >
                  {candidateAccepted === false ? "CANDIDATE REJECTED" : candidateAccepted === true ? "CANDIDATE ACCEPTED" : "EVALUATION PENDING"}
                </div>



                <p style={{ whiteSpace: "pre-line", textAlign: "left" }}>
                  {candidateAccepted === false && rejectionExplanation ? (
                    rejectionExplanation
                  ) : (
                    <>
                      The backend returned a candidate{" "}
                      {primaryMetricDefinition.label} of{" "}
                      <strong>{primaryCandidate}</strong>, compared with{" "}
                      <strong>{primaryCurrent}</strong> for the current model.
                    </>
                  )}
                </p>

                <div
                  className="rt-decision-improvement"
                  style={
                    candidateAccepted === false
                      ? {
                          color: "#b91c1c",
                          background: "#fee2e2",
                          borderColor: "#fecaca",
                        }
                      : candidateAccepted === true
                        ? {
                            color: "#15803d",
                            background: "#dcfce7",
                            borderColor: "#bbf7d0",
                          }
                        : undefined
                  }
                >
                  {candidateAccepted === false ? (
                    <AlertTriangle size={18} />
                  ) : (
                    <TrendingUp size={18} />
                  )}
                  <span>
                    {candidateAccepted === false && rejectionExplanation
                      ? "Rejection reason: performance acceptance criteria not met"
                      : candidateAccepted === false
                        ? "Candidate rejected: acceptance criteria not met"
                        : `${primaryMetricDefinition.label} improvement: ${primaryImprovement}`}
                  </span>
                </div>



              </div>

            </div>



          </div>



          <div className="rt-panel">



            <div className="rt-panel-header">

              <div>

                <h3>Retraining Workflow</h3>



                <p>

                  Automated sequence executed by the DriftWatcher

                  retraining workflow.

                </p>

              </div>



              <div className="rt-panel-icon orange">

                <RefreshCw size={20} />

              </div>

            </div>



            <div className="rt-workflow">



              {retrainingSteps.map((step, index) => (

                <div

                  className="rt-workflow-step"

                  key={step.title}

                >



                  <div className="rt-step-number">

                    {index + 1}

                  </div>



                  <div className="rt-step-content">



                    <div className="rt-step-title-row">



                      <strong>

                        {step.title}

                      </strong>



                      <span
                        className="rt-step-status"
                        style={step.status === "Rejected" ? { color: "#b91c1c", background: "#fee2e2", border: "1px solid #fecaca" } : step.status === "Accepted" ? { color: "#15803d", background: "#dcfce7", border: "1px solid #bbf7d0" } : undefined}
                      >
                        {step.status === "Rejected" ? (
                          <AlertTriangle size={14} />
                        ) : step.status === "Pending" || step.status === "Waiting" || step.status === "Skipped" ? (
                          <Clock3 size={14} />
                        ) : (
                          <CheckCircle2 size={14} />
                        )}
                        {step.status}
                      </span>



                    </div>



                    <p>

                      {step.description}

                    </p>



                  </div>



                </div>

              ))}



            </div>

          </div>



          <div className="rt-panel">



            <div className="rt-panel-header">



              <div>

                <h3>Retraining Agent Reasoning</h3>



                <p>

                  AI reasoning based on model evaluation evidence.

                </p>

              </div>



              <div className="rt-panel-icon purple">

                <BrainCircuit size={20} />

              </div>



            </div>



            <div className="rt-ai-reasoning">



              <div className="rt-ai-icon">

                <BrainCircuit size={22} />

              </div>



              <p>

                {candidateAccepted === false && rejectionExplanation ? (
                  <span style={{ whiteSpace: "pre-wrap" }}>
                    {rejectionExplanation}
                  </span>
                ) : reasoning ? (
                  <span style={{ whiteSpace: "pre-wrap" }}>
                    {reasoning}
                  </span>
                ) : candidateAccepted === true ? (

                  <>

                    The candidate model was accepted according to the

                    acceptance result returned by the Retraining Agent.

                    The backend reported a{" "}

                    {primaryMetricDefinition.label} of{" "}

                    <strong>{primaryCandidate}</strong> versus{" "}

                    <strong>{primaryCurrent}</strong> for the current model.

                  </>

                ) : candidateAccepted === false ? (

                  <>

                    The candidate model was not accepted according to

                    the acceptance result returned by the Retraining

                    Agent.

                  </>

                ) : (

                  <>

                    Retraining Agent reasoning will appear here after

                    the backend workflow returns the corresponding

                    evaluation result.

                  </>

                )}

              </p>



            </div>

          </div>



          <div className="rt-panel">



            <div className="rt-panel-header">



              <div>

                <h3>Retraining Details</h3>



                <p>

                  Information about the generated candidate model

                  and its evaluation.

                </p>

              </div>



              <div className="rt-panel-icon blue">

                <Database size={20} />

              </div>



            </div>



            <div className="rt-details-grid">



              <div className="rt-detail-item">

                <span>Model Type</span>

                <strong>{modelType}</strong>

              </div>



              <div className="rt-detail-item">

                <span>Training Rows</span>

                <strong>{trainingSamples}</strong>

              </div>



              <div className="rt-detail-item">

                <span>Validation Rows</span>

                <strong>{validationSamples}</strong>

              </div>



              <div className="rt-detail-item">

                <span>Features</span>

                <strong>{featureCount}</strong>

              </div>



              <div className="rt-detail-item">

                <span>Acceptance Margin</span>

                <strong>{acceptanceMarginText}</strong>

              </div>



              <div className="rt-detail-item">

                <span>Candidate Status</span>



                <strong
                  style={
                    candidateAccepted === false
                      ? { color: "#dc2626" }
                      : candidateAccepted === true
                        ? { color: "#16a34a" }
                        : { color: "#a16207" }
                  }
                >
                  {candidateAccepted === true
                    ? "Accepted"
                    : candidateAccepted === false
                      ? "Rejected"
                      : "Pending"}
                </strong>

              </div>



            </div>

          </div>



          <div className="rt-next-action">



            <div className="rt-next-action-content">



              <span>Next Stage</span>



              <h3>

                {candidateAccepted === true

                  ? "Candidate evaluation completed."

                  : candidateAccepted === false

                    ? "Candidate evaluation completed without acceptance."

                    : "Candidate evaluation result is pending."}

              </h3>



              <p>

                {decision

                  ? `Decision Agent result: ${formatText(decision)}.`

                  : candidateAccepted === true

                    ? "The accepted candidate is available to the Decision Agent for the next system action."

                    : "The Decision Agent will use the available workflow evidence to determine the appropriate system action."}

              </p>



            </div>



            <ArrowUpRight

              size={28}

              className="rt-next-action-icon"

            />



          </div>



          <div className="rt-last-updated">



            <Clock3 size={14} />



            <span>

              Latest retraining result from DriftWatcher workflow

            </span>



          </div>



        </section>

      </main>

    </div>

  );

}



export default Retraining;