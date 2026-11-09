import { useEffect, useMemo, useRef, useState } from "react";

import { jsPDF } from "jspdf";

import {
  FileText,
  Download,
  Eye,
  ShieldCheck,
  Activity,
  AlertTriangle,
  Brain,
  Database,
  RefreshCw,
  Server,
  Clock,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
} from "lucide-react";

import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import "../App.css";

const readWorkflowResult = () => {
  try {
    if (window.__driftWatcherWorkflowResult) {
      return window.__driftWatcherWorkflowResult;
    }

    const stored = localStorage.getItem(
      "driftwatcher.workflowResult"
    );

    if (!stored) {
      return null;
    }

    return JSON.parse(stored);
  } catch (error) {
    console.error(
      "Failed to read DriftWatcher workflow result:",
      error
    );
    return null;
  }
};

const readLocalStorageObject = (key) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error(`Failed to read ${key}:`, error);
    return null;
  }
};

const getFrameworkName = (workflowResult, modelType) => {
  const modelConfig = readLocalStorageObject(
    "driftwatcher.modelConfig"
  );

  const framework =
    modelConfig?.framework ||
    workflowResult?.framework ||
    workflowResult?.action?.details?.framework;

  if (framework) {
    return formatModelName(framework);
  }

  const normalized = String(modelType || "").toLowerCase();

  if (
    normalized.includes("random_forest") ||
    normalized.includes("xgboost") ||
    normalized.includes("logistic") ||
    normalized.includes("svm") ||
    normalized.includes("gradient_boost")
  ) {
    return "Scikit-learn";
  }

  if (
    normalized.includes("tensorflow") ||
    normalized.includes("keras")
  ) {
    return "TensorFlow / Keras";
  }

  if (
    normalized.includes("pytorch") ||
    normalized.includes("torch")
  ) {
    return "PyTorch";
  }

  return "Not recorded";
};

const getMonitoringPeriod = () => {
  const datasetConfig = readLocalStorageObject(
    "driftwatcher.datasetConfig"
  );

  const reference =
    datasetConfig?.referenceFilename ||
    datasetConfig?.referenceDatasetPath ||
    "Reference dataset";

  const current =
    datasetConfig?.currentFilename ||
    datasetConfig?.currentDatasetPath ||
    "Current monitoring dataset";

  const clean = (value) => {
    const normalized = String(value);
    const parts = normalized.split(/[\\/]/);
    return parts[parts.length - 1] || normalized;
  };

  return `Reference: ${clean(reference)} vs Current: ${clean(current)}`;
};

const formatPercent = (value) => {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
  }

  const numericValue = Number(value);

  if (Number.isNaN(numericValue)) {
    return "—";
  }

  return `${(numericValue * 100).toFixed(2)}%`;
};

const formatNumber = (value) => {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "0";
  }

  const numericValue = Number(value);

  if (Number.isNaN(numericValue)) {
    return String(value);
  }

  return numericValue.toLocaleString();
};

const formatModelName = (value) => {
  if (!value) {
    return "Unknown Model";
  }

  return String(value)
    .replace(/\_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const formatDateTime = (value) => {
  if (!value) {
    return "Not available";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return parsed.toLocaleString();
};

const formatGeneratedTime = () => {
  return new Date().toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getWorkflowEventTime = (workflowResult) => {
  const candidates = [
    workflowResult?.workflow_completed_at,
    workflowResult?.completed_at,
    workflowResult?.execution_time,
    workflowResult?.executed_at,
    workflowResult?.action?.details?.created_at,
    workflowResult?.action?.details?.deployment?.created_at,
  ];

  for (const value of candidates) {
    if (!value) {
      continue;
    }

    const parsed = new Date(value);

    if (!Number.isNaN(parsed.getTime())) {
      return formatDateTime(value);
    }
  }

  return formatGeneratedTime();
};

const getNestedValue = (
  object,
  keys,
  fallback = null
) => {
  for (const key of keys) {
    const value = object?.[key];

    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      return value;
    }
  }

  return fallback;
};

const sumNumericObject = (value) => {
  if (!value) {
    return 0;
  }

  if (typeof value === "number") {
    return value;
  }

  if (typeof value !== "object") {
    return 0;
  }

  return Object.values(value).reduce(
    (total, item) => {
      const numeric = Number(item);

      return Number.isNaN(numeric)
        ? total
        : total + numeric;
    },
    0
  );
};

const getQualityMetric = (quality, keys) => {
  for (const key of keys) {
    const value = quality?.[key];

    if (
      value === undefined ||
      value === null
    ) {
      continue;
    }

    if (typeof value === "object") {
      return sumNumericObject(value);
    }

    return Number(value) || 0;
  }

  return 0;
};

const getDetectorStatus = (
  detectorResults,
  names
) => {
  const entries = Object.entries(
    detectorResults || {}
  );

  const match = entries.find(([name]) =>
    names.some(
      (target) =>
        String(name)
          .toLowerCase()
          .replace(/[-\_]/g, "") ===
        String(target)
          .toLowerCase()
          .replace(/[-\_]/g, "")
    )
  );

  return match?.[1]
    ? String(match[1]).toUpperCase()
    : "NOT RECORDED";
};

const getRootCauseChange = (item) => {
  if (item?.percent_change !== undefined) {
    const numeric = Number(item.percent_change);

    return Number.isNaN(numeric)
      ? String(item.percent_change)
      : `${numeric >= 0 ? "+" : ""}${numeric.toFixed(2)}%`;
  }

  if (item?.change_percent !== undefined) {
    const numeric = Number(item.change_percent);

    return Number.isNaN(numeric)
      ? String(item.change_percent)
      : `${numeric >= 0 ? "+" : ""}${numeric.toFixed(2)}%`;
  }

  if (
    item?.standardized_change !== undefined
  ) {
    const numeric = Number(
      item.standardized_change
    );

    if (!Number.isNaN(numeric)) {
      return `${numeric >= 0 ? "+" : ""}${numeric.toFixed(2)}σ`;
    }

    return String(item.standardized_change);
  }

  if (
    item?.distribution_change !== undefined
  ) {
    const numeric = Number(
      item.distribution_change
    );

    if (!Number.isNaN(numeric)) {
      return `Δ ${numeric.toFixed(4)}`;
    }

    return String(item.distribution_change);
  }

  if (item?.change !== undefined) {
    return String(item.change);
  }

  return "Changed";
};

const normalizeProbableReasons = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((reason) => {
      if (typeof reason === "string") {
        return reason;
      }

      if (
        reason &&
        typeof reason === "object"
      ) {
        return (
          reason.reason ||
          reason.description ||
          reason.cause ||
          reason.text ||
          JSON.stringify(reason)
        );
      }

      return String(reason);
    })
    .filter(Boolean);
};

const getRootCauseDescription = (item) => {
  if (item?.description) {
    return item.description;
  }

  if (
    item?.standardized_change !== undefined
  ) {
    const value = Math.abs(
      Number(item.standardized_change)
    );

    if (value >= 1) {
      return "Significant standardized shift";
    }

    if (value >= 0.5) {
      return "Noticeable standardized shift";
    }

    return "Moderate feature shift";
  }

  if (
    item?.distribution_change !== undefined
  ) {
    return "Distribution change detected";
  }

  return "Feature-level change detected";
};

/*
 * Normalize metric names coming from different
 * backend/model adapters.
 *
 * Classification:
 * - accuracy
 * - precision
 * - recall
 * - f1_score
 *
 * Regression:
 * - mae
 * - mse
 * - rmse
 * - r2
 */
const normalizeMetricObject = (metrics) => {
  if (
    !metrics ||
    typeof metrics !== "object"
  ) {
    return {};
  }

  const readMetric = (keys) => {
    for (const key of keys) {
      const value = metrics?.[key];

      if (
        value !== undefined &&
        value !== null &&
        value !== ""
      ) {
        return value;
      }
    }

    return undefined;
  };

  return {
    ...metrics,

    accuracy: readMetric([
      "accuracy",
      "accuracy_score",
      "accuracyScore",
    ]),

    precision: readMetric([
      "precision",
      "precision_score",
      "precisionScore",
    ]),

    recall: readMetric([
      "recall",
      "recall_score",
      "recallScore",
    ]),

    f1_score: readMetric([
      "f1_score",
      "f1",
      "f1Score",
      "f1score",
    ]),

    mae: readMetric([
      "mae",
      "mean_absolute_error",
    ]),

    mse: readMetric([
      "mse",
      "mean_squared_error",
    ]),

    rmse: readMetric([
      "rmse",
      "root_mean_squared_error",
    ]),

    r2: readMetric([
      "r2",
      "r2_score",
      "r2Score",
    ]),
  };
};

const getCurrentMetrics = (
  workflowResult,
  retraining,
  comparison
) => {
  const workflowMetrics =
    normalizeMetricObject(
      workflowResult?.current_metrics ||
        workflowResult?.currentMetrics
    );

  const retrainingMetrics =
    normalizeMetricObject(
      retraining?.current_metrics ||
        retraining?.currentMetrics
    );

  const comparisonMetrics =
    normalizeMetricObject({
      accuracy:
        comparison?.current_accuracy,

      precision:
        comparison?.current_precision,

      recall:
        comparison?.current_recall,

      f1_score:
        comparison?.current_f1_score ??
        comparison?.current_f1 ??
        comparison?.currentF1,

      mae:
        comparison?.current_mae ??
        comparison?.current_mean_absolute_error,

      mse:
        comparison?.current_mse ??
        comparison?.current_mean_squared_error,

      rmse:
        comparison?.current_rmse ??
        comparison?.current_root_mean_squared_error,

      r2:
        comparison?.current_r2 ??
        comparison?.current_r2_score,
    });

  return {
    ...comparisonMetrics,
    ...retrainingMetrics,
    ...workflowMetrics,
  };
};

const getCandidateMetrics = (
  retraining,
  comparison
) => {
  const retrainingMetrics =
    normalizeMetricObject(
      retraining?.candidate_metrics ||
        retraining?.candidateMetrics
    );

  const comparisonMetrics =
    normalizeMetricObject({
      accuracy:
        comparison?.candidate_accuracy,

      precision:
        comparison?.candidate_precision,

      recall:
        comparison?.candidate_recall,

      f1_score:
        comparison?.candidate_f1_score ??
        comparison?.candidate_f1 ??
        comparison?.candidateF1,

      mae:
        comparison?.candidate_mae ??
        comparison?.candidate_mean_absolute_error,

      mse:
        comparison?.candidate_mse ??
        comparison?.candidate_mean_squared_error,

      rmse:
        comparison?.candidate_rmse ??
        comparison?.candidate_root_mean_squared_error,

      r2:
        comparison?.candidate_r2 ??
        comparison?.candidate_r2_score,
    });

  const workflowMetrics =
    normalizeMetricObject(
      retraining?.workflow_candidate_metrics ||
        retraining?.workflowCandidateMetrics
    );

  return {
    ...comparisonMetrics,
    ...retrainingMetrics,
    ...workflowMetrics,
  };
};

/*
 * Supported metrics.
 */
const METRIC_LABELS = {
  accuracy: "Accuracy",
  precision: "Precision",
  recall: "Recall",
  f1_score: "F1 Score",
  mae: "MAE",
  mse: "MSE",
  rmse: "RMSE",
  r2: "R²",
};

const PERCENT_METRICS = new Set([
  "accuracy",
  "precision",
  "recall",
  "f1_score",
  "r2",
]);

const HIGHER_IS_BETTER_METRICS = new Set([
  "accuracy",
  "precision",
  "recall",
  "f1_score",
  "r2",
]);

const normalizeProblemType = (value) => {
  if (!value) {
    return null;
  }

  const normalized = String(value)
    .trim()
    .toLowerCase();

  if (normalized.includes("regress")) {
    return "regression";
  }

  if (
    normalized.includes("classif") ||
    normalized.includes("class")
  ) {
    return "classification";
  }

  return null;
};

const getMetricValue = (
  metrics,
  metric
) => {
  if (!metrics || !metric) {
    return undefined;
  }

  const aliases = {
    accuracy: [
      "accuracy",
      "accuracy_score",
      "accuracyScore",
    ],

    precision: [
      "precision",
      "precision_score",
      "precisionScore",
    ],

    recall: [
      "recall",
      "recall_score",
      "recallScore",
    ],

    f1_score: [
      "f1_score",
      "f1",
      "f1Score",
      "f1score",
    ],

    mae: [
      "mae",
      "mean_absolute_error",
    ],

    mse: [
      "mse",
      "mean_squared_error",
    ],

    rmse: [
      "rmse",
      "root_mean_squared_error",
    ],

    r2: [
      "r2",
      "r2_score",
      "r2Score",
    ],
  };

  const keys =
    aliases[metric] || [metric];

  for (const key of keys) {
    if (
      metrics[key] !== undefined &&
      metrics[key] !== null &&
      metrics[key] !== ""
    ) {
      return metrics[key];
    }
  }

  return undefined;
};

const getProblemType = (
  workflowResult,
  retraining
) => {
  const modelConfig =
    readLocalStorageObject(
      "driftwatcher.modelConfig"
    );

  const candidates = [
    workflowResult?.problem_type,
    workflowResult?.problemType,
    retraining?.problem_type,
    retraining?.problemType,

    workflowResult?.configuration
      ?.problem_type,

    workflowResult?.configuration
      ?.problemType,

    modelConfig?.problemType,
    modelConfig?.problem_type,
  ];

  for (const candidate of candidates) {
    const normalized =
      normalizeProblemType(candidate);

    if (normalized) {
      return normalized;
    }
  }

  return null;
};

const getPrimaryMetricInfo = (
  workflowResult,
  retraining,
  comparison,
  currentMetrics,
  candidateMetrics
) => {
  const problemType =
    getProblemType(
      workflowResult,
      retraining
    );

  const explicitMetric =
    comparison?.primary_metric ||
    comparison?.primaryMetric ||
    retraining?.primary_metric ||
    retraining?.primaryMetric ||
    workflowResult?.primary_metric ||
    workflowResult?.primaryMetric;

  const normalizeMetricName = (
    value
  ) => {
    if (!value) {
      return null;
    }

    const normalized = String(value)
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");

    if (normalized === "f1") {
      return "f1_score";
    }

    if (
      normalized === "r2" ||
      normalized === "r2score"
    ) {
      return "r2";
    }

    if (
      METRIC_LABELS[normalized]
    ) {
      return normalized;
    }

    return null;
  };

  const explicit =
    normalizeMetricName(
      explicitMetric
    );

  const regressionOrder = [
    "r2",
    "mae",
    "mse",
    "rmse",
  ];

  const classificationOrder = [
    "accuracy",
    "precision",
    "recall",
    "f1_score",
  ];

  let metricKeys;

  if (problemType === "regression") {
    metricKeys = [
      explicit,
      ...regressionOrder,
    ].filter(Boolean);
  } else if (
    problemType === "classification"
  ) {
    metricKeys = [
      explicit,
      ...classificationOrder,
    ].filter(Boolean);
  } else {
    metricKeys = [
      explicit,
      ...classificationOrder,
      ...regressionOrder,
    ].filter(Boolean);
  }

  const metricKey =
    metricKeys.find(
      (key) =>
        getMetricValue(
          candidateMetrics,
          key
        ) !== undefined ||
        getMetricValue(
          currentMetrics,
          key
        ) !== undefined
    ) || null;

  return {
    problemType,
    key: metricKey,

    label: metricKey
      ? METRIC_LABELS[metricKey]
      : "Primary Performance",

    currentValue: metricKey
      ? getMetricValue(
          currentMetrics,
          metricKey
        )
      : undefined,

    candidateValue: metricKey
      ? getMetricValue(
          candidateMetrics,
          metricKey
        )
      : undefined,

    higherIsBetter: metricKey
      ? HIGHER_IS_BETTER_METRICS.has(
          metricKey
        )
      : true,
  };
};

const getMetricChangeLabel = (
  metric,
  change
) => {
  if (
    change === null ||
    change === undefined
  ) {
    return "—";
  }

  const numeric = Number(change);

  if (Number.isNaN(numeric)) {
    return "—";
  }

  if (
    PERCENT_METRICS.has(metric)
  ) {
    return `${
      numeric >= 0 ? "+" : ""
    }${(numeric * 100).toFixed(2)}%`;
  }

  return `${
    numeric >= 0 ? "+" : ""
  }${numeric.toFixed(4)}`;
};

const formatMetricValue = (
  value,
  metric
) => {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
  }

  const numeric = Number(value);

  if (Number.isNaN(numeric)) {
    return "—";
  }

  if (
    PERCENT_METRICS.has(metric)
  ) {
    return `${(
      numeric * 100
    ).toFixed(2)}%`;
  }

  return numeric.toLocaleString(
    undefined,
    {
      minimumFractionDigits: 0,
      maximumFractionDigits: 4,
    }
  );
};

const getMetricRows = (
  problemType,
  currentMetrics,
  candidateMetrics
) => {
  const classificationMetrics = [
    "accuracy",
    "precision",
    "recall",
    "f1_score",
  ];

  const regressionMetrics = [
    "r2",
    "mae",
    "mse",
    "rmse",
  ];

  const metricKeys =
    problemType === "regression"
      ? regressionMetrics
      : problemType ===
        "classification"
      ? classificationMetrics
      : [
          ...classificationMetrics,
          ...regressionMetrics,
        ];

  return metricKeys
    .filter(
      (metric) =>
        getMetricValue(
          currentMetrics,
          metric
        ) !== undefined ||
        getMetricValue(
          candidateMetrics,
          metric
        ) !== undefined
    )
    .map((metric) => {
      const current =
        getMetricValue(
          currentMetrics,
          metric
        );

      const candidate =
        getMetricValue(
          candidateMetrics,
          metric
        );

      return {
        key: metric,
        label: METRIC_LABELS[metric],
        current,
        candidate,
        change: getMetricChange(
          current,
          candidate
        ),
        higherIsBetter:
          HIGHER_IS_BETTER_METRICS.has(
            metric
          ),
      };
    });
};

const getMetricChange = (
  currentValue,
  candidateValue
) => {
  const current = Number(
    currentValue
  );

  const candidate = Number(
    candidateValue
  );

  if (
    Number.isNaN(current) ||
    Number.isNaN(candidate)
  ) {
    return null;
  }

  return candidate - current;
};

const getMetricImprovement = (
  currentValue,
  candidateValue,
  metric
) => {
  const change = getMetricChange(
    currentValue,
    candidateValue
  );

  if (change === null) {
    return null;
  }

  return HIGHER_IS_BETTER_METRICS.has(
    metric
  )
    ? change
    : -change;
};

const getActionVersion = (
  workflowResult
) => {
  return (
    workflowResult?.action?.details
      ?.version ||
    workflowResult?.action?.details
      ?.deployment?.active_version ||
    workflowResult?.action?.version ||
    null
  );
};

function Reports() {
  const [workflowResult, setWorkflowResult] =
    useState(readWorkflowResult);

  const [generatedAt, setGeneratedAt] =
    useState(formatGeneratedTime());

  const timelineRef = useRef(null);
  const reportTopRef = useRef(null);
  const reportExportRef = useRef(null);
  const reportPdfRef = useRef(null);

  useEffect(() => {
    const handleWorkflowResult = (
      event
    ) => {
      if (event.detail) {
        setWorkflowResult(
          event.detail
        );

        setGeneratedAt(
          formatGeneratedTime()
        );
      }
    };

    const handleStorage = (event) => {
      if (
        event.key !==
        "driftwatcher.workflowResult"
      ) {
        return;
      }

      const nextResult =
        readWorkflowResult();

      if (nextResult) {
        setWorkflowResult(
          nextResult
        );

        setGeneratedAt(
          formatGeneratedTime()
        );
      }
    };

    window.addEventListener(
      "driftwatcher:workflow-result",
      handleWorkflowResult
    );

    window.addEventListener(
      "storage",
      handleStorage
    );

    return () => {
      window.removeEventListener(
        "driftwatcher:workflow-result",
        handleWorkflowResult
      );

      window.removeEventListener(
        "storage",
        handleStorage
      );
    };
  }, []);

  const reportData = useMemo(() => {
    const drift =
      workflowResult?.drift_detection ||
      {};

    const rootCause =
      workflowResult?.root_cause ||
      {};

    const dataQuality =
      workflowResult?.data_quality ||
      {};

    const retrainingWrapper =
      workflowResult?.retraining ||
      {};

    const retraining =
      retrainingWrapper?.retraining_result ||
      retrainingWrapper ||
      {};

    const report =
      workflowResult?.report
        ?.structured_report ||
      workflowResult?.report ||
      {};

    const decisionWrapper =
      workflowResult?.decision ||
      {};

    const decision =
      decisionWrapper?.decision_result ||
      decisionWrapper ||
      {};

    const action =
      workflowResult?.action ||
      {};

    const comparison =
      retraining?.comparison ||
      {};

    const currentMetrics =
      getCurrentMetrics(
        workflowResult,
        retraining,
        comparison
      );

    const candidateMetrics =
      getCandidateMetrics(
        retraining,
        comparison
      );

    const primaryMetric =
      getPrimaryMetricInfo(
        workflowResult,
        retraining,
        comparison,
        currentMetrics,
        candidateMetrics
      );

    // Executive Summary should explain the candidate decision:
    // rejected candidates highlight the failed acceptance metric;
    // accepted candidates continue to highlight the configured primary metric.
    const metricComparison =
      comparison?.metric_comparison ||
      comparison?.metricComparison ||
      {};

    // The backend is the source of truth for the metric explaining the
    // acceptance decision. Keep a compatibility fallback for older runs.
    const backendDecisionMetric =
      comparison?.decision_metric ||
      comparison?.decisionMetric ||
      {};

    let summaryMetricKey =
      backendDecisionMetric?.key ||
      primaryMetric.key;

    if (!backendDecisionMetric?.key && comparison?.candidate_accepted === false) {
      if (comparison?.primary_metric_passed === false && primaryMetric.key) {
        summaryMetricKey = primaryMetric.key;
      } else {
        const failedMetric = Object.keys(metricComparison).find(
          (key) => metricComparison?.[key]?.improved === false
        );
        if (failedMetric) summaryMetricKey = failedMetric;
      }
    }

    // Normalize common aliases used by different model adapters.
    // Normalize metric aliases to the canonical keys used by
    // HIGHER_IS_BETTER_METRICS and METRIC_LABELS.
    if (summaryMetricKey === "f1") summaryMetricKey = "f1_score";
    if (
      summaryMetricKey === "r2_score" ||
      summaryMetricKey === "r2Score" ||
      summaryMetricKey === "r2score"
    ) {
      summaryMetricKey = "r2";
    }

    const summaryMetricCurrent =
      backendDecisionMetric?.current ??
      backendDecisionMetric?.current_value ??
      getMetricValue(currentMetrics, summaryMetricKey);
    const summaryMetricCandidate =
      backendDecisionMetric?.candidate ??
      backendDecisionMetric?.candidate_value ??
      getMetricValue(candidateMetrics, summaryMetricKey);

    const summaryMetric = {
      ...primaryMetric,
      key: summaryMetricKey,
      label:
        backendDecisionMetric?.label ||
        METRIC_LABELS[summaryMetricKey] ||
        (summaryMetricKey === "r2_score" ? "R²" :
          summaryMetricKey
            ? summaryMetricKey.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
            : "Primary Performance"),
      currentValue: summaryMetricCurrent,
      candidateValue: summaryMetricCandidate,
      decisionReason: backendDecisionMetric?.reason || null,
    };

    summaryMetric.currentValueFormatted =
      formatMetricValue(summaryMetric.currentValue, summaryMetric.key);
    summaryMetric.candidateValueFormatted =
      formatMetricValue(summaryMetric.candidateValue, summaryMetric.key);
    summaryMetric.changeLabel = getMetricChangeLabel(
      summaryMetric.key,
      getMetricImprovement(
        summaryMetric.currentValue,
        summaryMetric.candidateValue,
        summaryMetric.key
      )
    );

    const currentQuality =
      dataQuality?.current_quality ||
      {};

    const detectorResults =
      drift?.detector_results ||
      {};

    const rootCauseFeatures =
      rootCause?.top_features ||
      report?.root_cause_analysis
        ?.top_features ||
      [];

    const probableReasons =
      normalizeProbableReasons(
        rootCause?.probable_reasons ||
          report?.root_cause_analysis
            ?.probable_reasons ||
          []
      );

    const monitoringPeriod =
      getMonitoringPeriod();

    const actionVersion =
      getActionVersion(
        workflowResult
      );

    const reportStatus =
      workflowResult?.status ===
      "completed"
        ? "Completed"
        : "Awaiting workflow";

    const modelType =
      retraining?.model_type ||
      retraining?.modelType ||
      workflowResult?.model_type ||
      workflowResult?.modelType ||
      workflowResult?.action?.details
        ?.model_type ||
      workflowResult?.action?.details
        ?.modelType ||
      "Unknown Model";

    const workflowEventTime =
      getWorkflowEventTime(
        workflowResult
      );

    const reportDateSource =
      workflowResult?.action?.details
        ?.created_at ||
      workflowResult?.workflow_completed_at ||
      workflowResult?.completed_at ||
      new Date().toISOString();

    const reportDate =
      new Date(reportDateSource)
        .toISOString()
        .slice(0, 10)
        .replace(/-/g, "");

    return {
      reportId: workflowResult
        ? `DW-RPT-${reportDate}-${
            actionVersion || "RUN"
          }`
        : "DW-RPT-NOT-AVAILABLE",

      generated: generatedAt,

      model: formatModelName(
        modelType
      ),

      version:
        actionVersion || "Current",

      framework: getFrameworkName(
        workflowResult,
        modelType
      ),

      status: reportStatus,

      monitoringPeriod,

      drift: {
        detected: Boolean(
          drift?.drift_detected
        ),

        firstDetection:
          drift?.drift_detected
            ? workflowEventTime
            : "Not available",

        delay:
          drift?.detection_delay ||
          drift?.delay ||
          "Not recorded",

        adwin: getDetectorStatus(
          detectorResults,
          ["ADWIN"]
        ),

        ddm: getDetectorStatus(
          detectorResults,
          ["DDM"]
        ),

        pageHinkley:
          getDetectorStatus(
            detectorResults,
            [
              "PageHinkley",
              "Page-Hinkley",
            ]
          ),

        errors:
          drift?.prediction_errors ?? 0,
      },

      performance: {
        primaryMetric:
          primaryMetric.key,

        primaryMetricLabel:
          primaryMetric.label,

        primaryMetricValue:
          formatMetricValue(
            primaryMetric.currentValue,
            primaryMetric.key
          ),

        errors: formatNumber(
          drift?.prediction_errors
        ),
      },

      candidate: {
        primaryMetric:
          primaryMetric.key,

        primaryMetricLabel:
          primaryMetric.label,

        primaryMetricValue:
          formatMetricValue(
            primaryMetric.candidateValue,
            primaryMetric.key
          ),

        improvement:
          getMetricChangeLabel(
            primaryMetric.key,
            getMetricImprovement(
              primaryMetric.currentValue,
              primaryMetric.candidateValue,
              primaryMetric.key
            )
          ),
      },

      rootCauses:
        rootCauseFeatures
          .slice(0, 3)
          .map((item) => ({
            feature:
              item?.feature ||
              item?.name ||
              "Unknown feature",

            change:
              getRootCauseChange(item),

            description:
              getRootCauseDescription(
                item
              ),
          })),

      probableReasons,

      dataQuality: {
        status:
          dataQuality?.issues_detected
            ? "ISSUES DETECTED"
            : "NO ISSUES DETECTED",

        missingValues:
          getQualityMetric(
            currentQuality,
            [
              "missing_values",
              "missingValues",
            ]
          ),

        duplicateRecords:
          getQualityMetric(
            currentQuality,
            [
              "duplicate_rows",
              "duplicateRecords",
            ]
          ),

        infiniteValues:
          getQualityMetric(
            currentQuality,
            [
              "infinite_values",
              "infiniteValues",
            ]
          ),

        potentialOutliers:
          sumNumericObject(
            currentQuality?.outliers
          ),
      },

      comparison,

      decision:
        decision?.decision ||
        "Not recorded",

      action:
        action?.action ||
        "Not executed",

      actionStatus:
        action?.status ||
        "Not executed",

      candidateAccepted:
        comparison?.candidate_accepted,

      reportConclusion:
        report?.report_conclusion ||
        workflowResult?.report?.reasoning ||
        "The Report Agent has not produced a conclusion for the latest workflow.",

      llmUsed:
        workflowResult?.report?.llm_used ===
        true,

      trainingRows:
        retraining?.training_rows,

      validationRows:
        retraining?.validation_rows,

      detectorResults,

      currentMetrics,

      candidateMetrics,

      problemType:
        primaryMetric.problemType,

      primaryMetric,
      summaryMetric,
    };
  }, [
    workflowResult,
    generatedAt,
  ]);

  const hasWorkflow =
    Boolean(workflowResult);

  const scrollToTop = () => {
    reportTopRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const scrollToTimeline = () => {
    timelineRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const downloadReport = async () => {
    try {
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
        compress: true,
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const left = 17;
      const right = 17;
      const contentWidth = pageWidth - left - right;
      let y = 20;

      const clean = (value, fallback = "Not recorded") => {
        if (value === null || value === undefined || value === "") return fallback;
        if (typeof value === "object") return JSON.stringify(value);
        return String(value);
      };

      const ensureSpace = (height = 12) => {
        if (y + height > pageHeight - 18) {
          doc.addPage();
          y = 20;
        }
      };

      const addWrapped = (value, options = {}) => {
        const {
          size = 10,
          bold = false,
          color = [45, 55, 72],
          indent = 0,
          gap = 2,
        } = options;

        doc.setFont("helvetica", bold ? "bold" : "normal");
        doc.setFontSize(size);
        doc.setTextColor(...color);
        const lines = doc.splitTextToSize(
          clean(value),
          contentWidth - indent
        );
        const lineHeight = size * 0.48;
        ensureSpace(lines.length * lineHeight + gap);
        doc.text(lines, left + indent, y);
        y += lines.length * lineHeight + gap;
      };

      const addSection = (title) => {
        ensureSpace(17);
        y += 3;
        doc.setDrawColor(205, 218, 233);
        doc.setLineWidth(0.35);
        doc.line(left, y, pageWidth - right, y);
        y += 7;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.setTextColor(16, 35, 63);
        doc.text(title, left, y);
        y += 7;
      };

      const addLabelValue = (label, value) => {
        addWrapped(`${label}: ${clean(value)}`, { size: 9.5, gap: 1.5 });
      };

      const addBullet = (value) => {
        addWrapped(`- ${clean(value)}`, { size: 9.5, indent: 3, gap: 1.5 });
      };

      const addMetricTable = (rows) => {
        const columns = [
          { title: "Metric", x: left, width: 39 },
          { title: "Current", x: left + 39, width: 39 },
          { title: "Candidate", x: left + 78, width: 43 },
          { title: "Change", x: left + 121, width: contentWidth - 121 },
        ];
        const rowHeight = 8;

        ensureSpace((rows.length + 1) * rowHeight + 5);
        doc.setFillColor(237, 243, 250);
        doc.rect(left, y - 5, contentWidth, rowHeight, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(35, 52, 75);
        columns.forEach((column) => {
          doc.text(column.title, column.x + 2, y);
        });
        y += rowHeight;

        rows.forEach((row) => {
          ensureSpace(rowHeight + 2);
          doc.setDrawColor(225, 232, 241);
          doc.line(left, y - 4, pageWidth - right, y - 4);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8.2);
          doc.setTextColor(45, 55, 72);
          const values = [
            row.label,
            formatMetricValue(row.current, row.key),
            formatMetricValue(row.candidate, row.key),
            row.change,
          ];
          values.forEach((value, index) => {
            const text = doc.splitTextToSize(
              clean(value),
              columns[index].width - 4
            )[0];
            doc.text(text, columns[index].x + 2, y);
          });
          y += rowHeight;
        });
        y += 3;
      };

      // Cover/header
      doc.setFillColor(22, 119, 232);
      doc.rect(0, 0, pageWidth, 5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(22, 119, 232);
      doc.text("DRIFTWATCHER  |  ANALYTICAL REPORT", left, y);
      y += 10;

      doc.setFontSize(21);
      doc.setTextColor(16, 35, 63);
      doc.text("Model Evaluation &", left, y);
      y += 9;
      doc.text("Concept Drift Report", left, y);
      y += 7;

      addWrapped(
        "Evidence-based assessment of monitoring results, candidate model performance and deployment suitability.",
        { size: 9.5, color: [101, 116, 139], gap: 6 }
      );

      // Report metadata
      addLabelValue("Report ID", reportData.reportId);
      addLabelValue("Generated", reportData.generated);
      addLabelValue("Model / Framework", `${clean(reportData.model)} / ${clean(reportData.framework)}`);
      addLabelValue("Monitoring status", reportData.status);
      addLabelValue("Monitoring datasets", reportData.monitoringPeriod);
      addLabelValue("Task type", reportData.problemType);

      // 1. Executive assessment
      addSection("1. Executive Assessment");
      const decisionTitle =
        reportData.candidateAccepted === false
          ? "CANDIDATE REJECTED"
          : reportData.candidateAccepted === true
          ? "CANDIDATE ACCEPTED"
          : "CANDIDATE EVALUATION NOT AVAILABLE";
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(
        reportData.candidateAccepted === false ? 180 : 23,
        reportData.candidateAccepted === false ? 35 : 107,
        reportData.candidateAccepted === false ? 24 : 67
      );
      ensureSpace(9);
      doc.text(decisionTitle, left, y);
      y += 7;

      addWrapped(
        reportData.candidateAccepted === false
          ? "The retrained candidate did not satisfy the configured model acceptance checks. The current production model should therefore be retained."
          : reportData.candidateAccepted === true
          ? "The candidate satisfied the configured acceptance checks. Deployment status must be interpreted separately from evaluation acceptance."
          : "A reliable candidate decision is not available in the supplied workflow evidence. Do not infer acceptance or rejection.",
        { size: 9.5 }
      );
      addLabelValue("Monitoring outcome", reportData.drift.detected ? "Concept drift detected" : "No concept drift reported");
      addLabelValue("System decision", reportData.decision);
      addLabelValue("Action", `${reportData.action} (${reportData.actionStatus})`);

      // 2. Model comparison
      addSection("2. Current Model vs Candidate Model");
      addWrapped(
        "The following comparison uses the metrics supplied by the retraining workflow. Classification scores are generally better when higher. For regression, MAE, MSE and RMSE are better when lower, while R-squared is better when higher.",
        { size: 9.2 }
      );
      if (changeValues.length) {
        addMetricTable(changeValues);
      } else {
        addWrapped("Comparable current-model and candidate-model metrics were not available for this run.");
      }

      addWrapped(`Decision-relevant metric: ${clean(reportData.summaryMetric?.label)}.`, { bold: true, size: 9.5 });
      addLabelValue("Current model value", reportData.summaryMetric?.currentValueFormatted);
      addLabelValue("Candidate model value", reportData.summaryMetric?.candidateValueFormatted);
      addLabelValue("Observed change", reportData.summaryMetric?.changeLabel);
      if (reportData.summaryMetric?.decisionReason) {
        addWrapped(reportData.summaryMetric.decisionReason, { size: 9.2 });
      }

      // 3. Acceptance/rejection rationale
      addSection("3. Candidate Evaluation Rationale");
      if (reportData.candidateAccepted === false) {
        addWrapped(
          "The candidate was rejected because one or more configured acceptance conditions were not met. The decision-relevant metric below identifies the key comparison used to explain the decision."
        );
        addWrapped(
          `${clean(reportData.summaryMetric?.label)}: current model = ${clean(reportData.summaryMetric?.currentValueFormatted)}; candidate model = ${clean(reportData.summaryMetric?.candidateValueFormatted)}; change = ${clean(reportData.summaryMetric?.changeLabel)}.`,
          { bold: true }
        );
        addWrapped(
          reportData.summaryMetric?.decisionReason ||
          "The candidate did not pass the configured acceptance checks. The current model is retained to avoid replacing it with a candidate that fails the evaluation policy."
        );
      } else if (reportData.candidateAccepted === true) {
        addWrapped("The candidate passed the configured acceptance checks. Deployment should be confirmed separately using the recorded action status.");
      } else {
        addWrapped("The workflow did not provide a definitive candidate acceptance result. A model comparison should not be interpreted as deployment approval.");
      }

      if (Array.isArray(reportData.comparison?.rejection_reasons) && reportData.comparison.rejection_reasons.length) {
        addWrapped("Recorded rejection reasons:", { bold: true });
        reportData.comparison.rejection_reasons.forEach((reason) =>
          addBullet(typeof reason === "string" ? reason : reason.message || reason.reason || JSON.stringify(reason))
        );
      }
      if (reportData.comparison?.reason) {
        addWrapped(`Evaluation details: ${reportData.comparison.reason}`, { size: 9.2 });
      }

      // 4. Drift detection
      addSection("4. Concept Drift Detection");
      addLabelValue("Drift status", reportData.drift.detected ? "Drift detected" : "No drift detected");
      addLabelValue("Prediction errors", reportData.drift.errors);
      addLabelValue("First detection", reportData.drift.firstDetection);
      addWrapped("Detector outputs:", { bold: true });
      addLabelValue("ADWIN", reportData.drift.adwin);
      addLabelValue("DDM", reportData.drift.ddm);
      addLabelValue("Page-Hinkley", reportData.drift.pageHinkley);
      addWrapped(
        "Drift detector outputs describe changes in the monitored stream. They are separate from model evaluation metrics and do not, by themselves, determine candidate model acceptance.",
        { size: 8.8, color: [101, 116, 139] }
      );

      // 5. Root cause and data quality
      addSection("5. Root Cause & Data Quality Findings");
      if (reportData.rootCauses?.length) {
        reportData.rootCauses.forEach((item) =>
          addBullet(`${item.feature}: ${item.description} (change: ${item.change})`)
        );
      } else {
        addWrapped("No feature-level root-cause findings were recorded.");
      }
      if (reportData.probableReasons?.length) {
        addWrapped("Probable contributing factors:", { bold: true });
        reportData.probableReasons.forEach(addBullet);
      }
      addLabelValue("Data quality status", reportData.dataQuality.status);
      addLabelValue("Missing values", reportData.dataQuality.missingValues);
      addLabelValue("Duplicate records", reportData.dataQuality.duplicateRecords);
      addLabelValue("Infinite values", reportData.dataQuality.infiniteValues);
      addLabelValue("Potential outliers", reportData.dataQuality.potentialOutliers);

      // 6. Recommendation
      addSection("6. Recommendation & Next Steps");
      if (reportData.candidateAccepted === false) {
        [
          "Keep the current production model active; do not deploy the rejected candidate.",
          "Review the failed acceptance metric and its recorded rejection reason.",
          "Investigate detected drift and relevant feature or data-quality changes.",
          "Retrain and re-evaluate a new candidate using the configured validation policy before considering deployment.",
        ].forEach(addBullet);
      } else if (reportData.candidateAccepted === true) {
        [
          "Confirm deployment action status and the model registry version.",
          "Continue monitoring post-deployment model performance and drift signals.",
        ].forEach(addBullet);
      } else {
        addWrapped("Resolve missing evaluation evidence before making a model replacement decision.");
      }
      addWrapped(`Report Agent conclusion: ${clean(reportData.reportConclusion)}`, { size: 9.2 });

      // Consistent page footer and page numbers
      const pageCount = doc.getNumberOfPages();
      for (let page = 1; page <= pageCount; page += 1) {
        doc.setPage(page);
        doc.setDrawColor(210, 220, 232);
        doc.line(left, pageHeight - 13, pageWidth - right, pageHeight - 13);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(113, 128, 150);
        doc.text("DriftWatcher | Model Monitoring & Evaluation", left, pageHeight - 8);
        doc.text(`Page ${page} of ${pageCount}`, pageWidth - right, pageHeight - 8, { align: "right" });
      }

      doc.save(`${reportData.reportId || "DriftWatcher-Report"}.pdf`);
    } catch (error) {
      console.error("Failed to generate DriftWatcher PDF:", error);
      window.alert(
        `Unable to generate the report PDF. ${error?.message || "Please check the browser console and try again."}`
      );
    }
  };

  const refreshReport = () => {
    const latest =
      readWorkflowResult();

    if (latest) {
      setWorkflowResult(
        latest
      );

      setGeneratedAt(
        formatGeneratedTime()
      );

      return;
    }

    setGeneratedAt(
      formatGeneratedTime()
    );
  };

  const changeValues =
    getMetricRows(
      reportData.problemType,
      reportData.currentMetrics,
      reportData.candidateMetrics
    );

  const timelineEvents = [];

  if (reportData.drift.detected) {
    timelineEvents.push({
      type: "danger",

      time:
        reportData.drift
          .firstDetection,

      title:
        "Drift detected",

      description:
        "The Drift Detection Agent reported a drift condition.",
    });
  }

  const detectorEntries =
    Object.entries(
      reportData.detectorResults ||
        {}
    );

  detectorEntries
    .filter(
      ([, status]) =>
        String(status)
          .toLowerCase() ===
        "drift"
    )
    .slice(0, 2)
    .forEach(([name]) => {
      timelineEvents.push({
        type: "normal",

        time:
          reportData.drift
            .firstDetection,

        title:
          `${name} confirmation`,

        description:
          `${name} reported the drift condition.`,
      });
    });

  const hasCandidateMetrics =
    reportData.candidateMetrics &&
    Object.keys(
      reportData.candidateMetrics
    ).some(
      (key) =>
        getMetricValue(
          reportData.candidateMetrics,
          key
        ) !== undefined
    );

  if (
    reportData.candidateAccepted ===
      true ||
    hasCandidateMetrics
  ) {
    timelineEvents.push({
      type: "success",

      time:
        reportData.drift
          .firstDetection,

      title:
        "Retraining evaluation completed",

      description:
        `Candidate model evaluation completed with ${
          reportData.summaryMetric?.label ||
          "the selected evaluation metric"
        } of ${
          reportData.summaryMetric?.candidateValueFormatted ||
          "—"
        }.`,
    });
  }

  if (workflowResult?.decision) {
    timelineEvents.push({
      type:
        reportData.actionStatus ===
        "success"
          ? "success"
          : "normal",

      time:
        reportData.drift
          .firstDetection,

      title:
        reportData.actionStatus ===
        "success"
          ? "Decision and action completed"
          : "Decision recorded",

      description:
        `Decision: ${reportData.decision}. Action: ${reportData.action}.`,
    });
  }

  if (hasWorkflow) {
    timelineEvents.push({
      type: "success",

      time:
        reportData.generated,

      title:
        "Monitoring report generated",

      description:
        "The Report Agent summarized the latest completed workflow evidence.",
    });
  }

  return (
    <div
      className="app-shell"
      ref={reportTopRef}
    >
      <Sidebar />

      <main className="main-area">
        <Topbar title="Reports" />

        <section
          className="page-content"
          ref={reportExportRef}
        >
          <div
            className="reports-top-area"
            style={{
              display: "flex",
              flexDirection:
                "column",
              alignItems:
                "center",
              gap: "45px",
              marginTop: "45px",
              marginBottom:
                "36px",
            }}
          >
            <div
              className="page-header reports-page-header"
              style={{
                margin: 0,
                width: "100%",
                justifyContent:
                  "center",
              }}
            >
              <div className="reports-heading">
                <h1>Reports</h1>
              </div>
            </div>

            <div
              className="header-actions"
              style={{
                position: "static",
                margin: 0,
                display: "flex",
                gap: "12px",
              }}
            >
              <button
                className="secondary-btn"
                onClick={
                  scrollToTop
                }
              >
                <Eye size={17} />
                View Full Report
              </button>

              <button
                className="primary-btn"
                onClick={
                  downloadReport
                }
              >
                <Download size={17} />
                Download Report
              </button>
            </div>
          </div>

          <section className="report-header-card">
            <div className="report-title-area">
              <div className="report-icon">
                <FileText size={28} />
              </div>

              <div>
                <span className="section-label">
                  {reportData.llmUsed
                    ? "AI-GENERATED MONITORING REPORT"
                    : "EVIDENCE-BASED MONITORING REPORT"}
                </span>

                <h2>
                  Concept Drift & Model Adaptation Report
                </h2>

                <p>
                  Comprehensive analysis generated from the latest
                  DriftWatcher monitoring cycle.
                </p>
              </div>
            </div>

            <div className="report-status">
              {reportData.status ===
              "Completed" ? (
                <CheckCircle2 size={17} />
              ) : (
                <Clock size={17} />
              )}

              {reportData.status}
            </div>
          </section>

          <section className="report-meta-grid">
            <div className="report-meta-card">
              <span>
                Report ID
              </span>

              <strong>
                {reportData.reportId}
              </strong>
            </div>

            <div className="report-meta-card">
              <span>
                Generated
              </span>

              <strong>
                {reportData.generated}
              </strong>
            </div>

            <div className="report-meta-card">
              <span>
                Model
              </span>

              <strong>
                {reportData.model} —{" "}
                {reportData.version}
              </strong>
            </div>

            <div className="report-meta-card">
              <span>
                Monitoring Period
              </span>

              <strong>
                {reportData.monitoringPeriod}
              </strong>
            </div>
          </section>

          <section className="report-section">
            <div className="section-heading">
              <div>
                <h2>
                  Executive Summary
                </h2>

                <p>
                  Overall result of the latest monitoring cycle.
                </p>
              </div>

              <div
                className={`summary-status ${
                  reportData.drift.detected
                    ? "danger"
                    : "success"
                }`}
              >
                {reportData.drift.detected ? (
                  <AlertTriangle size={16} />
                ) : (
                  <CheckCircle2 size={16} />
                )}

                {reportData.drift.detected
                  ? "Drift Detected"
                  : "No Drift Detected"}
              </div>
            </div>

            <div className="summary-grid">
              <div className="summary-card">
                <div className="summary-card-icon blue">
                  <Activity size={21} />
                </div>

                <span>
                  Current Model{" "}
                  {reportData.summaryMetric.label}
                </span>

                <strong>
                  {
                    reportData.summaryMetric
                      .currentValueFormatted
                  }
                </strong>

                <small>
                  Latest workflow evaluation
                </small>
              </div>

              <div className="summary-card">
                <div className="summary-card-icon orange">
                  <AlertTriangle size={21} />
                </div>

                <span>
                  Prediction Errors
                </span>

                <strong>
                  {
                    reportData.performance
                      .errors
                  }
                </strong>

                <small>
                  Recorded by drift monitoring
                </small>
              </div>

              <div className="summary-card">
                <div className="summary-card-icon purple">
                  <Brain size={21} />
                </div>

                <span>
                  Candidate{" "}
                  {reportData.summaryMetric.label}
                </span>

                <strong>
                  {
                    reportData.summaryMetric
                      .candidateValueFormatted
                  }
                </strong>

                <small>
                  After automated retraining
                </small>
              </div>

              <div className="summary-card">
                <div
                  className={`summary-card-icon ${
                    Number.parseFloat(reportData.summaryMetric.changeLabel) < 0
                      ? "orange"
                      : "green"
                  }`}
                >
                  {Number.parseFloat(reportData.summaryMetric.changeLabel) < 0 ? (
                    <TrendingDown size={21} />
                  ) : (
                    <TrendingUp size={21} />
                  )}
                </div>

                <span>
                  {reportData.summaryMetric.label}{" "}
                  Change
                </span>

                <strong>
                  {
                    reportData.summaryMetric
                      .changeLabel
                  }
                </strong>

                <small>
                  Candidate vs current model
                </small>
              </div>
            </div>

            <div
              className="candidate-decision-summary"
              role="status"
              style={{
                marginTop: "18px",
                padding: "16px 18px",
                borderRadius: "12px",
                border: `1px solid ${
                  reportData.candidateAccepted === true
                    ? "#b7e4c7"
                    : reportData.candidateAccepted === false
                    ? "#f2c6c6"
                    : "#dbe3ee"
                }`,
                background:
                  reportData.candidateAccepted === true
                    ? "#f0faf4"
                    : reportData.candidateAccepted === false
                    ? "#fff5f5"
                    : "#f7f9fc",
                color:
                  reportData.candidateAccepted === true
                    ? "#176b3a"
                    : reportData.candidateAccepted === false
                    ? "#a12626"
                    : "#536174",
              }}
            >
              <strong style={{ display: "block", marginBottom: "5px" }}>
                {reportData.candidateAccepted === false
                  ? "Candidate Rejected"
                  : `Candidate Evaluation: ${
                      reportData.candidateAccepted === true
                        ? reportData.action === "MODEL_DEPLOYED" &&
                          reportData.actionStatus === "success"
                          ? "ACCEPTED & DEPLOYED"
                          : "ACCEPTED"
                        : "NOT EVALUATED"
                    }`}
              </strong>

              <span style={{ lineHeight: "1.5" }}>
                {reportData.candidateAccepted === true
                  ? reportData.action === "MODEL_DEPLOYED" &&
                    reportData.actionStatus === "success"
                    ? "The candidate passed the acceptance checks and the deployment action completed successfully."
                    : "The candidate passed the acceptance checks. A successful deployment is not confirmed by this workflow result."
                  : reportData.candidateAccepted === false
                  ? "The candidate did not pass the acceptance checks. It must not replace the current production model."
                  : "No candidate acceptance decision is available for this workflow. Candidate metrics alone do not mean the model was accepted or deployed."}
              </span>
            </div>
          </section>

          <section className="report-section">
            <div className="section-heading">
              <div>
                <h2>
                  Drift Detection Summary
                </h2>

                <p>
                  Results from the statistical drift detection layer.
                </p>
              </div>

              <span
                className={`status-badge ${
                  reportData.drift.detected
                    ? "danger-badge"
                    : "success-badge"
                }`}
              >
                {reportData.drift.detected
                  ? "DRIFT DETECTED"
                  : "NO DRIFT"}
              </span>
            </div>

            <div className="drift-report-grid">
              {[
                [
                  "ADWIN",
                  reportData.drift.adwin,
                ],
                [
                  "DDM",
                  reportData.drift.ddm,
                ],
                [
                  "Page-Hinkley",
                  reportData.drift.pageHinkley,
                ],
              ].map(
                ([name, status]) => (
                  <div
                    className="detector-card"
                    key={name}
                  >
                    <div>
                      <ShieldCheck size={21} />

                      <strong>
                        {name}
                      </strong>
                    </div>

                    <span
                      className={`detector-status ${
                        String(status)
                          .toLowerCase() ===
                        "drift"
                          ? "danger"
                          : "success"
                      }`}
                    >
                      {status}
                    </span>
                  </div>
                )
              )}
            </div>

            <div className="drift-details">
              <div>
                <Clock size={18} />

                <span>
                  First Detection
                </span>

                <strong>
                  {
                    reportData.drift
                      .firstDetection
                  }
                </strong>
              </div>

              <div>
                <Activity size={18} />

                <span>
                  Detection Delay
                </span>

                <strong>
                  {
                    reportData.drift.delay
                  }
                </strong>
              </div>

              <div>
                <Database size={18} />

                <span>
                  Monitoring Signal
                </span>

                <strong>
                  Prediction errors
                </strong>
              </div>
            </div>
          </section>

          <section className="report-section">
            <div className="section-heading">
              <div>
                <h2>
                  Model Performance
                </h2>

                <p>
                  Current production model compared with the retrained
                  candidate.
                </p>
              </div>
            </div>

            <div className="performance-table-wrapper">
              <table className="performance-table">
                <thead>
                  <tr>
                    <th>
                      Metric
                    </th>

                    <th>
                      Current Model
                    </th>

                    <th>
                      Candidate Model
                    </th>

                    <th>
                      Change
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {changeValues.map(
                    (item) => (
                      <tr
                        key={
                          item.label
                        }
                      >
                        <td>
                          {item.label}
                        </td>

                        <td>
                          {formatMetricValue(
                            item.current,
                            item.key
                          )}
                        </td>

                        <td>
                          {formatMetricValue(
                            item.candidate,
                            item.key
                          )}
                        </td>

                        <td
                          className={
                            item.change ===
                            null
                              ? ""
                              : (
                                  item.higherIsBetter
                                    ? item.change >= 0
                                    : item.change <= 0
                                )
                              ? "positive"
                              : "negative"
                          }
                        >
                          {getMetricChangeLabel(
                            item.key,
                            item.change
                          )}
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <div className="report-two-column">
            <section className="report-section">
              <div className="section-heading">
                <div>
                  <h2>
                    Root Cause Analysis
                  </h2>

                  <p>
                    Most significant feature-level changes.
                  </p>
                </div>
              </div>

              <div className="root-cause-list">
                {reportData.rootCauses
                  .length > 0 ? (
                  reportData.rootCauses.map(
                    (
                      item,
                      index
                    ) => (
                      <div
                        className="root-cause-item"
                        key={`${item.feature}-${index}`}
                      >
                        <div className="root-cause-number">
                          {index + 1}
                        </div>

                        <div className="root-cause-content">
                          <strong>
                            {
                              item.feature
                            }
                          </strong>

                          <span>
                            {
                              item.description
                            }
                          </span>
                        </div>

                        <div className="root-cause-change">
                          {
                            item.change
                          }

                          <ArrowUpRight
                            size={15}
                          />
                        </div>
                      </div>
                    )
                  )
                ) : (
                  <div className="root-cause-item">
                    <div className="root-cause-content">
                      <strong>
                        No root-cause features recorded
                      </strong>

                      <span>
                        Run the DriftWatcher workflow to populate this section.
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div
                className="probable-reasons"
                style={{
                  marginTop:
                    "22px",

                  paddingTop:
                    "18px",

                  borderTop:
                    "1px solid #e8edf5",
                }}
              >
                <h4
                  style={{
                    marginBottom:
                      "12px",
                  }}
                >
                  Probable Reasons
                </h4>

                <ul
                  style={{
                    margin: 0,
                    paddingLeft:
                      "20px",
                  }}
                >
                  {reportData
                    .probableReasons
                    .length > 0 ? (
                    reportData.probableReasons.map(
                      (
                        reason,
                        index
                      ) => (
                        <li
                          key={
                            index
                          }
                          style={{
                            marginBottom:
                              "8px",

                            lineHeight:
                              "1.5",
                          }}
                        >
                          {reason}
                        </li>
                      )
                    )
                  ) : (
                    <li>
                      No probable reasons recorded.
                    </li>
                  )}
                </ul>
              </div>
            </section>

          </div>

          <section className="report-section">
            <div className="section-heading">
              <div>
                <h2>
                  Retraining & Evaluation
                </h2>

                <p>
                  Retraining evaluation and candidate-model comparison
                  performed by DriftWatcher.
                </p>
              </div>

              <span
                className={`status-badge ${
                  reportData.candidateAccepted ===
                  true
                    ? "success-badge"
                    : hasCandidateMetrics
                    ? "warning-badge"
                    : "warning-badge"
                }`}
              >
                {reportData.candidateAccepted ===
                true
                  ? "CANDIDATE ACCEPTED"
                  : hasCandidateMetrics
                  ? "EVALUATION COMPLETED"
                  : "AWAITING EVALUATION"}
              </span>
            </div>

            <div className="lifecycle">
              <div
                className={`lifecycle-step ${
                  reportData.drift.detected
                    ? "completed"
                    : ""
                }`}
              >
                <div className="lifecycle-icon">
                  <AlertTriangle
                    size={18}
                  />
                </div>

                <strong>
                  Drift Detected
                </strong>

                <span>
                  {reportData.drift
                    .detected
                    ? "Drift detection evidence available"
                    : "No drift recorded"}
                </span>
              </div>

              <div
                className={`lifecycle-line ${
                  reportData.drift.detected
                    ? "completed-line"
                    : ""
                }`}
              />

              <div
                className={`lifecycle-step ${
                  hasCandidateMetrics
                    ? "completed"
                    : ""
                }`}
              >
                <div className="lifecycle-icon">
                  <RefreshCw
                    size={18}
                  />
                </div>

                <strong>
                  Retrained
                </strong>

                <span>
                  {formatModelName(
                    reportData.model
                  )}{" "}
                  candidate
                </span>
              </div>

              <div
                className={`lifecycle-line ${
                  hasCandidateMetrics
                    ? "completed-line"
                    : ""
                }`}
              />

              <div
                className={`lifecycle-step ${
                  hasCandidateMetrics
                    ? "completed"
                    : ""
                }`}
              >
                <div className="lifecycle-icon">
                  <CheckCircle2
                    size={18}
                  />
                </div>

                <strong>
                  Evaluated
                </strong>

                <span>
                  {reportData.summaryMetric.label}:{" "}
                  {reportData.summaryMetric.candidateValueFormatted}
                </span>
              </div>

              <div
                className={`lifecycle-line ${
                  hasCandidateMetrics
                    ? "completed-line"
                    : ""
                }`}
              />

              <div
                className={`lifecycle-step ${
                  reportData.actionStatus ===
                  "success"
                    ? "completed"
                    : workflowResult?.decision
                    ? ""
                    : ""
                }`}
              >
                <div className="lifecycle-icon">
                  <Server size={18} />
                </div>

                <strong>
                  Decision & Action
                </strong>

                <span>
                  {
                    reportData.decision
                  }{" "}
                  →{" "}
                  {
                    reportData.action
                  }
                </span>
              </div>
            </div>
          </section>

          <section className="ai-report-card">
            <div className="ai-report-header">
              <div className="ai-report-title">
                <div className="ai-report-icon">
                  <Brain size={23} />
                </div>

                <div>
                  <span>
                    REPORT AGENT
                  </span>

                  <h2>
                    AI-Generated Analysis
                  </h2>
                </div>
              </div>

              <span className="ai-powered">
                {reportData.llmUsed
                  ? "AI Powered"
                  : "Evidence Based"}
              </span>
            </div>

            <p>
              {
                reportData
                  .reportConclusion
              }
            </p>

            <p>
              Final system decision:
              {" "}
              <strong>
                {
                  reportData.decision
                }
              </strong>
              {" "}
              | Action:
              {" "}
              <strong>
                {
                  reportData.action
                }
              </strong>
              {" "}
              | Status:
              {" "}
              <strong>
                {
                  reportData.actionStatus
                }
              </strong>
            </p>
          </section>

          <section
            className="report-section"
            ref={timelineRef}
          >
            <div className="section-heading">
              <div>
                <h2>
                  Drift Timeline
                </h2>

                <p>
                  Major events from detection through evaluation.
                </p>
              </div>
            </div>

            <div className="timeline">
              {timelineEvents.length >
              0 ? (
                timelineEvents.map(
                  (
                    event,
                    index
                  ) => (
                    <div
                      className="timeline-item"
                      key={`${event.title}-${index}`}
                    >
                      <div
                        className={`timeline-dot ${
                          event.type ===
                          "danger"
                            ? "danger-dot"
                            : event.type ===
                              "success"
                            ? "success-dot"
                            : ""
                        }`}
                      />

                      <div>
                        <span>
                          {
                            event.time
                          }
                        </span>

                        <strong>
                          {
                            event.title
                          }
                        </strong>

                        <p>
                          {
                            event.description
                          }
                        </p>
                      </div>
                    </div>
                  )
                )
              ) : (
                <div className="timeline-item">
                  <div className="timeline-dot" />

                  <div>
                    <span>
                      Waiting
                    </span>

                    <strong>
                      No workflow timeline available
                    </strong>

                    <p>
                      Run the DriftWatcher workflow to generate report events.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Dedicated analytical PDF document. This is intentionally
              separate from the on-screen dashboard UI. */}
          <div
            ref={reportPdfRef}
            style={{
              position: "fixed",
              left: "-10000px",
              top: 0,
              width: "794px",
              background: "#ffffff",
              color: "#172033",
              padding: "42px 48px",
              boxSizing: "border-box",
              fontFamily: "Arial, Helvetica, sans-serif",
              fontSize: "12px",
              lineHeight: 1.55,
              zIndex: -1,
            }}
          >
            <div style={{ borderBottom: "4px solid #1677e8", paddingBottom: 18, marginBottom: 22 }}>
              <div style={{ color: "#1677e8", fontSize: 11, fontWeight: 700, letterSpacing: 2 }}>DRIFTWATCHER · ANALYTICAL REPORT</div>
              <h1 style={{ fontSize: 27, lineHeight: 1.2, margin: "9px 0 6px", color: "#10233f" }}>Model Evaluation & Concept Drift Report</h1>
              <p style={{ margin: 0, color: "#65748b", fontSize: 12 }}>Evidence-based assessment of monitoring results, candidate model performance and deployment suitability.</p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 22 }}>
              {[
                ["Report ID", reportData.reportId],
                ["Generated", reportData.generated],
                ["Model / Framework", `${reportData.model} · ${reportData.framework}`],
                ["Monitoring status", reportData.status],
                ["Monitoring datasets", reportData.monitoringPeriod],
                ["Task type", reportData.problemType || "Not recorded"],
              ].map(([label, value]) => (
                <div key={label} style={{ border: "1px solid #dce5f0", borderRadius: 7, padding: "9px 11px", minHeight: 42 }}>
                  <div style={{ color: "#718096", fontSize: 9, textTransform: "uppercase", letterSpacing: 0.8 }}>{label}</div>
                  <div style={{ color: "#172033", fontWeight: 700, marginTop: 3, overflowWrap: "anywhere" }}>{value || "Not recorded"}</div>
                </div>
              ))}
            </div>

            <section className="pdf-no-break" style={{ marginBottom: 22 }}>
              <h2 style={{ fontSize: 17, color: "#10233f", borderBottom: "1px solid #dce5f0", paddingBottom: 7 }}>1. Executive Assessment</h2>
              <div style={{ background: reportData.candidateAccepted === false ? "#fff4f2" : reportData.candidateAccepted === true ? "#effaf4" : "#f3f6fa", border: `1px solid ${reportData.candidateAccepted === false ? "#f3b6ae" : "#dce5f0"}`, borderRadius: 8, padding: 14 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: reportData.candidateAccepted === false ? "#b42318" : "#176b43" }}>
                  {reportData.candidateAccepted === false ? "Candidate Rejected" : reportData.candidateAccepted === true ? "Candidate Accepted" : "Candidate Evaluation Not Available"}
                </div>
                <p style={{ margin: "7px 0 0" }}>
                  {reportData.candidateAccepted === false
                    ? "The retrained candidate did not satisfy the configured model acceptance checks. The current production model should therefore be retained."
                    : reportData.candidateAccepted === true
                    ? "The candidate satisfied the configured acceptance checks. Deployment status must be interpreted separately from evaluation acceptance."
                    : "A reliable candidate decision is not available in the supplied workflow evidence. Do not infer acceptance or rejection."}
                </p>
              </div>
              <p style={{ margin: "10px 0 0" }}><b>Monitoring outcome:</b> {reportData.drift.detected ? "Concept drift was detected in the monitored data stream." : "No concept drift was reported by the monitoring workflow."} <b>System decision:</b> {reportData.decision}. <b>Action status:</b> {reportData.actionStatus} ({reportData.action}).</p>
            </section>

            <section className="pdf-no-break" style={{ marginBottom: 22 }}>
              <h2 style={{ fontSize: 17, color: "#10233f", borderBottom: "1px solid #dce5f0", paddingBottom: 7 }}>2. Current Model vs Candidate Model</h2>
              <p style={{ marginTop: 0 }}>The table compares the metrics actually supplied by the retraining workflow. For classification, higher values are generally preferable; for regression, error metrics such as MAE, MSE and RMSE are better when lower, while R² is better when higher.</p>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead><tr style={{ background: "#edf3fa" }}>
                  {["Metric", "Current model", "Candidate model", "Change"].map((heading) => <th key={heading} style={{ textAlign: "left", padding: 9, border: "1px solid #dce5f0" }}>{heading}</th>)}
                </tr></thead>
                <tbody>
                  {changeValues.length ? changeValues.map((metric) => (
                    <tr key={metric.key}>
                      <td style={{ padding: 9, border: "1px solid #dce5f0", fontWeight: 700 }}>{metric.label}</td>
                      <td style={{ padding: 9, border: "1px solid #dce5f0" }}>{formatMetricValue(metric.current, metric.key)}</td>
                      <td style={{ padding: 9, border: "1px solid #dce5f0" }}>{formatMetricValue(metric.candidate, metric.key)}</td>
                      <td style={{ padding: 9, border: "1px solid #dce5f0" }}>{metric.change}</td>
                    </tr>
                  )) : <tr><td colSpan="4" style={{ padding: 10, border: "1px solid #dce5f0" }}>Comparable model metrics were not available for this run.</td></tr>}
                </tbody>
              </table>
              <div style={{ marginTop: 12, padding: 11, background: "#f4f7fb", borderRadius: 7 }}>
                <b>Decision-relevant metric: {reportData.summaryMetric.label}</b><br />
                Current model: {reportData.summaryMetric.currentValueFormatted} · Candidate model: {reportData.summaryMetric.candidateValueFormatted} · Change: {reportData.summaryMetric.changeLabel}
                {reportData.summaryMetric.decisionReason ? <p style={{ margin: "6px 0 0" }}>{reportData.summaryMetric.decisionReason}</p> : null}
              </div>
            </section>

            <section className="pdf-no-break" style={{ marginBottom: 22 }}>
              <h2 style={{ fontSize: 17, color: "#10233f", borderBottom: "1px solid #dce5f0", paddingBottom: 7 }}>3. Why Was the Candidate Accepted or Rejected?</h2>
              {reportData.candidateAccepted === false ? (
                <>
                  <p>The candidate was rejected because one or more configured acceptance conditions were not met. The selected decision metric below identifies the key comparison used to explain the decision.</p>
                  <p><b>{reportData.summaryMetric.label}:</b> current model = {reportData.summaryMetric.currentValueFormatted}; candidate model = {reportData.summaryMetric.candidateValueFormatted}; observed change = {reportData.summaryMetric.changeLabel}.</p>
                  <p>{reportData.summaryMetric.decisionReason || "The candidate did not pass the configured acceptance checks. The current model is retained to avoid replacing it with a candidate that fails the evaluation policy."}</p>
                </>
              ) : reportData.candidateAccepted === true ? (
                <p>The candidate passed the configured acceptance checks. The evaluation supports considering the candidate for deployment, but successful deployment is confirmed only by the separate action status.</p>
              ) : (
                <p>The workflow did not provide a definitive candidate acceptance result. A model comparison should not be interpreted as a deployment approval.</p>
              )}
              {Array.isArray(reportData.comparison?.rejection_reasons) && reportData.comparison.rejection_reasons.length > 0 ? (
                <ul style={{ paddingLeft: 20 }}>{reportData.comparison.rejection_reasons.map((reason, index) => <li key={index} style={{ marginBottom: 4 }}>{typeof reason === "string" ? reason : reason.message || reason.reason || JSON.stringify(reason)}</li>)}</ul>
              ) : null}
              {reportData.comparison?.reason ? <p><b>Evaluation details:</b> {reportData.comparison.reason}</p> : null}
            </section>

            <section className="pdf-no-break" style={{ marginBottom: 22 }}>
              <h2 style={{ fontSize: 17, color: "#10233f", borderBottom: "1px solid #dce5f0", paddingBottom: 7 }}>4. Concept Drift Detection</h2>
              <p><b>Drift status:</b> {reportData.drift.detected ? "Drift detected" : "No drift detected"}. <b>Prediction errors:</b> {reportData.drift.errors}. <b>First detection:</b> {reportData.drift.firstDetection}.</p>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead><tr style={{ background: "#edf3fa" }}><th style={{ textAlign: "left", padding: 8, border: "1px solid #dce5f0" }}>Detector</th><th style={{ textAlign: "left", padding: 8, border: "1px solid #dce5f0" }}>Reported status</th></tr></thead>
                <tbody>{[["ADWIN", reportData.drift.adwin], ["DDM", reportData.drift.ddm], ["Page-Hinkley", reportData.drift.pageHinkley]].map(([name, status]) => <tr key={name}><td style={{ padding: 8, border: "1px solid #dce5f0" }}>{name}</td><td style={{ padding: 8, border: "1px solid #dce5f0" }}>{status || "Not recorded"}</td></tr>)}</tbody>
              </table>
              <p style={{ color: "#65748b", fontSize: 10 }}>Drift detector outputs describe changes in the monitored stream. They are separate from model evaluation metrics and do not, by themselves, determine candidate model acceptance.</p>
            </section>

            <section className="pdf-no-break" style={{ marginBottom: 22 }}>
              <h2 style={{ fontSize: 17, color: "#10233f", borderBottom: "1px solid #dce5f0", paddingBottom: 7 }}>5. Root Cause & Data Quality Findings</h2>
              {reportData.rootCauses.length ? <ul style={{ paddingLeft: 20 }}>{reportData.rootCauses.map((item, index) => <li key={index} style={{ marginBottom: 5 }}><b>{item.feature}</b> — {item.description} (change: {item.change})</li>)}</ul> : <p>No feature-level root-cause findings were recorded.</p>}
              {reportData.probableReasons.length ? <><b>Probable contributing factors</b><ul style={{ paddingLeft: 20 }}>{reportData.probableReasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul></> : null}
              <p><b>Data quality status:</b> {reportData.dataQuality.status}. Missing values: {reportData.dataQuality.missingValues}; duplicate records: {reportData.dataQuality.duplicateRecords}; infinite values: {reportData.dataQuality.infiniteValues}; potential outliers: {reportData.dataQuality.potentialOutliers}.</p>
            </section>

            <section className="pdf-no-break" style={{ marginBottom: 22 }}>
              <h2 style={{ fontSize: 17, color: "#10233f", borderBottom: "1px solid #dce5f0", paddingBottom: 7 }}>6. Recommendation & Next Steps</h2>
              {reportData.candidateAccepted === false ? (
                <ol style={{ paddingLeft: 20 }}>
                  <li>Keep the current production model active; do not deploy the rejected candidate.</li>
                  <li>Review the failed acceptance metric and the associated rejection reason.</li>
                  <li>Investigate the detected drift and relevant feature/data-quality changes.</li>
                  <li>Retrain and re-evaluate a new candidate using the same validation policy before considering deployment.</li>
                </ol>
              ) : reportData.candidateAccepted === true ? (
                <ol style={{ paddingLeft: 20 }}><li>Confirm deployment action status and model registry version.</li><li>Continue monitoring post-deployment performance and drift signals.</li></ol>
              ) : <p>Resolve missing evaluation evidence before making a model replacement decision.</p>}
              <p><b>Report Agent conclusion:</b> {reportData.reportConclusion}</p>
            </section>

            <div style={{ borderTop: "2px solid #1677e8", paddingTop: 12, marginTop: 24, color: "#718096", fontSize: 9 }}>
              <b style={{ color: "#1677e8" }}>DriftWatcher</b> · Automated model monitoring and evaluation report<br />
              This document summarizes the evidence available in the selected workflow run. Missing or unavailable values are shown as not recorded; no metric or cause is inferred beyond the supplied evidence.
            </div>
          </div>

          <section className="report-actions">
            <button
              className="secondary-btn"
              onClick={
                downloadReport
              }
            >
              <Download size={17} />
              Export PDF
            </button>

            <button
              className="secondary-btn"
              onClick={
                refreshReport
              }
            >
              <FileText size={17} />
              Refresh Report
            </button>

            <button
              className="primary-btn"
              onClick={
                scrollToTimeline
              }
            >
              <Eye size={17} />
              View Drift Timeline
            </button>
          </section>
        </section>
      </main>
    </div>
  );
}

export default Reports;