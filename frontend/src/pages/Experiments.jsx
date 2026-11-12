import { useEffect, useMemo, useState } from "react";

import {

  FlaskConical,

  CheckCircle2,

  Clock3,

  BarChart3,

  ArrowUpRight,

  ArrowDownRight,

  Database,

  Brain,

  CalendarDays,

  Trash2,

} from "lucide-react";

import Sidebar from "../components/Sidebar";

import Topbar from "../components/Topbar";

import "../App.css";

const WORKFLOW_STORAGE_KEY = "driftwatcher.workflowResult";

const EXPERIMENT_HISTORY_KEY = "driftwatcher.experimentHistory";

const DISMISSED_EXPERIMENT_KEYS = "driftwatcher.dismissedExperimentKeys";

const readDismissedExperimentKeys = () => {
  try {
    const raw = localStorage.getItem(DISMISSED_EXPERIMENT_KEYS);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Failed to read dismissed experiment keys:", error);
    return [];
  }
};

const EXPERIMENT_HISTORY_VERSION_KEY =

  "driftwatcher.experimentHistoryVersion";

const EXPERIMENT_HISTORY_VERSION = "2";

const WORKFLOW_RECORDED_AT_FIELD =

  "__driftwatcher_experiment_recorded_at";

const readWorkflowResult = () => {

  try {

    if (window.__driftWatcherWorkflowResult) {

      return window.__driftWatcherWorkflowResult;

    }

    const raw = localStorage.getItem(WORKFLOW_STORAGE_KEY);

    return raw ? JSON.parse(raw) : null;

  } catch (error) {

    console.error("Failed to read DriftWatcher workflow result:", error);

    return null;

  }

};

const readExperimentHistory = () => {

  try {

    const version = localStorage.getItem(

      EXPERIMENT_HISTORY_VERSION_KEY

    );

    if (version !== EXPERIMENT_HISTORY_VERSION) {

      localStorage.setItem(

        EXPERIMENT_HISTORY_VERSION_KEY,

        EXPERIMENT_HISTORY_VERSION

      );

      localStorage.removeItem(EXPERIMENT_HISTORY_KEY);

      return [];

    }

    const raw = localStorage.getItem(EXPERIMENT_HISTORY_KEY);

    const parsed = raw ? JSON.parse(raw) : [];

    if (!Array.isArray(parsed)) {

      return [];

    }

    /*

     * Remove duplicate browser-side records representing the

     * same workflow execution.

     *

     * Existing history is stored newest-first, so the first

     * occurrence is retained.

     */

    const seen = new Set();

    const deduplicated = parsed.filter((item) => {

      if (!item || typeof item !== "object") {

        return false;

      }

      const identity =

        item.key ||

        (item.timestamp

          ? `timestamp:${item.timestamp}`

          : null);

      if (!identity) {

        return true;

      }

      if (seen.has(identity)) {

        return false;

      }

      seen.add(identity);

      return true;

    });

    if (deduplicated.length !== parsed.length) {

      localStorage.setItem(

        EXPERIMENT_HISTORY_KEY,

        JSON.stringify(deduplicated)

      );

    }

    return deduplicated;

  } catch (error) {

    console.error("Failed to read experiment history:", error);

    return [];

  }

};

const saveExperimentHistory = (history) => {

  try {

    localStorage.setItem(

      EXPERIMENT_HISTORY_KEY,

      JSON.stringify(history)

    );

  } catch (error) {

    console.error("Failed to save experiment history:", error);

  }

};

const getNestedRetraining = (workflowResult) => {

  const wrapper = workflowResult?.retraining || {};

  return wrapper?.retraining_result || wrapper || {};

};

const getCurrentMetrics = (workflowResult) => {

  const retraining = getNestedRetraining(workflowResult);

  return {

    ...(retraining?.current_metrics || {}),

    ...(workflowResult?.current_metrics || {}),

  };

};

const getCandidateMetrics = (workflowResult) => {

  const retraining = getNestedRetraining(workflowResult);

  return {

    ...(retraining?.candidate_metrics || {}),

    ...(workflowResult?.candidate_metrics || {}),

  };

};

const getComparison = (workflowResult) => {

  const retraining = getNestedRetraining(workflowResult);

  return (

    workflowResult?.comparison ||

    retraining?.comparison ||

    {}

  );

};

const METRIC_LABELS = {

  accuracy: "Accuracy",

  precision: "Precision",

  recall: "Recall",

  f1_score: "F1 Score",

  mae: "MAE",

  mse: "MSE",

  rmse: "RMSE",

  r2_score: "R²",

};

const METRIC_ALIASES = {

  accuracy: ["accuracy"],

  precision: ["precision"],

  recall: ["recall"],

  f1_score: ["f1_score", "f1"],

  mae: ["mae"],

  mse: ["mse"],

  rmse: ["rmse"],

  r2_score: ["r2_score", "r2"],

};

const PERCENT_METRICS = new Set([

  "accuracy",

  "precision",

  "recall",

  "f1_score",

]);

const HIGHER_IS_BETTER = new Set([

  "accuracy",

  "precision",

  "recall",

  "f1_score",

  "r2_score",

]);

const normalizeMetricName = (value) => {

  if (!value) return null;

  const normalized = String(value)

    .trim()

    .toLowerCase()

    .replace(/[\s-]+/g, "_");

  if (normalized === "f1") {

    return "f1_score";

  }

  if (normalized === "r2") {

    return "r2_score";

  }

  return Object.prototype.hasOwnProperty.call(

    METRIC_ALIASES,

    normalized

  )

    ? normalized

    : null;

};

const getMetricValue = (metrics, metric) => {

  const normalizedMetric = normalizeMetricName(metric);

  if (!normalizedMetric || !metrics) {

    return undefined;

  }

  for (const key of METRIC_ALIASES[normalizedMetric]) {

    if (

      metrics[key] !== undefined &&

      metrics[key] !== null

    ) {

      return metrics[key];

    }

  }

  return undefined;

};

const getMetricLabel = (metric) =>

  METRIC_LABELS[normalizeMetricName(metric)] ||

  "Primary Metric";

const formatMetricValue = (value, metric) => {

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

  return PERCENT_METRICS.has(

    normalizeMetricName(metric)

  )

    ? `${(numeric * 100).toFixed(2)}%`

    : numeric.toFixed(4);

};

const formatNumber = (value) => {

  if (

    value === null ||

    value === undefined ||

    value === ""

  ) {

    return "0";

  }

  const numeric = Number(value);

  return Number.isNaN(numeric)

    ? String(value)

    : numeric.toLocaleString();

};

const formatModelName = (value) => {

  if (

    !value ||

    String(value).toLowerCase() === "unknown"

  ) {

    return "Unknown Model";

  }

  return String(value)

    .replace(/_/g, " ")

    .replace(/\b\w/g, (char) => char.toUpperCase());

};

const cleanFilename = (value) => {

  if (!value) {

    return "Not recorded";

  }

  const normalized = String(value);

  const parts = normalized.split(/[\\/]/);

  return parts[parts.length - 1] || normalized;

};

const formatDateTime = (value) => {

  if (!value) {

    return "Latest workflow";

  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime())

    ? String(value)

    : parsed.toLocaleString();

};

const getPrimaryMetric = (

  workflowResult,

  currentMetrics,

  candidateMetrics

) => {

  const retraining = getNestedRetraining(workflowResult);

  const comparison = getComparison(workflowResult);

  const explicitCandidates = [

    comparison?.primary_metric,

    retraining?.primary_metric,

    workflowResult?.primary_metric,

    workflowResult?.retraining?.primary_metric,

  ];

  for (const candidate of explicitCandidates) {

    const normalized = normalizeMetricName(candidate);

    if (normalized) {

      return normalized;

    }

  }

  const problemType = String(

    retraining?.problem_type ||

      workflowResult?.problem_type ||

      ""

  ).toLowerCase();

  const fallbackOrder =

    problemType === "regression"

      ? ["rmse", "r2_score", "mae", "mse"]

      : ["recall", "f1_score", "accuracy", "precision"];

  for (const metric of fallbackOrder) {

    if (

      getMetricValue(candidateMetrics, metric) !== undefined ||

      getMetricValue(currentMetrics, metric) !== undefined

    ) {

      return metric;

    }

  }

  return null;

};

const getComparisonMetricValue = (

  comparison,

  key,

  metric

) => {

  if (

    comparison?.[key] !== undefined &&

    comparison?.[key] !== null

  ) {

    return comparison[key];

  }

  const normalizedMetric = normalizeMetricName(metric);

  if (!normalizedMetric) {

    return undefined;

  }

  const legacyKeys = {

    current_score: [

      `current_${normalizedMetric}`,

      normalizedMetric === "f1_score"

        ? "current_f1"

        : null,

    ],

    candidate_score: [

      `candidate_${normalizedMetric}`,

      normalizedMetric === "f1_score"

        ? "candidate_f1"

        : null,

    ],

    score_improvement: [

      `${normalizedMetric}_improvement`,

      normalizedMetric === "f1_score"

        ? "f1_improvement"

        : null,

    ],

  };

  for (const legacyKey of legacyKeys[key] || []) {

    if (

      legacyKey &&

      comparison?.[legacyKey] !== undefined &&

      comparison?.[legacyKey] !== null

    ) {

      return comparison[legacyKey];

    }

  }

  return undefined;

};

const formatImprovement = (value, metric) => {

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

  return PERCENT_METRICS.has(

    normalizeMetricName(metric)

  )

    ? `${numeric >= 0 ? "+" : ""}${(

        numeric * 100

      ).toFixed(2)}%`

    : `${numeric >= 0 ? "+" : ""}${numeric.toFixed(

        4

      )}`;

};

const getReadableText = (value) => {

  if (typeof value === "string") return value.trim();

  if (value === null || value === undefined) return "";

  if (typeof value === "object") {

    return (

      value.summary ||

      value.explanation ||

      value.reason ||

      value.message ||

      JSON.stringify(value, null, 2)

    );

  }

  return String(value);

};

const getEvaluationReason = (workflowResult) => {

  const comparison = getComparison(workflowResult);

  const retraining = getNestedRetraining(workflowResult);

  return getReadableText(

    comparison?.reason ||

      comparison?.rejection_reason ||

      comparison?.decision_reason ||

      retraining?.rejection_reason ||

      retraining?.reason ||

      workflowResult?.decision?.reason ||

      workflowResult?.decision?.explanation

  );

};

const getAgentReasoning = (workflowResult) => {

  const wrapper = workflowResult?.retraining || {};

  const retraining = getNestedRetraining(workflowResult);

  return getReadableText(

    wrapper?.reasoning ||

      wrapper?.analysis ||

      retraining?.reasoning ||

      retraining?.analysis

  );

};

const getMetricComparisonRows = (experiment) => {

  const current = experiment?.currentMetrics || {};

  const candidate = experiment?.candidateMetrics || {};

  const comparison =

    experiment?.comparison?.metric_comparison ||

    experiment?.comparison?.metrics_comparison ||

    {};

  const metricNames = [

    ...new Set([

      ...Object.keys(current).map(normalizeMetricName),

      ...Object.keys(candidate).map(normalizeMetricName),

      ...Object.keys(comparison).map(normalizeMetricName),

    ]),

  ].filter(Boolean);

  return metricNames.map((metric) => {

    const entry =

      comparison[metric] ||

      comparison[Object.keys(comparison).find(

        (key) => normalizeMetricName(key) === metric

      )] ||

      {};

    const currentValue =

      entry.current ?? getMetricValue(current, metric);

    const candidateValue =

      entry.candidate ?? getMetricValue(candidate, metric);

    let improvement = entry.improvement;

    if (

      improvement === undefined &&

      currentValue !== undefined &&

      candidateValue !== undefined

    ) {

      const currentNumber = Number(currentValue);

      const candidateNumber = Number(candidateValue);

      if (

        Number.isFinite(currentNumber) &&

        Number.isFinite(candidateNumber)

      ) {

        improvement = HIGHER_IS_BETTER.has(metric)

          ? candidateNumber - currentNumber

          : currentNumber - candidateNumber;

      }

    }

    let outcome = "Not compared";

    if (entry.improved === true) outcome = "Improved";

    else if (entry.improved === false) outcome = "Declined";

    else if (improvement !== undefined && Number(improvement) === 0) {

      outcome = "Unchanged";

    } else if (improvement !== undefined) {

      outcome = Number(improvement) > 0 ? "Improved" : "Declined";

    }

    return {

      metric,

      label: getMetricLabel(metric),

      currentValue,

      candidateValue,

      improvement,

      outcome,

    };

  });

};

const getWorkflowEventTime = (workflowResult) => {

  const candidates = [

    workflowResult?.[WORKFLOW_RECORDED_AT_FIELD],

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

      return value;

    }

  }

  return null;

};

const getExperimentId = (index = 0) =>

  `EXP-${String(index + 1).padStart(3, "0")}`;

const getExperimentKey = (

  workflowResult,

  recordedAt = null

) => {

  const actionVersion =

    workflowResult?.action?.details?.version ||

    workflowResult?.action?.details?.deployment

      ?.active_version ||

    workflowResult?.action?.version;

  const generatedAt =

    recordedAt ||

    getWorkflowEventTime(workflowResult) ||

    "no-time";

  const currentMetrics =

    getCurrentMetrics(workflowResult);

  const candidateMetrics =

    getCandidateMetrics(workflowResult);

  const primaryMetric = getPrimaryMetric(

    workflowResult,

    currentMetrics,

    candidateMetrics

  );

  const candidateScore = getMetricValue(

    candidateMetrics,

    primaryMetric

  );

  return [

    actionVersion || "no-version",

    generatedAt,

    primaryMetric || "no-metric",

    candidateScore ?? "no-score",

  ].join("|");

};

const getNextExperimentIndex = (history) => {

  const ids = history

    .map((item) => String(item?.id || ""))

    .map((id) => {

      const match = id.match(/^EXP-(\d+)$/i);

      return match ? Number(match[1]) : 0;

    })

    .filter((value) => Number.isFinite(value));

  return ids.length ? Math.max(...ids) : 0;

};

const buildExperiment = (

  workflowResult,

  index = 0,

  recordedAt = null,

  datasetOverride = null

) => {

  if (!workflowResult) {

    return null;

  }

  const retraining =

    getNestedRetraining(workflowResult);

  const currentMetrics =

    getCurrentMetrics(workflowResult);

  const candidateMetrics =

    getCandidateMetrics(workflowResult);

  const comparison =

    getComparison(workflowResult);

  const modelType =

    retraining?.model_type ||

    workflowResult?.model_type ||

    "unknown";

  const primaryMetric = getPrimaryMetric(

    workflowResult,

    currentMetrics,

    candidateMetrics

  );

  const comparisonCurrent =

    getComparisonMetricValue(

      comparison,

      "current_score",

      primaryMetric

    );

  const comparisonCandidate =

    getComparisonMetricValue(

      comparison,

      "candidate_score",

      primaryMetric

    );

  const comparisonImprovement =

    getComparisonMetricValue(

      comparison,

      "score_improvement",

      primaryMetric

    );

  const currentMetric =

    comparisonCurrent !== undefined

      ? comparisonCurrent

      : getMetricValue(

          currentMetrics,

          primaryMetric

        );

  const candidateMetric =

    comparisonCandidate !== undefined

      ? comparisonCandidate

      : getMetricValue(

          candidateMetrics,

          primaryMetric

        );

  let improvement =

    comparisonImprovement !== undefined

      ? Number(comparisonImprovement)

      : null;

  if (

    improvement === null &&

    currentMetric !== undefined &&

    candidateMetric !== undefined

  ) {

    const current = Number(currentMetric);

    const candidate = Number(candidateMetric);

    if (

      !Number.isNaN(current) &&

      !Number.isNaN(candidate)

    ) {

      improvement = HIGHER_IS_BETTER.has(

        primaryMetric

      )

        ? candidate - current

        : current - candidate;

    }

  }

  const driftDetected = Boolean(

    workflowResult?.drift_detection?.drift_detected

  );

  const decisionText = String(

    workflowResult?.decision?.decision_result?.decision ||

      workflowResult?.decision?.decision ||

      ""

  ).toUpperCase();

  // Backend acceptance is authoritative. Only use the decision text

  // when the backend did not provide candidate_accepted.

  const accepted =

    typeof comparison?.candidate_accepted === "boolean"

      ? comparison.candidate_accepted

      : decisionText.includes("RETRAIN_AND_DEPLOY");

  const rejected =

    typeof comparison?.candidate_accepted === "boolean"

      ? comparison.candidate_accepted === false

      : decisionText.includes("REJECT") ||

        decisionText.includes("KEEP_CURRENT_MODEL");

  const problemType = String(

    retraining?.problem_type ||

      workflowResult?.problem_type ||

      ""

  ).toLowerCase();

  const displayMetric =

    problemType.includes("regress")

      ? primaryMetric

      : getMetricValue(candidateMetrics, "recall") !== undefined ||

        getMetricValue(currentMetrics, "recall") !== undefined

      ? "recall"

      : primaryMetric;

  const metricComparison =

    comparison?.metric_comparison ||

    comparison?.metrics_comparison ||

    {};

  const displayMetricEntry =

    metricComparison[displayMetric] ||

    metricComparison[Object.keys(metricComparison).find(

      (key) => normalizeMetricName(key) === displayMetric

    )] ||

    {};

  const displayMetricCurrent =

    displayMetricEntry.current ??

    getMetricValue(currentMetrics, displayMetric);

  const displayMetricCandidate =

    displayMetricEntry.candidate ??

    getMetricValue(candidateMetrics, displayMetric);

  const displayMetricImprovement =

    displayMetricEntry.improvement ??

    (

      displayMetricCurrent !== undefined &&

      displayMetricCandidate !== undefined

        ? (

            HIGHER_IS_BETTER.has(displayMetric)

              ? Number(displayMetricCandidate) -

                Number(displayMetricCurrent)

              : Number(displayMetricCurrent) -

                Number(displayMetricCandidate)

          )

        : null

    );

  const running = [

    "running",

    "in_progress",

    "processing",

  ].includes(

    String(

      workflowResult?.status || ""

    ).toLowerCase()

  );

  const action =

    workflowResult?.action?.action ||

    "Not executed";

  const actionStatus =

    workflowResult?.action?.status ||

    "Not executed";

  const qualityIssues = Boolean(

    workflowResult?.data_quality?.issues_detected

  );

  const datasetConfig = (() => {

    try {

      const raw = localStorage.getItem(

        "driftwatcher.datasetConfig"

      );

      return raw ? JSON.parse(raw) : {};

    } catch {

      return {};

    }

  })();

  const datasetValue =

    workflowResult?.dataset?.filename ||

    workflowResult?.dataset?.name ||

    workflowResult?.dataset_filename ||

    workflowResult?.dataset_name ||

    workflowResult?.current_dataset_filename ||

    workflowResult?.current_dataset_path ||

    datasetOverride ||

    datasetConfig?.currentFilename ||

    datasetConfig?.currentDatasetPath;

  return {

    key: getExperimentKey(

      workflowResult,

      recordedAt

    ),

    id: getExperimentId(index),

    model: formatModelName(modelType),

    modelType,

    problemType:

      retraining?.problem_type ||

      workflowResult?.problem_type ||

      "unknown",

    primaryMetric,

    primaryMetricLabel:

      getMetricLabel(primaryMetric),

    displayMetric,

    displayMetricLabel: getMetricLabel(displayMetric),

    displayMetricCurrent,

    displayMetricCandidate,

    displayMetricImprovement,

    comparison,

    evaluationReason: getEvaluationReason(workflowResult),

    agentReasoning: getAgentReasoning(workflowResult),

    recommendation: getReadableText(

      workflowResult?.retraining?.recommendation ||

        retraining?.recommendation ||

        workflowResult?.decision?.recommendation

    ),

    deploymentStatus: getReadableText(

      workflowResult?.action?.status ||

        workflowResult?.action?.action ||

        (accepted ? "Accepted; deployment status not recorded" : "Not deployed")

    ),

    dataset: cleanFilename(datasetValue),

    trigger: driftDetected

      ? "Concept Drift"

      : "Manual Workflow",

    status: running

      ? "RUNNING"

      : accepted

      ? "ACCEPTED"

      : rejected

      ? "REJECTED"

      : "EVALUATED",

    completed:

      workflowResult?.status === "completed",

    accepted,

    rejected,

    running,

    currentMetric,

    candidateMetric,

    improvement,

    currentMetrics,

    candidateMetrics,

    trainingRows:

      retraining?.training_rows,

    validationRows:

      retraining?.validation_rows,

    action,

    actionStatus,

    qualityIssues,

    timestamp:

      recordedAt ||

      getWorkflowEventTime(workflowResult) ||

      new Date().toISOString(),

    workflowResult,

  };

};

function Experiments() {

  const [workflowResult, setWorkflowResult] =

    useState(readWorkflowResult);

  const [history, setHistory] =

    useState(readExperimentHistory);

  const [dismissedExperimentKeys, setDismissedExperimentKeys] =
    useState(readDismissedExperimentKeys);

  useEffect(() => {

    const recordWorkflow = (result) => {

      if (!result) {

        return;

      }

      /*

       * Preserve a stable execution timestamp.

       *

       * This is important because the same workflow result can be

       * received through initial page load, custom browser event,

       * and localStorage event.

       */

      let stableResult = result;

      let recordedAt =

        getWorkflowEventTime(result);

      if (!recordedAt) {

        try {

          const storedRaw = localStorage.getItem(

            WORKFLOW_STORAGE_KEY

          );

          if (storedRaw) {

            const storedWorkflow =

              JSON.parse(storedRaw);

            if (

              storedWorkflow?.[

                WORKFLOW_RECORDED_AT_FIELD

              ]

            ) {

              recordedAt =

                storedWorkflow[

                  WORKFLOW_RECORDED_AT_FIELD

                ];

            }

          }

        } catch (error) {

          console.error(

            "Failed to recover stored workflow timestamp:",

            error

          );

        }

      }

      if (!recordedAt) {

        recordedAt = new Date().toISOString();

        stableResult = {

          ...result,

          [WORKFLOW_RECORDED_AT_FIELD]:

            recordedAt,

        };

        try {

          localStorage.setItem(

            WORKFLOW_STORAGE_KEY,

            JSON.stringify(stableResult)

          );

        } catch (error) {

          console.error(

            "Failed to persist workflow execution timestamp:",

            error

          );

        }

      } else if (

        !result?.[WORKFLOW_RECORDED_AT_FIELD]

      ) {

        stableResult = {

          ...result,

          [WORKFLOW_RECORDED_AT_FIELD]:

            recordedAt,

        };

      }

      const incomingKey = getExperimentKey(stableResult, recordedAt);
      const dismissedKeys = readDismissedExperimentKeys();
      if (dismissedKeys.includes(incomingKey)) {
        return;
      }

      setWorkflowResult(stableResult);

      setHistory((previous) => {

        const nextKey = getExperimentKey(

          stableResult,

          recordedAt

        );

        const currentMetrics =

          getCurrentMetrics(stableResult);

        const candidateMetrics =

          getCandidateMetrics(stableResult);

        const primaryMetric =

          getPrimaryMetric(

            stableResult,

            currentMetrics,

            candidateMetrics

          ) || "f1_score";

        const candidateMetric =

          getMetricValue(

            candidateMetrics,

            primaryMetric

          );

        const modelType =

          stableResult?.model_type ||

          stableResult?.retraining?.model_type ||

          "unknown";

        const dataset =

          stableResult?.dataset_name ||

          stableResult?.dataset ||

          stableResult?.current_dataset ||

          "unknown";

        const semanticIdentity = [

          recordedAt || "no-time",

          modelType,

          dataset,

          primaryMetric,

          candidateMetric ?? "no-candidate",

        ].join("|");

        const existingIndex =

          previous.findIndex((item) => {

            if (!item) {

              return false;

            }

            if (item.key === nextKey) {

              return true;

            }

            if (

              recordedAt &&

              item.timestamp === recordedAt

            ) {

              return true;

            }

            const itemWorkflow =

              item.workflowResult || {};

            const itemCurrentMetrics =

              getCurrentMetrics(itemWorkflow);

            const itemCandidateMetrics =

              getCandidateMetrics(itemWorkflow);

            const itemPrimaryMetric =

              normalizeMetricName(

                item.primaryMetric

              ) ||

              getPrimaryMetric(

                itemWorkflow,

                itemCurrentMetrics,

                itemCandidateMetrics

              ) ||

              "f1_score";

            const itemCandidateMetric =

              item.candidateMetric ??

              getMetricValue(

                itemCandidateMetrics,

                itemPrimaryMetric

              );

            const itemModelType =

              item.model ||

              item.modelType ||

              itemWorkflow?.model_type ||

              itemWorkflow?.retraining?.model_type ||

              "unknown";

            const itemDataset =

              item.dataset ||

              itemWorkflow?.dataset_name ||

              itemWorkflow?.dataset ||

              itemWorkflow?.current_dataset ||

              "unknown";

            const itemSemanticIdentity = [

              item.timestamp ||

                getWorkflowEventTime(

                  itemWorkflow

                ) ||

                "no-time",

              itemModelType,

              itemDataset,

              itemPrimaryMetric,

              itemCandidateMetric ??

                "no-candidate",

            ].join("|");

            return (

              itemSemanticIdentity ===

              semanticIdentity

            );

          });

        if (existingIndex >= 0) {

          const existing =

            previous[existingIndex];

          const existingNumber =

            Number(

              String(existing?.id || "")

                .replace("EXP-", "")

            );

          const updated = buildExperiment(

            stableResult,

            Number.isFinite(existingNumber) &&

              existingNumber > 0

              ? existingNumber - 1

              : 0,

            recordedAt

          );

          const next = previous.map(

            (item, index) =>

              index === existingIndex

                ? updated

                : item

          );

          saveExperimentHistory(next);

          return next;

        }

        const nextIndex =

          getNextExperimentIndex(previous);

        const experiment = buildExperiment(

          stableResult,

          nextIndex,

          recordedAt

        );

        const next = [

          experiment,

          ...previous,

        ];

        saveExperimentHistory(next);

        return next;

      });

    };

    const initial = readWorkflowResult();

    if (initial) {

      recordWorkflow(initial);

    }

    const handleWorkflowEvent = (event) => {

      recordWorkflow(event.detail);

    };

    const handleStorage = (event) => {

      if (event.key !== WORKFLOW_STORAGE_KEY) {

        return;

      }

      const latest = readWorkflowResult();

      if (latest) {

        recordWorkflow(latest);

      }

    };

    window.addEventListener(

      "driftwatcher:workflow-result",

      handleWorkflowEvent

    );

    window.addEventListener(

      "storage",

      handleStorage

    );

    return () => {

      window.removeEventListener(

        "driftwatcher:workflow-result",

        handleWorkflowEvent

      );

      window.removeEventListener(

        "storage",

        handleStorage

      );

    };

  }, []);

  const experiments = useMemo(() => {

    const normalizedHistory = history

      .map((item) => {

        if (item?.workflowResult) {

          const numericId =

            Number(

              String(item.id || "")

                .replace("EXP-", "")

            ) - 1;

          return buildExperiment(

            item.workflowResult,

            Number.isFinite(numericId) &&

              numericId >= 0

              ? numericId

              : 0,

            item.timestamp ||

              getWorkflowEventTime(

                item.workflowResult

              ),

            item.dataset || null

          );

        }

        const legacyMetric =

          normalizeMetricName(

            item?.primaryMetric

          ) || "f1_score";

        return {

          ...item,

          primaryMetric: legacyMetric,

          primaryMetricLabel:

            getMetricLabel(legacyMetric),

          currentMetric:

            item?.currentMetric ??

            item?.currentF1,

          candidateMetric:

            item?.candidateMetric ??

            item?.candidateF1,

          currentMetrics:

            item?.currentMetrics || {

              f1_score: item?.currentF1,

            },

          candidateMetrics:

            item?.candidateMetrics || {

              f1_score:

                item?.candidateF1,

              accuracy:

                item?.accuracy,

              precision:

                item?.precision,

              recall:

                item?.recall,

            },

        };

      })

      .filter(Boolean);

    const current = workflowResult

      ? (() => {

          const workflowTime =

            getWorkflowEventTime(

              workflowResult

            );

          const key = getExperimentKey(

            workflowResult,

            workflowTime

          );

          if (dismissedExperimentKeys.includes(key)) {
            return null;
          }

          const existing =

            history.find(

              (item) =>

                item.key === key ||

                (workflowTime &&

                  item.timestamp ===

                    workflowTime)

            );

          const index = existing

            ? Number(

                String(existing.id || "")

                  .replace("EXP-", "")

              ) -

                1 ||

              0

            : getNextExperimentIndex(

                normalizedHistory

              );

          return buildExperiment(

            workflowResult,

            index,

            workflowTime

          );

        })()

      : null;

    const merged = [

      ...normalizedHistory,

    ];

    if (current) {

      const index = merged.findIndex(

        (item) =>

          item.key === current.key ||

          (current.timestamp &&

            item.timestamp ===

              current.timestamp)

      );

      if (index >= 0) {

        merged[index] = current;

      } else {

        merged.unshift(current);

      }

    }

    /*

     * Final safety deduplication.

     *

     * This protects the UI even if old localStorage data contains

     * duplicate records that were created before the history fix.

     */

    const seen = new Set();

    return merged.filter((item) => {

      if (!item) {

        return false;

      }

      const identity =

        item.key ||

        (item.timestamp

          ? `timestamp:${item.timestamp}`

          : item.id);

      if (seen.has(identity)) {

        return false;

      }

      seen.add(identity);

      return true;

    });

  }, [history, workflowResult, dismissedExperimentKeys]);

  const stats = useMemo(() => {

    return {

      total: experiments.length,

      completed: experiments.filter(

        (item) => item.completed

      ).length,

      running: experiments.filter(

        (item) => item.running

      ).length,

      accepted: experiments.filter(

        (item) => item.accepted

      ).length,

    };

  }, [experiments]);

  const latest =

    experiments[0] || null;

  const deleteExperiment = (experiment) => {
    if (!window.confirm(`Delete ${experiment.id}? This cannot be undone.`)) {
      return;
    }

    const key = experiment.key || experiment.id;
    const nextDismissed = [...new Set([...dismissedExperimentKeys, key])];

    localStorage.setItem(
      DISMISSED_EXPERIMENT_KEYS,
      JSON.stringify(nextDismissed)
    );
    setDismissedExperimentKeys(nextDismissed);

    setHistory((previous) => {
      const next = previous.filter(
        (item) => (item.key || item.id) !== key
      );
      saveExperimentHistory(next);
      return next;
    });

    setWorkflowResult((current) =>
      current && getExperimentKey(
        current,
        getWorkflowEventTime(current)
      ) === key
        ? null
        : current
    );
  };

  const deleteAllExperiments = () => {
    if (
      !window.confirm(
        "Delete all experiment history? This cannot be undone."
      )
    ) {
      return;
    }

    const keysToDismiss = [
      ...experiments.map((experiment) => experiment.key || experiment.id),
    ];

    if (workflowResult) {
      keysToDismiss.push(
        getExperimentKey(
          workflowResult,
          getWorkflowEventTime(workflowResult)
        )
      );
    }

    const nextDismissed = [
      ...new Set([...dismissedExperimentKeys, ...keysToDismiss]),
    ];

    localStorage.setItem(
      DISMISSED_EXPERIMENT_KEYS,
      JSON.stringify(nextDismissed)
    );
    setDismissedExperimentKeys(nextDismissed);

    setHistory([]);
    saveExperimentHistory([]);
    setWorkflowResult(null);
  };

  // Refresh only the workflow-status panel. Do not reload or modify

  // experiment history, workflow data, or model registry records.

  const [statusRefreshKey, setStatusRefreshKey] =

    useState(0);

  const [isRefreshingStatuses, setIsRefreshingStatuses] =

    useState(false);

  const [statusRefreshMessage, setStatusRefreshMessage] =

    useState("");

  const refreshWorkflowStatuses = () => {

    if (isRefreshingStatuses) {

      return;

    }

    setIsRefreshingStatuses(true);

    setStatusRefreshMessage("Refreshing statuses...");

    // Re-evaluate the workflow status panel from the latest experiment

    // already held in page state. This does not reload experiment history.

    setStatusRefreshKey((current) => current + 1);

    window.setTimeout(() => {

      setIsRefreshingStatuses(false);

      setStatusRefreshMessage("Statuses checked just now");

    }, 600);

  };

  const workflowStatuses = useMemo(() => {

    const hasCandidateMetrics =

      latest?.candidateMetric !== undefined &&

      latest?.candidateMetric !== null;

    return {

      drift: latest?.workflowResult

        ?.drift_detection

        ?.drift_detected

        ? "Completed"

        : "Waiting",

      retraining: hasCandidateMetrics

        ? "Completed"

        : "Waiting",

      evaluation: hasCandidateMetrics

        ? "Completed"

        : "Waiting",

      decision: latest?.accepted === true

        ? "Accepted"

        : latest?.rejected === true

          ? "Rejected"

          : "Pending",

    };

  }, [latest, statusRefreshKey]);

  return (

    <div className="app-shell">

      <style>

        {`

          @keyframes dw-refresh-spin {

            from { transform: rotate(0deg); }

            to { transform: rotate(360deg); }

          }

        `}

      </style>

      <Sidebar />

      <main className="main-area">

        <Topbar title="Experiments" />

        <section className="dashboard-content">

          <div className="page-heading">

            <div>

              <h3>

                Experiments & Model Evaluation

              </h3>

              <p>

                Track model retraining experiments,

                compare candidate models, and review

                adaptation results.

              </p>

            </div>

            <div className="system-status">

              <span className="status-dot"></span>

              {latest

                ? "Experiment Tracking Active"

                : "Waiting for Workflow"}

            </div>

          </div>

          <div className="kpi-grid">

            <div className="kpi-card">

              <div className="kpi-icon blue">

                <FlaskConical size={21} />

              </div>

              <div>

                <span>

                  Total Experiments

                </span>

                <strong>

                  {stats.total}

                </strong>

                <small>

                  {stats.total

                    ? "Recorded workflow experiments"

                    : "No workflow experiments recorded"}

                </small>

              </div>

            </div>

            <div className="kpi-card">

              <div className="kpi-icon green">

                <CheckCircle2 size={21} />

              </div>

              <div>

                <span>Completed</span>

                <strong>

                  {stats.completed}

                </strong>

                <small className="positive">

                  Successfully completed

                </small>

              </div>

            </div>

            <div className="kpi-card">

              <div className="kpi-icon orange">

                <Clock3 size={21} />

              </div>

              <div>

                <span>Running</span>

                <strong>

                  {stats.running}

                </strong>

                <small>

                  {stats.running

                    ? "Experiment in progress"

                    : "No active experiments"}

                </small>

              </div>

            </div>

            <div className="kpi-card">

              <div className="kpi-icon purple">

                <BarChart3 size={21} />

              </div>

              <div>

                <span>

                  Accepted Candidates

                </span>

                <strong>

                  {stats.accepted}

                </strong>

                <small className="positive">

                  {stats.accepted

                    ? "Accepted by workflow evaluation"

                    : "No candidate accepted yet"}

                </small>

              </div>

            </div>

          </div>

          <div className="panel">

            <div className="panel-header">

              <div>

                <h4>

                  Experiment History

                </h4>

                <p>

                  Model adaptation and evaluation

                  experiments performed by

                  DriftWatcher.

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
                <span className="panel-status">
                  {stats.total}{" "}
                  {stats.total === 1 ? "Experiment" : "Experiments"}
                </span>
                {stats.total > 0 && (
                  <button
                    type="button"
                    onClick={deleteAllExperiments}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "8px 12px",
                      border: "1px solid #fecaca",
                      borderRadius: "8px",
                      background: "#fff1f2",
                      color: "#b91c1c",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    <Trash2 size={14} />
                    Delete All
                  </button>
                )}
              </div>

            </div>

            {experiments.length > 0 ? (

              experiments.map(

                (experiment) => (

                  <div

                    key={

                      experiment.key ||

                      experiment.id

                    }

                    style={{

                      border:

                        "1px solid #e4ebf5",

                      borderRadius: "16px",

                      padding: "24px",

                      marginTop: "18px",

                      background:

                        "#ffffff",

                    }}

                  >

                    <div

                      style={{

                        display: "flex",

                        justifyContent:

                          "space-between",

                        alignItems:

                          "flex-start",

                        gap: "20px",

                      }}

                    >

                      <div>

                        <div

                          style={{

                            display:

                              "flex",

                            alignItems:

                              "center",

                            gap: "10px",

                          }}

                        >

                          <div className="kpi-icon blue">

                            <FlaskConical

                              size={20}

                            />

                          </div>

                          <div>

                            <h4

                              style={{

                                margin: 0,

                              }}

                            >

                              {experiment.id}

                            </h4>

                            <p

                              style={{

                                margin:

                                  "4px 0 0",

                              }}

                            >

                              {experiment.model}{" "}

                              Model Adaptation

                            </p>

                          </div>

                        </div>

                      </div>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          flexWrap: "wrap",
                        }}
                      >
                        <span
                          className="active-badge"
                          style={{
                            background: experiment.rejected
                              ? "#fee2e2"
                              : experiment.accepted
                              ? "#dcfce7"
                              : "#eaf2ff",
                            color: experiment.rejected
                              ? "#b91c1c"
                              : experiment.accepted
                              ? "#15803d"
                              : "#2563eb",
                            fontWeight: 700,
                          }}
                        >
                          {experiment.status}
                        </span>
                        <button
                          type="button"
                          onClick={() => deleteExperiment(experiment)}
                          aria-label={`Delete ${experiment.id}`}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            padding: "6px 9px",
                            border: "1px solid #fecaca",
                            borderRadius: "7px",
                            background: "#fff",
                            color: "#b91c1c",
                            fontSize: "12px",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          <Trash2 size={13} />
                          Delete
                        </button>
                      </div>

                    </div>

                    {experiment.rejected && (

                      <div

                        style={{

                          display: "inline-flex",

                          alignItems: "center",

                          gap: "6px",

                          marginTop: "12px",

                          padding: "6px 10px",

                          borderRadius: "8px",

                          background: "#fff1f2",

                          color: "#be123c",

                          border: "1px solid #fecdd3",

                          fontSize: "11px",

                          fontWeight: 800,

                          letterSpacing: "0.04em",

                        }}

                      >

                        <span aria-hidden="true">●</span>

                        CANDIDATE REJECTED

                      </div>

                    )}

                    <div

                      style={{

                        display: "grid",

                        gridTemplateColumns:

                          "repeat(3, minmax(0, 1fr))",

                        gap: "16px",

                        marginTop:

                          "24px",

                      }}

                    >

                      <div>

                        <small>

                          Model

                        </small>

                        <strong

                          style={{

                            display:

                              "block",

                            marginTop:

                              "6px",

                          }}

                        >

                          {experiment.model}

                        </strong>

                      </div>

                      <div>

                        <small>

                          Dataset

                        </small>

                        <strong

                          style={{

                            display:

                              "block",

                            marginTop:

                              "6px",

                          }}

                        >

                          {experiment.dataset}

                        </strong>

                      </div>

                      <div>

                        <small>

                          Trigger

                        </small>

                        <strong

                          style={{

                            display:

                              "block",

                            marginTop:

                              "6px",

                          }}

                        >

                          {experiment.trigger}

                        </strong>

                      </div>

                    </div>

                    <div

                      style={{

                        display: "grid",

                        gridTemplateColumns:

                          "repeat(3, minmax(0, 1fr))",

                        gap: "16px",

                        marginTop:

                          "20px",

                        paddingTop:

                          "20px",

                        borderTop:

                          "1px solid #edf1f7",

                      }}

                    >

                      <div>

                        <small>

                          Current{" "}

                          {

                            experiment.displayMetricLabel

                          }

                        </small>

                        <strong

                          style={{

                            display:

                              "block",

                            marginTop:

                              "6px",

                          }}

                        >

                          {formatMetricValue(

                            experiment.displayMetricCurrent,

                            experiment.displayMetric

                          )}

                        </strong>

                      </div>

                      <div>

                        <small>

                          Candidate{" "}

                          {

                            experiment.displayMetricLabel

                          }

                        </small>

                        <strong

                          style={{

                            display:

                              "block",

                            marginTop:

                              "6px",

                          }}

                        >

                          {formatMetricValue(

                            experiment.displayMetricCandidate,

                            experiment.displayMetric

                          )}

                        </strong>

                      </div>

                      <div>

                        <small>

                          {

                            experiment.displayMetricLabel

                          }{" "}

                          Change

                        </small>

                        <strong

                          style={{

                            display:

                              "block",

                            marginTop:

                              "6px",

                            color:

                              experiment.displayMetricImprovement !== null &&

                              experiment.displayMetricImprovement !== undefined

                                ? Number(experiment.displayMetricImprovement) > 0

                                  ? "#16a34a"

                                  : Number(experiment.displayMetricImprovement) < 0

                                    ? "#dc2626"

                                    : "#64748b"

                                : "#64748b",

                          }}

                        >

                          {formatImprovement(

                            experiment.displayMetricImprovement,

                            experiment.displayMetric

                          )}

                          {experiment.displayMetricImprovement !== null &&

                            experiment.displayMetricImprovement !== undefined &&

                            Number(experiment.displayMetricImprovement) !== 0 && (

                              Number(experiment.displayMetricImprovement) > 0 ? (

                                <ArrowUpRight

                                  size={15}

                                  style={{ marginLeft: "4px", verticalAlign: "middle" }}

                                />

                              ) : (

                                <ArrowDownRight

                                  size={15}

                                  style={{ marginLeft: "4px", verticalAlign: "middle" }}

                                />

                              )

                            )}

                        </strong>

                      </div>

                    </div>

                    <div

                      style={{

                        display: "flex",

                        gap: "28px",

                        flexWrap:

                          "wrap",

                        marginTop:

                          "20px",

                        paddingTop:

                          "18px",

                        borderTop:

                          "1px solid #edf1f7",

                      }}

                    >

                      <span className="link-text">

                        <Database

                          size={15}

                          style={{

                            verticalAlign:

                              "middle",

                            marginRight:

                              "6px",

                          }}

                        />

                        {experiment.trainingRows

                          ? `${formatNumber(

                              experiment.trainingRows

                            )} training records`

                          : "Training size not recorded"}

                      </span>

                      <span className="link-text">

                        <Brain

                          size={15}

                          style={{

                            verticalAlign:

                              "middle",

                            marginRight:

                              "6px",

                          }}

                        />

                        Automated retraining

                      </span>

                      <span className="link-text">

                        <CalendarDays

                          size={15}

                          style={{

                            verticalAlign:

                              "middle",

                            marginRight:

                              "6px",

                          }}

                        />

                        {formatDateTime(

                          experiment.timestamp

                        )}

                      </span>

                    </div>

                  </div>

                )

              )

            ) : (

              <div

                style={{

                  border:

                    "1px dashed #cfd9e8",

                  borderRadius: "16px",

                  padding:

                    "42px 24px",

                  marginTop: "18px",

                  background:

                    "#fbfdff",

                  textAlign:

                    "center",

                }}

              >

                <FlaskConical

                  size={30}

                  style={{

                    color: "#1677ff",

                    marginBottom:

                      "10px",

                  }}

                />

                <h4

                  style={{

                    margin: 0,

                  }}

                >

                  No experiments recorded yet

                </h4>

                <p

                  style={{

                    margin:

                      "8px 0 0",

                    color:

                      "#71839d",

                  }}

                >

                  Run the DriftWatcher AI

                  workflow to create the first

                  experiment record.

                </p>

              </div>

            )}

          </div>

          <div className="panel">

            <div className="panel-header">

              <div>

                <h4>

                  How Experiments Work

                </h4>

                <p>

                  DriftWatcher records the

                  evidence used to evaluate

                  model adaptation.

                </p>

              </div>

              <button

                className="secondary-button"

                type="button"

                onClick={

                  refreshWorkflowStatuses

                }

                disabled={isRefreshingStatuses}

                style={{

                  cursor: isRefreshingStatuses ? "wait" : "pointer",

                  opacity: isRefreshingStatuses ? 0.7 : 1,

                }}

              >

                <Clock3

                  size={17}

                  style={{

                    animation: isRefreshingStatuses

                      ? "dw-refresh-spin 0.8s linear infinite"

                      : "none",

                  }}

                />

                {isRefreshingStatuses ? "Refreshing..." : "Refresh"}

              </button>

            </div>

            {statusRefreshMessage && (

              <p

                role="status"

                style={{

                  margin: "8px 0 12px",

                  color: "#64748b",

                  fontSize: "12px",

                  textAlign: "right",

                }}

              >

                {statusRefreshMessage}

              </p>

            )}

            <div className="agent-list">

              <div className="agent-row">

                <div className="agent-name">

                  <FlaskConical size={17} />

                  Drift detected

                </div>

                <span className="active-badge">

                  {workflowStatuses.drift}

                </span>

              </div>

              <div className="agent-row">

                <div className="agent-name">

                  <Brain size={17} />

                  Candidate model retrained

                </div>

                <span className="active-badge">

                  {workflowStatuses.retraining}

                </span>

              </div>

              <div className="agent-row">

                <div className="agent-name">

                  <BarChart3 size={17} />

                  Candidate evaluated against

                  current model

                </div>

                <span className="active-badge">

                  {workflowStatuses.evaluation}

                </span>

              </div>

              <div className="agent-row">

                <div className="agent-name">

                  <CheckCircle2 size={17} />

                  Candidate accepted

                </div>

                <span className="active-badge">

                  {workflowStatuses.decision}

                </span>

              </div>

            </div>

          </div>

        </section>

      </main>

    </div>

  );

}

export default Experiments;
