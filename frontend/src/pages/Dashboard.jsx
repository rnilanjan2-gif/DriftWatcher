import { useEffect, useMemo, useState } from "react";
import {
    Activity,
    BarChart3,
    Bell,
    Bot,
    Database,
} from "lucide-react";

import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import "../App.css";

import {
    getModelRegistry,
    getActiveModel,
} from "../services/api";

const WORKFLOW_STORAGE_KEY = "driftwatcher.workflowResult";
const STREAM_STORAGE_KEY = "driftwatcher.streamResult";

const WORKFLOW_STORAGE_KEYS = [
    WORKFLOW_STORAGE_KEY,
    "driftwatcher.latestWorkflowResult",
    "driftwatcher.workflow_result",
];

function readJsonStorage(key) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        console.error(`Failed to read ${key}:`, error);
        return null;
    }
}

function readWorkflowResult() {
    if (
        window.__driftWatcherWorkflowResult &&
        typeof window.__driftWatcherWorkflowResult === "object"
    ) {
        return window.__driftWatcherWorkflowResult;
    }

    for (const key of WORKFLOW_STORAGE_KEYS) {
        const stored = readJsonStorage(key);

        if (stored && typeof stored === "object") {
            return stored;
        }
    }

    return null;
}

function readStreamResult() {
    return readJsonStorage(STREAM_STORAGE_KEY);
}

function getNestedRetraining(workflowResult) {
    const wrapper = workflowResult?.retraining || {};

    return wrapper?.retraining_result || wrapper || {};
}

const METRIC_ALIASES = {
    accuracy: ["accuracy", "accuracy_score"],
    accuracy_score: ["accuracy", "accuracy_score"],

    f1_score: ["f1_score", "f1"],
    f1: ["f1_score", "f1"],

    precision: ["precision"],
    recall: ["recall"],

    roc_auc: ["roc_auc", "auc"],
    auc: ["roc_auc", "auc"],

    r2_score: ["r2_score", "r2"],
    r2: ["r2_score", "r2"],

    rmse: ["rmse", "root_mean_squared_error"],
    root_mean_squared_error: [
        "rmse",
        "root_mean_squared_error",
    ],

    mae: ["mae", "mean_absolute_error"],
    mean_absolute_error: [
        "mae",
        "mean_absolute_error",
    ],

    mse: ["mse", "mean_squared_error"],
    mean_squared_error: [
        "mse",
        "mean_squared_error",
    ],
};

const METRIC_LABELS = {
    accuracy: "Accuracy",
    accuracy_score: "Accuracy",

    f1_score: "F1 Score",
    f1: "F1 Score",

    precision: "Precision",
    recall: "Recall",

    roc_auc: "ROC AUC",
    auc: "AUC",

    r2_score: "R² Score",
    r2: "R² Score",

    rmse: "RMSE",
    root_mean_squared_error: "RMSE",

    mae: "MAE",
    mean_absolute_error: "MAE",

    mse: "MSE",
    mean_squared_error: "MSE",
};

const PERCENTAGE_METRICS = new Set([
    "accuracy",
    "accuracy_score",
    "f1_score",
    "f1",
    "precision",
    "recall",
    "roc_auc",
    "auc",
]);

const HIGHER_IS_BETTER_METRICS = new Set([
    "accuracy",
    "accuracy_score",
    "f1_score",
    "f1",
    "precision",
    "recall",
    "roc_auc",
    "auc",
    "r2_score",
    "r2",
]);

function getMetricAliases(metricKey) {
    if (!metricKey) {
        return [];
    }

    return METRIC_ALIASES[metricKey] || [metricKey];
}

function findMetricKey(metrics, preferredKeys) {
    if (!metrics || typeof metrics !== "object") {
        return null;
    }

    for (const preferredKey of preferredKeys || []) {
        if (!preferredKey) {
            continue;
        }

        for (const key of getMetricAliases(preferredKey)) {
            if (
                metrics[key] !== undefined &&
                metrics[key] !== null
            ) {
                return key;
            }
        }
    }

    return null;
}

function getMetricValue(metrics, metricKey) {
    const resolvedKey = findMetricKey(
        metrics,
        [metricKey]
    );

    if (!resolvedKey) {
        return null;
    }

    const value = Number(metrics[resolvedKey]);

    return Number.isFinite(value) ? value : null;
}

function formatPercent(value) {
    if (
        value === null ||
        value === undefined ||
        Number.isNaN(Number(value))
    ) {
        return "—";
    }

    const numeric = Number(value);

    const percent =
        numeric >= 0 &&
        numeric <= 1
            ? numeric * 100
            : numeric;

    return `${percent.toFixed(2)}%`;
}

function formatCount(value) {
    if (
        value === null ||
        value === undefined ||
        Number.isNaN(Number(value))
    ) {
        return "—";
    }

    return Number(value).toLocaleString();
}

function formatChartDisplay(value) {
    if (
        value === null ||
        value === undefined ||
        !Number.isFinite(Number(value))
    ) {
        return "—";
    }

    const numeric = Number(value);

    if (
        numeric >= 0 &&
        numeric <= 1
    ) {
        return `${(numeric * 100).toFixed(2)}%`;
    }

    return numeric.toLocaleString(
        undefined,
        {
            maximumFractionDigits: 2,
        }
    );
}

/*
 * Monitoring totals belong to the monitoring run,
 * not to the currently active registry model.
 */
function getMonitoringTotals(
    workflowResult,
    streamResult,
    batchResults
) {
    const workflowRows = [
        workflowResult?.total_rows_processed,
        workflowResult?.totalRowsProcessed,
        workflowResult?.total_instances,
        workflowResult?.totalInstances,

        workflowResult?.monitoring?.total_rows_processed,
        workflowResult?.monitoring?.totalRowsProcessed,
        workflowResult?.monitoring?.total_instances,
        workflowResult?.monitoring?.totalInstances,
    ];

    const workflowErrors = [
        workflowResult?.total_prediction_errors,
        workflowResult?.totalPredictionErrors,
        workflowResult?.prediction_errors,
        workflowResult?.predictionErrors,

        workflowResult?.monitoring?.total_prediction_errors,
        workflowResult?.monitoring?.totalPredictionErrors,
        workflowResult?.monitoring?.prediction_errors,
        workflowResult?.monitoring?.predictionErrors,
    ];

    const findFinite = (
        values,
        minimum = 0
    ) => {
        for (const value of values) {
            const numeric = Number(value);

            if (
                Number.isFinite(numeric) &&
                numeric >= minimum
            ) {
                return numeric;
            }
        }

        return null;
    };

    const workflowRowCount =
        findFinite(workflowRows, 1);

    const workflowErrorCount =
        findFinite(workflowErrors, 0);

    if (
        workflowRowCount !== null ||
        workflowErrorCount !== null
    ) {
        return {
            totalInstances:
                workflowRowCount,

            predictionErrors:
                workflowErrorCount,

            source:
                "Latest workflow monitoring result",
        };
    }

    const streamRows = Number(
        streamResult?.total_rows_processed
    );

    const streamErrors = Number(
        streamResult?.total_prediction_errors
    );

    if (
        Number.isFinite(streamRows) &&
        streamRows > 0
    ) {
        return {
            totalInstances: streamRows,

            predictionErrors:
                Number.isFinite(streamErrors) &&
                streamErrors >= 0
                    ? streamErrors
                    : null,

            source:
                "Latest Data Stream monitoring run",
        };
    }

    if (batchResults.length > 0) {
        const totalInstances =
            batchResults.reduce(
                (total, item) =>
                    total +
                    Number(
                        item?.rows || 0
                    ),
                0
            );

        const predictionErrors =
            batchResults.reduce(
                (total, item) =>
                    total +
                    Number(
                        item?.prediction_errors ||
                        0
                    ),
                0
            );

        return {
            totalInstances:
                totalInstances > 0
                    ? totalInstances
                    : null,

            predictionErrors,

            source:
                "Stored Data Stream batches",
        };
    }

    return {
        totalInstances: null,
        predictionErrors: null,
        source:
            "No monitoring run recorded",
    };
}

function normalizeProblemType(value) {
    const type = String(value || "")
        .trim()
        .toLowerCase();

    if (type.includes("regress")) {
        return "regression";
    }

    if (type.includes("classif")) {
        return "classification";
    }

    return null;
}

function normalizeBoolean(value) {
    if (typeof value === "boolean") {
        return value;
    }

    if (typeof value === "number") {
        return value !== 0;
    }

    const normalized = String(
        value ?? ""
    )
        .trim()
        .toLowerCase();

    if (
        [
            "true",
            "yes",
            "1",
            "drift",
            "detected",
            "success",
        ].includes(normalized)
    ) {
        return true;
    }

    if (
        [
            "false",
            "no",
            "0",
            "no_drift",
            "not_detected",
            "none",
        ].includes(normalized)
    ) {
        return false;
    }

    return null;
}

function getModelMetadata(workflowResult) {
    const candidates = [
        workflowResult?.model_metadata,
        workflowResult?.model_info,
        workflowResult?.model,
        workflowResult?.monitoring?.model_metadata,
        workflowResult?.monitoring?.model_info,
    ].filter(
        (value) =>
            value &&
            typeof value === "object"
    );

    return candidates[0] || {};
}

function getPrimaryMetricInfo(
    workflowResult,
    metrics
) {
    const retraining =
        getNestedRetraining(
            workflowResult
        );

    const comparison =
        retraining?.comparison ||
        retraining?.metric_comparison ||
        workflowResult?.retraining?.comparison ||
        {};

    const explicitMetric =
        workflowResult?.primary_metric ||
        workflowResult?.primaryMetric ||
        retraining?.primary_metric ||
        retraining?.primaryMetric ||
        comparison?.primary_metric ||
        comparison?.primaryMetric ||
        null;

    const modelMetadata =
        getModelMetadata(
            workflowResult
        );

    const problemType =
        normalizeProblemType(
            workflowResult?.problem_type
        ) ||
        normalizeProblemType(
            workflowResult?.problemType
        ) ||
        normalizeProblemType(
            retraining?.problem_type
        ) ||
        normalizeProblemType(
            retraining?.problemType
        ) ||
        normalizeProblemType(
            modelMetadata?.problem_type
        ) ||
        normalizeProblemType(
            modelMetadata?.problemType
        ) ||
        null;

    const candidateMetricKeys = [
        explicitMetric,

        ...(problemType === "regression"
            ? [
                "r2_score",
                "r2",
                "rmse",
                "root_mean_squared_error",
                "mae",
                "mean_absolute_error",
                "mse",
                "mean_squared_error",
            ]

            : problemType === "classification"

                ? [
                    "accuracy",
                    "accuracy_score",
                    "f1_score",
                    "f1",
                    "precision",
                    "recall",
                    "roc_auc",
                    "auc",
                ]

                : [
                    "accuracy",
                    "accuracy_score",
                    "f1_score",
                    "f1",
                    "precision",
                    "recall",
                    "roc_auc",
                    "auc",
                    "r2_score",
                    "r2",
                    "rmse",
                    "root_mean_squared_error",
                    "mae",
                    "mean_absolute_error",
                    "mse",
                    "mean_squared_error",
                ]),
    ].filter(Boolean);

    let metricKey =
        findMetricKey(
            metrics,
            candidateMetricKeys
        );

    if (
        !metricKey &&
        metrics &&
        typeof metrics === "object"
    ) {
        metricKey =
            Object.keys(metrics).find(
                (key) => {
                    if (
                        [
                            "prediction_errors",
                            "error_rate",
                            "rows",
                            "count",
                        ].includes(key)
                    ) {
                        return false;
                    }

                    return Number.isFinite(
                        Number(metrics[key])
                    );
                }
            ) || null;
    }

    if (!metricKey) {
        return {
            key: null,
            label:
                "Primary Performance",
            value: null,
            kind: "number",
            problemType,
        };
    }

    const value =
        getMetricValue(
            metrics,
            metricKey
        );

    return {
        key: metricKey,

        label:
            METRIC_LABELS[metricKey] ||
            metricKey
                .replace(/_/g, " ")
                .replace(
                    /\b\w/g,
                    (letter) =>
                        letter.toUpperCase()
                ),

        value,

        kind:
            PERCENTAGE_METRICS.has(
                metricKey
            )
                ? "percentage"
                : "number",

        problemType,

        direction:
            HIGHER_IS_BETTER_METRICS.has(
                metricKey
            )
                ? "higher"
                : [
                    "rmse",
                    "root_mean_squared_error",
                    "mae",
                    "mean_absolute_error",
                    "mse",
                    "mean_squared_error",
                ].includes(metricKey)
                    ? "lower"
                    : null,
    };
}

function formatPrimaryMetric(info) {
    if (
        !info ||
        info.value === null ||
        Number.isNaN(
            Number(info.value)
        )
    ) {
        return "—";
    }

    if (
        info.kind === "percentage"
    ) {
        return formatPercent(
            info.value
        );
    }

    return Number(
        info.value
    ).toLocaleString(
        undefined,
        {
            maximumFractionDigits: 4,
        }
    );
}

function getBatchMetricValue(
    item,
    metricKey,
    problemType
) {
    if (
        !item ||
        typeof item !== "object" ||
        !metricKey
    ) {
        return null;
    }

    const metricSources = [
        item?.metrics,
        item,
    ].filter(
        (source) =>
            source &&
            typeof source === "object"
    );

    for (const source of metricSources) {
        const value =
            getMetricValue(
                source,
                metricKey
            );

        if (value !== null) {
            return value;
        }
    }

    if (
        (
            metricKey === "accuracy" ||
            metricKey === "accuracy_score"
        ) &&
        problemType !== "regression"
    ) {
        const errorRate =
            Number(
                item?.error_rate
            );

        if (
            Number.isFinite(
                errorRate
            )
        ) {
            return errorRate <= 1
                ? 1 - errorRate
                : 1 -
                    errorRate /
                    100;
        }
    }

    return null;
}

function getDetectorStatus(
    detectorResults,
    keys
) {
    if (
        !detectorResults ||
        typeof detectorResults !== "object"
    ) {
        return null;
    }

    for (const key of keys) {
        if (
            Object.prototype.hasOwnProperty.call(
                detectorResults,
                key
            ) &&
            detectorResults[key] !== null &&
            detectorResults[key] !== undefined
        ) {
            const value =
                detectorResults[key];

            const parsed =
                normalizeBoolean(value);

            if (parsed !== null) {
                return parsed
                    ? "DRIFT"
                    : "NO DRIFT";
            }

            const normalized =
                String(value)
                    .toLowerCase();

            if (
                normalized.includes("drift") &&
                !normalized.includes(
                    "no_drift"
                )
            ) {
                return "DRIFT";
            }

            return "NO DRIFT";
        }
    }

    return null;
}

function getDetectorSummaryStatus(
    summary,
    countKeys
) {
    if (
        !summary ||
        typeof summary !== "object"
    ) {
        return null;
    }

    let hasUsableCount = false;

    for (const key of countKeys) {
        if (
            !Object.prototype.hasOwnProperty.call(summary, key) ||
            summary[key] === null ||
            summary[key] === undefined ||
            summary[key] === ""
        ) {
            continue;
        }

        const count = Number(summary[key]);

        if (!Number.isFinite(count) || count < 0) {
            continue;
        }

        hasUsableCount = true;

        if (count > 0) {
            return "DRIFT";
        }
    }

    // Missing detector counts mean UNKNOWN, not NO DRIFT.
    return hasUsableCount ? "NO DRIFT" : null;
}

function getDataQualityIssue(
    dataQualityResult
) {
    if (
        !dataQualityResult ||
        typeof dataQualityResult !== "object"
    ) {
        return false;
    }

    if (
        dataQualityResult.issues_detected ===
        true
    ) {
        return true;
    }

    const overallStatus =
        dataQualityResult?.overall_status;

    if (
        overallStatus &&
        typeof overallStatus === "object"
    ) {
        const status =
            String(
                overallStatus.status ||
                overallStatus.state ||
                ""
            ).toLowerCase();

        if (
            status.includes("issue") ||
            status.includes("warning")
        ) {
            return true;
        }

        if (
            Array.isArray(
                overallStatus.issues
            ) &&
            overallStatus.issues.length > 0
        ) {
            return true;
        }

        if (
            Number(
                overallStatus.issue_count ||
                0
            ) > 0
        ) {
            return true;
        }
    }

    const candidates = [
        dataQualityResult,
        dataQualityResult?.current_quality,
        dataQualityResult?.quality_summary,
        dataQualityResult?.summary,
        dataQualityResult?.findings,
        dataQualityResult?.data_quality,
    ].filter(
        (value) =>
            value &&
            typeof value === "object"
    );

    const keys = [
        "missing_values",
        "missingValues",
        "duplicate_records",
        "duplicateRecords",
        "duplicate_rows",
        "duplicateRows",
        "infinite_values",
        "infiniteValues",
        "potential_outliers",
        "potentialOutliers",
        "outliers",
        "unseen_categories",
        "unseenCategories",
    ];

    for (const candidate of candidates) {
        for (const key of keys) {
            const value =
                candidate?.[key];

            if (
                typeof value === "number" &&
                value > 0
            ) {
                return true;
            }

            if (
                Array.isArray(value) &&
                value.length > 0
            ) {
                return true;
            }

            if (
                value &&
                typeof value === "object" &&
                !Array.isArray(value)
            ) {
                const nestedTotal =
                    Object.values(
                        value
                    ).reduce(
                        (
                            sum,
                            entry
                        ) => {
                            const numeric =
                                Number(
                                    entry
                                );

                            return (
                                sum +
                                (
                                    Number.isFinite(
                                        numeric
                                    )
                                        ? numeric
                                        : 0
                                )
                            );
                        },
                        0
                    );

                if (
                    nestedTotal > 0
                ) {
                    return true;
                }
            }
        }
    }

    const directStatus =
        String(
            dataQualityResult?.status ||
            dataQualityResult?.state ||
            ""
        ).toLowerCase();

    return (
        directStatus.includes(
            "issue"
        ) ||
        directStatus.includes(
            "warning"
        )
    );
}

function getAgentStatus(result) {
    if (
        !result ||
        typeof result !== "object"
    ) {
        return "Waiting";
    }

    const status =
        String(
            result?.status ||
            result?.state ||
            result?.overall_status?.status ||
            ""
        )
            .trim()
            .toLowerCase();

    if (
        [
            "success",
            "successful",
            "completed",
            "complete",
            "done",
            "ok",
        ].includes(status)
    ) {
        return "Completed";
    }

    if (
        [
            "error",
            "failed",
            "failure",
            "exception",
        ].includes(status)
    ) {
        return "Failed";
    }

    if (
        [
            "running",
            "processing",
            "in_progress",
            "in-progress",
        ].includes(status)
    ) {
        return "Running";
    }

    return "Waiting";
}

function getWorkflowAgentStatuses(
    workflowResult
) {
    const retrainingWrapper =
        workflowResult?.retraining || {};

    const reportWrapper =
        workflowResult?.report || {};

    const decisionWrapper =
        workflowResult?.decision || {};

    return {
        "Drift Detection Agent":
            getAgentStatus(
                workflowResult?.drift_detection
            ),

        "Root Cause Agent":
            getAgentStatus(
                workflowResult?.root_cause
            ),

        "Data Quality Agent":
            getAgentStatus(
                workflowResult?.data_quality
            ),

        "Retraining Agent":
            getAgentStatus(
                retrainingWrapper
            ),

        "Decision Agent":
            getAgentStatus(
                decisionWrapper
            ),

        "Report Agent":
            getAgentStatus(
                reportWrapper
            ),
    };
}

function getDetectorNames(
    driftResult,
    streamResult
) {
    const detectorResults =
        driftResult?.detector_results ||
        driftResult?.detectorResults ||
        {};

    const names =
        Object.entries(
            detectorResults
        )
            .filter(([, value]) => {
                const parsed =
                    normalizeBoolean(
                        value
                    );

                return (
                    parsed === true ||
                    String(value)
                        .toLowerCase() ===
                        "drift"
                );
            })
            .map(([name]) => {
                if (
                    name.toLowerCase() ===
                    "pagehinkley"
                ) {
                    return "Page-Hinkley";
                }

                return name.toUpperCase();
            });

    if (names.length > 0) {
        return names.join(" + ");
    }

    const summary =
        driftResult?.detector_summary ||
        streamResult?.detector_summary ||
        {};

    const detected = [];

    if (
        Number(
            summary?.adwin_detections ||
            0
        ) > 0
    ) {
        detected.push("ADWIN");
    }

    if (
        Number(
            summary?.ddm_detections ||
            0
        ) > 0
    ) {
        detected.push("DDM");
    }

    if (
        Number(
            summary?.page_hinkley_detections ||
            0
        ) > 0
    ) {
        detected.push("Page-Hinkley");
    }

    return detected.length > 0
        ? detected.join(" + ")
        : "Drift Detection Analysis";
}

function buildSmoothPath(points) {
    if (
        !Array.isArray(points) ||
        points.length === 0
    ) {
        return "";
    }

    if (points.length === 1) {
        return `M ${points[0].x} ${points[0].y}`;
    }

    let path =
        `M ${points[0].x} ${points[0].y}`;

    for (
        let index = 0;
        index < points.length - 1;
        index += 1
    ) {
        const current =
            points[index];

        const next =
            points[index + 1];

        const midpointX =
            (
                current.x +
                next.x
            ) / 2;

        path +=
            ` C ${midpointX} ${current.y},` +
            ` ${midpointX} ${next.y},` +
            ` ${next.x} ${next.y}`;
    }

    return path;
}

function buildAreaPath(points) {
    if (
        !Array.isArray(points) ||
        points.length === 0
    ) {
        return "";
    }

    const linePath =
        buildSmoothPath(points);

    const first =
        points[0];

    const last =
        points[points.length - 1];

    return (
        `${linePath} ` +
        `L ${last.x} 100 ` +
        `L ${first.x} 100 Z`
    );
}

function getObjectByPaths(root, paths) {
    for (const path of paths) {
        const value = path.split(".").reduce(
            (current, key) => current?.[key],
            root
        );
        if (value && typeof value === "object" && !Array.isArray(value)) {
            return value;
        }
    }
    return null;
}

function normalizeComparisonMetricName(value) {
    const key = String(value || "")
        .toLowerCase()
        .trim()
        .replace(/[\s%-]+/g, "_")
        .replace(/[^a-z0-9_]/g, "");

    const aliases = {
        accuracy_score: "accuracy",
        precision_score: "precision",
        recall_score: "recall",
        f1: "f1_score",
        f1score: "f1_score",
        r2: "r2_score",
        r_squared: "r2_score",
        r_squared_score: "r2_score",
        r_score: "r2_score",
        r2score: "r2_score",
        root_mean_squared_error: "rmse",
        mean_absolute_error: "mae",
        mean_squared_error: "mse",
    };

    return aliases[key] || key;
}

function getComparisonRowValue(row, keys) {
    for (const key of keys) {
        const value = row?.[key];
        if (value !== undefined && value !== null && Number.isFinite(Number(value))) {
            return Number(value);
        }
    }
    return null;
}

function inferComparisonProblemType(workflowResult, retraining, currentMetrics, candidateMetrics, rowsFromPayload, streamResult, activeModel) {
    const metadata = getModelMetadata(workflowResult);
    const explicitValues = [
        workflowResult?.problem_type,
        workflowResult?.problemType,
        retraining?.problem_type,
        retraining?.problemType,
        retraining?.evaluation?.problem_type,
        retraining?.evaluation?.problemType,
        metadata?.problem_type,
        metadata?.problemType,
        activeModel?.problem_type,
        activeModel?.problemType,
        streamResult?.problem_type,
    ];

    for (const value of explicitValues) {
        const normalized = normalizeProblemType(value);
        if (normalized) return normalized;
    }

    const metricKeys = [
        ...Object.keys(currentMetrics || {}),
        ...Object.keys(candidateMetrics || {}),
        ...(rowsFromPayload || []).map((row) => row.metric),
    ].map(normalizeComparisonMetricName);

    if (metricKeys.some((key) => ["r2_score", "rmse", "mae", "mse"].includes(key))) {
        return "regression";
    }
    if (metricKeys.some((key) => ["accuracy", "precision", "recall", "f1_score", "roc_auc", "auc"].includes(key))) {
        return "classification";
    }

    return null;
}

const COMPARISON_METRICS = {
    classification: [
        { key: "accuracy", label: "Accuracy", direction: "higher", percentage: true },
        { key: "precision", label: "Precision", direction: "higher", percentage: true },
        { key: "recall", label: "Recall", direction: "higher", percentage: true },
        { key: "f1_score", label: "F1 Score", direction: "higher", percentage: true },
        { key: "roc_auc", label: "ROC AUC", direction: "higher", percentage: true },
    ],
    regression: [
        { key: "r2_score", label: "R² Score", direction: "higher", percentage: false },
        { key: "rmse", label: "RMSE", direction: "lower", percentage: false },
        { key: "mae", label: "MAE", direction: "lower", percentage: false },
        { key: "mse", label: "MSE", direction: "lower", percentage: false },
    ],
};

function formatComparisonValue(metric, value) {
    if (!Number.isFinite(Number(value))) return "—";
    const numeric = Number(value);
    if (metric.percentage) {
        const percentage = numeric >= 0 && numeric <= 1 ? numeric * 100 : numeric;
        return `${percentage.toFixed(2)}%`;
    }
    return numeric.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function buildModelComparison(workflowResult, retraining, streamResult, activeModel) {
    const comparison =
        retraining?.comparison ||
        retraining?.metric_comparison ||
        retraining?.model_comparison ||
        workflowResult?.retraining?.comparison ||
        workflowResult?.retraining?.metric_comparison ||
        {};

    const candidateMetrics = getObjectByPaths(retraining, [
        "candidate_metrics", "candidateMetrics", "candidate_model_metrics",
        "candidateModelMetrics", "candidate_model.metrics", "candidateModel.metrics",
        "candidate.metrics", "candidate", "candidate_model", "new_model.metrics", "newModel.metrics",
        "retrained_model.metrics", "retrainedModel.metrics",
        "evaluation.candidate_metrics", "evaluation.candidateMetrics",
        "evaluation.candidate.metrics", "candidate_evaluation.metrics",
        "candidateEvaluation.metrics", "candidate_result.metrics",
        "candidateResult.metrics", "comparison.candidate_metrics",
        "comparison.candidateMetrics", "comparison.candidate.metrics",
        "metric_comparison.candidate_metrics", "metric_comparison.candidate.metrics",
    ]) || getObjectByPaths(comparison, [
        "candidate_metrics", "candidateMetrics", "candidate.metrics", "candidate_model.metrics",
    ]);

    const currentMetrics =
        getObjectByPaths(retraining, [
            "current_metrics", "currentMetrics", "current_model_metrics",
            "currentModelMetrics", "current_model.metrics", "currentModel.metrics",
            "production_model.metrics", "productionModel.metrics",
            "comparison.current_metrics", "comparison.currentMetrics",
            "comparison.current.metrics", "metric_comparison.current_metrics",
            "metric_comparison.current.metrics",
        ]) ||
        getObjectByPaths(comparison, [
            "current_metrics", "currentMetrics", "current.metrics", "current_model.metrics",
        ]) ||
        workflowResult?.current_metrics ||
        workflowResult?.metrics ||
        null;

    const rowsFromPayload = [];
    const possibleRows = [
        comparison?.metrics,
        comparison?.metric_comparison,
        retraining?.metric_comparison,
        retraining?.comparison?.metrics,
        workflowResult?.retraining?.comparison?.metrics,
    ].find(Array.isArray);

    if (Array.isArray(possibleRows)) {
        for (const row of possibleRows) {
            const metric = normalizeComparisonMetricName(row?.metric || row?.name || row?.key || row?.label);
            const current = getComparisonRowValue(row, [
                "current", "current_value", "current_model", "baseline", "production",
            ]);
            const candidate = getComparisonRowValue(row, [
                "candidate", "candidate_value", "candidate_model", "new_model", "retrained",
            ]);
            if (metric && current !== null && candidate !== null) {
                rowsFromPayload.push({ metric, current, candidate });
            }
        }
    } else {
        const metricMap = comparison?.metrics || comparison?.metric_comparison || comparison;
        if (metricMap && typeof metricMap === "object" && !Array.isArray(metricMap)) {
            for (const [rawMetric, values] of Object.entries(metricMap)) {
                if (!values || typeof values !== "object" || Array.isArray(values)) continue;
                const metric = normalizeComparisonMetricName(rawMetric);
                const current = getComparisonRowValue(values, [
                    "current", "current_value", "current_model", "baseline", "production",
                ]);
                const candidate = getComparisonRowValue(values, [
                    "candidate", "candidate_value", "candidate_model", "new_model", "retrained",
                ]);
                if (metric && current !== null && candidate !== null) {
                    rowsFromPayload.push({ metric, current, candidate });
                }
            }
        }
    }

    const problemType = inferComparisonProblemType(
        workflowResult, retraining, currentMetrics, candidateMetrics,
        rowsFromPayload, streamResult, activeModel
    );
    const definitions = problemType
        ? COMPARISON_METRICS[problemType]
        : [...COMPARISON_METRICS.classification, ...COMPARISON_METRICS.regression];

    const rows = definitions.map((definition) => {
        const payloadRow = rowsFromPayload.find((item) => item.metric === definition.key);
        const current = payloadRow?.current ?? getMetricValue(currentMetrics, definition.key);
        const candidate = payloadRow?.candidate ?? getMetricValue(candidateMetrics, definition.key);
        return current !== null && current !== undefined && candidate !== null && candidate !== undefined
            ? { ...definition, current, candidate }
            : null;
    }).filter(Boolean);

    const decisionText = [
        retraining?.acceptance_decision,
        retraining?.candidate_decision,
        retraining?.decision,
        retraining?.decision_result?.decision,
        retraining?.evaluation?.decision,
        retraining?.evaluation?.status,
        comparison?.decision,
        workflowResult?.decision?.decision_result?.decision,
        workflowResult?.decision?.decision,
    ].filter(Boolean).join(" ").toUpperCase();

    const explicitStatus = [
        retraining?.candidate_status,
        retraining?.evaluation_status,
        retraining?.acceptance_status,
        retraining?.status,
    ].filter(Boolean).join(" ").toUpperCase();

    const statusSource = `${decisionText} ${explicitStatus}`;
    const status = /REJECT|REJECTED|NOT_ACCEPTED/.test(statusSource)
        ? "Rejected"
        : /ACCEPT|APPROV|DEPLOYED|PROMOTED/.test(statusSource)
            ? "Accepted"
            : "Evaluated";

    const candidateName =
        retraining?.candidate_model_name ||
        retraining?.candidateModelName ||
        retraining?.candidate_model?.name ||
        retraining?.candidateModel?.name ||
        retraining?.new_model_name ||
        retraining?.newModelName ||
        "Candidate Model";

    const modelMetadata = getModelMetadata(workflowResult);

    // Prefer the same authoritative model identity shown in the Dashboard
    // monitoring summary; retraining payloads may contain a stale model label.
    const currentName =
        modelMetadata?.model_name ||
        modelMetadata?.model_type ||
        modelMetadata?.model_class ||
        workflowResult?.model_name ||
        workflowResult?.model_type ||
        activeModel?.model_name ||
        activeModel?.model_type ||
        activeModel?.name ||
        retraining?.current_model_name ||
        retraining?.currentModelName ||
        retraining?.current_model?.name ||
        retraining?.currentModel?.name ||
        "Current Production Model";

    return {
        available: rows.length > 0,
        rows,
        status,
        candidateName,
        currentName,
        problemType,
        metricDescription: problemType === "regression"
            ? "Regression metrics · R² higher is better; error metrics lower is better"
            : problemType === "classification"
                ? "Classification metrics · higher scores are better"
                : "Model metrics available in the evaluation payload",
        decisionText: decisionText || explicitStatus || "",
    };
}

function Dashboard() {
    const [
        workflowResult,
        setWorkflowResult,
    ] = useState(() =>
        readWorkflowResult()
    );

    const [
        streamResult,
        setStreamResult,
    ] = useState(() =>
        readStreamResult()
    );

    const [
        activeModel,
        setActiveModel,
    ] = useState(null);

    const loadActiveModel = async () => {
        try {
            const [
                registryResult,
                activeResult,
            ] = await Promise.all([
                getModelRegistry(),
                getActiveModel(),
            ]);

            const registryActiveVersion =
                registryResult?.active_version ||
                activeResult?.active_model?.version ||
                null;

            const activeFromRegistry =
                activeResult?.active_model ||
                (
                    Array.isArray(
                        registryResult?.versions
                    )
                        ? registryResult.versions.find(
                            (item) =>
                                item?.version ===
                                registryActiveVersion
                        )
                        : null
                ) ||
                null;

            setActiveModel(
                activeFromRegistry
            );
        } catch (error) {
            console.error(
                "Failed to load active model registry state:",
                error
            );
        }
    };

    useEffect(() => {
        loadActiveModel();

        const refreshActiveModel =
            () => {
                loadActiveModel();
            };

        const handleVisibilityChange =
            () => {
                if (
                    document.visibilityState ===
                    "visible"
                ) {
                    refreshActiveModel();
                }
            };

        window.addEventListener(
            "driftwatcher:model-registry-updated",
            refreshActiveModel
        );

        window.addEventListener(
            "focus",
            refreshActiveModel
        );

        document.addEventListener(
            "visibilitychange",
            handleVisibilityChange
        );

        const intervalId =
            window.setInterval(
                refreshActiveModel,
                5000
            );

        return () => {
            window.removeEventListener(
                "driftwatcher:model-registry-updated",
                refreshActiveModel
            );

            window.removeEventListener(
                "focus",
                refreshActiveModel
            );

            document.removeEventListener(
                "visibilitychange",
                handleVisibilityChange
            );

            window.clearInterval(
                intervalId
            );
        };
    }, []);

    useEffect(() => {
        const loadResults = () => {
            setWorkflowResult(
                readWorkflowResult()
            );

            setStreamResult(
                readStreamResult()
            );
        };

        loadResults();

        const handleWorkflowResult =
            (event) => {
                const result =
                    event?.detail ||
                    window.__driftWatcherWorkflowResult ||
                    readWorkflowResult();

                setWorkflowResult(
                    result || null
                );
            };

        const handleStorageChange =
            (event) => {
                if (
                    WORKFLOW_STORAGE_KEYS.includes(
                        event.key
                    ) ||
                    event.key ===
                    STREAM_STORAGE_KEY ||
                    event.key === null
                ) {
                    loadResults();
                }
            };

        window.addEventListener(
            "driftwatcher:workflow-result",
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
                "storage",
                handleStorageChange
            );
        };
    }, []);

    const dashboardData =
        useMemo(() => {
            const retraining =
                getNestedRetraining(
                    workflowResult
                );

            const modelComparison = buildModelComparison(
                workflowResult,
                retraining,
                streamResult,
                activeModel
            );

            const batchResults =
                Array.isArray(
                    streamResult?.batch_results
                )
                    ? streamResult.batch_results
                    : [];

            const latestBatch =
                batchResults.length > 0
                    ? batchResults[
                        batchResults.length - 1
                    ]
                    : null;

            const streamMetrics =
                latestBatch?.metrics &&
                typeof latestBatch.metrics ===
                    "object"
                    ? latestBatch.metrics
                    : {};

            const currentMetrics =
                workflowResult?.current_metrics ||
                retraining?.current_metrics ||
                workflowResult?.metrics ||
                streamMetrics;

            const metricContext =
                workflowResult ||
                (
                    streamResult
                        ? {
                            problem_type:
                                streamResult?.problem_type,
                        }
                        : null
                );

            const primaryMetric =
                getPrimaryMetricInfo(
                    metricContext,
                    currentMetrics
                );

            const activeModelMetrics =
                activeModel?.metrics &&
                typeof activeModel.metrics ===
                    "object"
                    ? activeModel.metrics
                    : {};

            const activeModelMetricInfo =
                getPrimaryMetricInfo(
                    {
                        primary_metric:
                            activeModel?.primary_metric ||
                            activeModel?.primaryMetric ||
                            null,

                        primaryMetric:
                            activeModel?.primaryMetric ||
                            activeModel?.primary_metric ||
                            null,

                        problem_type:
                            activeModel?.problem_type ||
                            activeModel?.problemType ||
                            workflowResult?.problem_type ||
                            workflowResult?.problemType ||
                            null,
                    },
                    activeModelMetrics
                );

            const monitoringTotals =
                getMonitoringTotals(
                    workflowResult,
                    streamResult,
                    batchResults
                );

            const driftResult =
                workflowResult?.drift_detection ||
                {};

            const detectorResults =
                driftResult?.detector_results ||
                driftResult?.detectorResults ||
                {};

            const detectorSummary =
                driftResult?.detector_summary ||
                streamResult?.detector_summary ||
                {};

            const explicitDrift =
                normalizeBoolean(
                    driftResult?.drift_detected ??
                    streamResult?.drift_detected
                );

            const summaryDetectorStatuses = [
                getDetectorSummaryStatus(
                    detectorSummary,
                    ["adwin_detections"]
                ),
                getDetectorSummaryStatus(
                    detectorSummary,
                    ["ddm_detections"]
                ),
                getDetectorSummaryStatus(
                    detectorSummary,
                    ["page_hinkley_detections"]
                ),
            ].filter((status) => status !== null);

            const summaryDrift =
                normalizeBoolean(
                    detectorSummary?.any_drift
                ) ??
                (summaryDetectorStatuses.length > 0
                    ? summaryDetectorStatuses.includes("DRIFT")
                    : null);

            const driftDetected =
                explicitDrift ??
                summaryDrift;

            const decisionWrapper =
                workflowResult?.decision ||
                {};

            const decisionResult =
                decisionWrapper?.decision_result ||
                decisionWrapper ||
                {};

            const decision =
                String(
                    decisionResult?.decision ||
                    decisionResult?.action ||
                    ""
                ).toUpperCase();

            const actionResult =
                workflowResult?.action ||
                {};

            const action =
                String(
                    actionResult?.action ||
                    actionResult?.type ||
                    ""
                ).toUpperCase();

            const qualityIssue =
                getDataQualityIssue(
                    workflowResult?.data_quality
                );

            const alerts = [];

            if (driftDetected) {
                alerts.push({
                    icon: "🔴",
                    title:
                        "Concept Drift Detected",
                });
            }

            if (qualityIssue) {
                alerts.push({
                    icon: "🟠",
                    title:
                        "Data Quality Issue",
                });
            }

            const retrainingDecisionData =
                workflowResult?.retraining
                    ?.retraining_result ||
                workflowResult?.retraining ||
                {};

            const retrainingRequired =
                decision.includes("RETRAIN") ||
                Boolean(
                    retrainingDecisionData
                        ?.retraining_requested ||
                    retrainingDecisionData
                        ?.retrainingRequested
                );

            if (
                retrainingRequired
            ) {
                alerts.push({
                    icon: "🔵",
                    title:
                        "Model Retraining Started",
                });
            }

            const actionStatus =
                String(
                    actionResult?.status ||
                    actionResult?.state ||
                    ""
                ).toLowerCase();

            if (
                action ===
                    "MODEL_DEPLOYED" ||
                (
                    decision ===
                        "RETRAIN_AND_DEPLOY" &&
                    (
                        actionStatus ===
                            "success" ||
                        actionStatus ===
                            "completed"
                    )
                )
            ) {
                alerts.push({
                    icon: "🟢",
                    title:
                        "New Model Deployed",
                });
            }

            /*
             * Performance chart
             *
             * Latest 50 batches are used.
             * The primary metric is selected dynamically.
             * Classification:
             *   Accuracy / F1 / Precision / Recall / AUC
             *
             * Regression:
             *   R² / RMSE / MAE / MSE
             */
            const chartResults =
                batchResults.slice(-50);

            const chartValuesByIndex =
                chartResults.map(
                    (item) =>
                        getBatchMetricValue(
                            item,
                            primaryMetric.key,
                            primaryMetric.problemType
                        )
                );

            const chartValues =
                chartValuesByIndex.filter(
                    (value) =>
                        value !== null &&
                        Number.isFinite(value)
                );

            const minValue =
                chartValues.length > 0
                    ? Math.min(
                        ...chartValues
                    )
                    : null;

            const maxValue =
                chartValues.length > 0
                    ? Math.max(
                        ...chartValues
                    )
                    : null;

            const buildChartPoints =
                (
                    values,
                    metricInfo
                ) => {
                    return values
                        .map(
                            (
                                rawValue,
                                index
                            ) => {
                                if (
                                    rawValue === null ||
                                    !Number.isFinite(
                                        rawValue
                                    )
                                ) {
                                    return null;
                                }

                                /*
                                 * The graph must represent the actual
                                 * metric value on the Y-axis.
                                 *
                                 * For example, if R² values are
                                 * 0.8229, 0.8471 and 0.8377, the
                                 * graph uses those actual values.
                                 * The visual position is normalized
                                 * only to fit the SVG coordinate system;
                                 * the Y-axis labels below show the real
                                 * metric values.
                                 *
                                 * Do NOT reverse the plotted value for
                                 * lower-is-better metrics. Direction is
                                 * handled separately by the trend colour.
                                 */
                                let normalized =
                                    50;

                                if (
                                    minValue !== null &&
                                    maxValue !== null
                                ) {
                                    if (
                                        maxValue !==
                                        minValue
                                    ) {
                                        const relative =
                                            (
                                                rawValue -
                                                minValue
                                            ) /
                                            (
                                                maxValue -
                                                minValue
                                            );

                                        normalized =
                                            Math.max(
                                                0,
                                                Math.min(
                                                    100,
                                                    relative *
                                                        100
                                                )
                                            );
                                    } else {
                                        normalized =
                                            50;
                                    }
                                }

                                const x =
                                    chartResults.length <=
                                    1
                                        ? 50
                                        : 4 +
                                            (
                                                index /
                                                (
                                                    chartResults.length -
                                                    1
                                                )
                                            ) *
                                                92;

                                const y =
                                    88 -
                                    (
                                        normalized /
                                        100
                                    ) *
                                        76;

                                return {
                                    x:
                                        Number(
                                            x.toFixed(2)
                                        ),

                                    y:
                                        Number(
                                            y.toFixed(2)
                                        ),

                                    value:
                                        rawValue,

                                    batch:
                                        chartResults[
                                            index
                                        ]?.batch_number,
                                };
                            }
                        )
                        .filter(Boolean);
                };

            const chartPoints =
                buildChartPoints(
                    chartValuesByIndex,
                    primaryMetric
                );

            const chartPath =
                buildSmoothPath(
                    chartPoints
                );

            const chartAreaPath =
                buildAreaPath(
                    chartPoints
                );

            /*
             * Market-style trend segments.
             * Green means the metric moved in the desired direction;
             * red means it moved in the undesired direction.
             */
            const chartTrendSegments =
                chartPoints
                    .slice(0, -1)
                    .map((point, index) => {
                        const nextPoint =
                            chartPoints[index + 1];
                        const currentValue = point.value;
                        const nextValue = nextPoint?.value;

                        if (
                            nextPoint?.x === undefined ||
                            !Number.isFinite(Number(currentValue)) ||
                            !Number.isFinite(Number(nextValue))
                        ) {
                            return null;
                        }

                        const delta =
                            Number(nextValue) - Number(currentValue);
                        let trend = "neutral";

                        if (Math.abs(delta) > 0.0000001) {
                            if (primaryMetric.direction === "lower") {
                                trend = delta < 0 ? "improving" : "declining";
                            } else if (primaryMetric.direction === "higher") {
                                trend = delta > 0 ? "improving" : "declining";
                            }
                        }

                        return {
                            x1: point.x,
                            y1: point.y,
                            x2: nextPoint.x,
                            y2: nextPoint.y,
                            trend,
                        };
                    })
                    .filter(Boolean);

            const latestChartValue =
                chartPoints.length > 0
                    ? chartPoints[chartPoints.length - 1].value
                    : null;

            const previousChartValue =
                chartPoints.length > 1
                    ? chartPoints[chartPoints.length - 2].value
                    : null;

            const latestDelta =
                Number.isFinite(Number(latestChartValue)) &&
                Number.isFinite(Number(previousChartValue))
                    ? Number(latestChartValue) - Number(previousChartValue)
                    : null;

            const latestTrend =
                latestDelta === null || Math.abs(latestDelta) <= 0.0000001
                    ? "neutral"
                    : primaryMetric.direction === "lower"
                    ? latestDelta < 0
                        ? "improving"
                        : "declining"
                    : primaryMetric.direction === "higher"
                    ? latestDelta > 0
                        ? "improving"
                        : "declining"
                    : "neutral";

            const accuracyValuesByIndex =
                chartResults.map(
                    (item) =>
                        getBatchMetricValue(
                            item,
                            "accuracy",
                            "classification"
                        )
                );

            const accuracyPoints =
                accuracyValuesByIndex
                    .map(
                        (
                            rawValue,
                            index
                        ) => {
                            if (
                                rawValue === null ||
                                !Number.isFinite(
                                    rawValue
                                )
                            ) {
                                return null;
                            }

                            const percent =
                                rawValue >= 0 &&
                                rawValue <= 1
                                    ? rawValue *
                                        100
                                    : rawValue;

                            const x =
                                chartResults.length <=
                                1
                                    ? 50
                                    : 4 +
                                        (
                                            index /
                                            (
                                                chartResults.length -
                                                1
                                            )
                                        ) *
                                            92;

                            const y =
                                88 -
                                (
                                    Math.max(
                                        0,
                                        Math.min(
                                            100,
                                            percent
                                        )
                                    ) /
                                    100
                                ) *
                                    76;

                            return {
                                x:
                                    Number(
                                        x.toFixed(2)
                                    ),
                                y:
                                    Number(
                                        y.toFixed(2)
                                    ),
                                value:
                                    rawValue,
                            };
                        }
                    )
                    .filter(Boolean);

            const accuracyPath =
                buildSmoothPath(
                    accuracyPoints
                );

            const labelCount =
                Math.min(
                    7,
                    chartResults.length
                );

            const chartLabels =
                Array.from(
                    {
                        length:
                            labelCount,
                    },
                    (_, index) => {
                        const sourceIndex =
                            labelCount === 1
                                ? 0
                                : Math.round(
                                    (
                                        index /
                                        (
                                            labelCount -
                                            1
                                        )
                                    ) *
                                    (
                                        chartResults.length -
                                        1
                                    )
                                );

                        const item =
                            chartResults[
                                sourceIndex
                            ];

                        return item?.batch_number !==
                            undefined
                            ? `B${item.batch_number}`
                            : "—";
                    }
                );

            const detectorCards = [
                {
                    name: "ADWIN",

                    status:
                        getDetectorStatus(
                            detectorResults,
                            [
                                "ADWIN",
                                "adwin",
                            ]
                        ) ||
                        getDetectorSummaryStatus(
                            detectorSummary,
                            [
                                "adwin_detections",
                            ]
                        ) ||
                        "UNKNOWN",
                },

                {
                    name: "DDM",

                    status:
                        getDetectorStatus(
                            detectorResults,
                            [
                                "DDM",
                                "ddm",
                            ]
                        ) ||
                        getDetectorSummaryStatus(
                            detectorSummary,
                            [
                                "ddm_detections",
                            ]
                        ) ||
                        "UNKNOWN",
                },

                {
                    name: "Page-Hinkley",

                    status:
                        getDetectorStatus(
                            detectorResults,
                            [
                                "PageHinkley",
                                "page_hinkley",
                                "Page-Hinkley",
                            ]
                        ) ||
                        getDetectorSummaryStatus(
                            detectorSummary,
                            [
                                "page_hinkley_detections",
                            ]
                        ) ||
                        "UNKNOWN",
                },
            ];

            const agentStatuses =
                getWorkflowAgentStatuses(
                    workflowResult
                );

            const workflowModelVersion =
                actionResult?.details?.version ||
                actionResult?.details?.deployment
                    ?.active_version ||
                actionResult?.version ||
                null;

            const modelMetadata =
                getModelMetadata(
                    workflowResult
                );

            const modelName =
                modelMetadata?.model_name ||
                modelMetadata?.model_type ||
                modelMetadata?.model_class ||
                workflowResult?.model_name ||
                workflowResult?.model_type ||
                null;

            const framework =
                modelMetadata?.framework ||
                workflowResult?.framework ||
                null;

            return {
                primaryMetric,

                modelComparison,

                // Always show the metric of the model currently being monitored.
                // Do not use the registry active model here because the registry may
                // contain a different production model from the current test run.
                activeModelMetric:
                    primaryMetric,

                activeModelVersion:
                    null,

                totalInstances:
                    monitoringTotals.totalInstances,

                predictionErrors:
                    monitoringTotals.predictionErrors,

                monitoringSource:
                    monitoringTotals.source,

                driftDetected,

                detectorNames:
                    getDetectorNames(
                        driftResult,
                        streamResult
                    ),

                alerts,

                activeAlertCount:
                    alerts.filter(
                        (alert) =>
                            alert.title ===
                                "Concept Drift Detected" ||
                            alert.title ===
                                "Data Quality Issue"
                    ).length,

                chartPoints,

                chartPath,

                chartAreaPath,

                chartLabels,

                chartHasData:
                    chartPoints.length > 0,

                chartTrendSegments,

                latestTrend,

                chartMetricLabel:
                    primaryMetric.label,

                chartLatest:
                    chartPoints.length > 0
                        ? chartPoints[
                            chartPoints.length -
                            1
                        ]
                        : null,

                chartAverage:
                    chartValues.length > 0
                        ? chartValues.reduce(
                            (
                                sum,
                                value
                            ) =>
                                sum +
                                value,
                            0
                        ) /
                        chartValues.length
                        : null,

                chartMin:
                    minValue,

                chartMax:
                    maxValue,

                accuracyPoints,

                accuracyPath,

                detectorCards,

                workflowCompleted:
                    String(
                        workflowResult?.status ||
                        ""
                    ).toLowerCase() ===
                    "completed",

                systemStatus:
                    String(
                        workflowResult?.status ||
                        ""
                    ).toLowerCase() ===
                        "completed" ||
                    String(
                        streamResult?.status ||
                        ""
                    ).toLowerCase() ===
                        "success"
                        ? "System Operational"
                        : String(
                            workflowResult?.status ||
                            ""
                        ).toLowerCase() ===
                            "error" ||
                            String(
                                streamResult?.status ||
                                ""
                            ).toLowerCase() ===
                                "error"
                            ? "Workflow Error"
                            : "Monitoring Pending",

                workflowModelVersion,

                modelName,

                framework,

                agentStatuses,
            };
        }, [
            workflowResult,
            streamResult,
            activeModel,
        ]);

    const primaryMetricText =
        formatPrimaryMetric(
            dashboardData.activeModelMetric
        );

    const totalInstancesText =
        formatCount(
            dashboardData.totalInstances
        );

    const alertCount =
        dashboardData.activeAlertCount;

    const agentNames = [
        "Drift Detection Agent",
        "Root Cause Agent",
        "Data Quality Agent",
        "Retraining Agent",
        "Decision Agent",
        "Report Agent",
    ];

    const completedAgents =
        agentNames.filter(
            (agent) =>
                dashboardData.agentStatuses[
                    agent
                ] === "Completed"
        ).length;

    const styles = {
        page: {
            minHeight: "calc(100vh - 70px)",
            background:
                "linear-gradient(180deg, #f7faff 0%, #f3f7fc 100%)",
            padding:
                "26px 30px 42px",
        },

        pageHeading: {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 20,
            marginBottom: 24,
        },

        headingTitle: {
            margin: 0,
            color: "#14284a",
            fontSize: 25,
            fontWeight: 750,
            letterSpacing: "-0.5px",
        },

        headingSubtitle: {
            margin:
                "7px 0 0",
            color: "#8090a8",
            fontSize: 12.5,
            lineHeight: 1.6,
        },

        systemStatus: {
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding:
                "10px 15px",
            borderRadius: 999,
            background:
                "rgba(235, 250, 243, 0.92)",
            border:
                "1px solid #d6f2e3",
            color: "#159463",
            fontSize: 11.5,
            fontWeight: 700,
            whiteSpace: "nowrap",
            boxShadow:
                "0 5px 18px rgba(24, 144, 94, 0.06)",
        },

        dot: {
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "#24b982",
            boxShadow:
                "0 0 0 4px rgba(36,185,130,.10)",
        },

        kpiGrid: {
            display: "grid",
            gridTemplateColumns:
                "repeat(4, minmax(0, 1fr))",
            gap: 15,
            marginBottom: 17,
        },

        kpiCard: {
            position: "relative",
            overflow: "hidden",
            minHeight: 126,
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding:
                "20px 19px",
            borderRadius: 16,
            background:
                "rgba(255,255,255,.94)",
            border:
                "1px solid #e6edf6",
            boxShadow:
                "0 8px 26px rgba(39,73,115,.055)",
        },

        kpiDecor: {
            position: "absolute",
            width: 90,
            height: 90,
            right: -28,
            top: -32,
            borderRadius: "50%",
            opacity: 0.7,
        },

        kpiIcon: (
            background,
            color
        ) => ({
            position: "relative",
            zIndex: 1,
            flex:
                "0 0 44px",
            width: 44,
            height: 44,
            borderRadius: 14,
            display: "grid",
            placeItems: "center",
            background,
            color,
        }),

        kpiText: {
            position: "relative",
            zIndex: 1,
            minWidth: 0,
        },

        kpiLabel: {
            display: "block",
            color: "#7c8ca4",
            fontSize: 11,
            fontWeight: 600,
            marginBottom: 5,
        },

        kpiValue: {
            display: "block",
            color: "#152c50",
            fontSize: 23,
            lineHeight: 1.15,
            fontWeight: 780,
            letterSpacing: "-0.5px",
        },

        kpiSmall: {
            display: "block",
            marginTop: 7,
            color: "#94a0b3",
            fontSize: 9.8,
            lineHeight: 1.4,
        },

        panel: {
            position: "relative",
            background:
                "rgba(255,255,255,.96)",
            border:
                "1px solid #e5ecf5",
            borderRadius: 18,
            boxShadow:
                "0 9px 28px rgba(39,73,115,.055)",
            overflow: "hidden",
        },

        panelHeader: {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 14,
            padding:
                "20px 21px 12px",
        },

        panelTitle: {
            margin: 0,
            color: "#14284a",
            fontSize: 14.5,
            fontWeight: 750,
        },

        panelSub: {
            margin:
                "5px 0 0",
            color: "#8a98ad",
            fontSize: 10.5,
        },

        statusPill: (
            background,
            color
        ) => ({
            display: "inline-flex",
            alignItems: "center",
            padding:
                "7px 10px",
            borderRadius: 999,
            background,
            color,
            fontSize: 9.5,
            fontWeight: 750,
            whiteSpace: "nowrap",
        }),
    };

    return (
        <div className="app-shell">
            <Sidebar />

            <main className="main-area">
                <Topbar title="Dashboard" />

                <section
                    style={
                        styles.page
                    }
                >
                    <div
                        style={
                            styles.pageHeading
                        }
                    >
                        <div>
                            <h3
                                style={
                                    styles.headingTitle
                                }
                            >
                                System Overview
                            </h3>

                            <p
                                style={
                                    styles.headingSubtitle
                                }
                            >
                                Monitor your ML model
                                health, concept drift
                                and AI-powered
                                adaptation.
                            </p>
                        </div>

                        <div
                            style={
                                styles.systemStatus
                            }
                        >
                            <span
                                style={
                                    styles.dot
                                }
                            />

                            {dashboardData.systemStatus}
                        </div>
                    </div>

                    {/* KPI CARDS */}
                    <div
                        style={
                            styles.kpiGrid
                        }
                    >
                        <div
                            style={
                                styles.kpiCard
                            }
                        >
                            <div
                                style={{
                                    ...styles.kpiDecor,
                                    background:
                                        "radial-gradient(circle, rgba(56,139,255,.16), rgba(56,139,255,0))",
                                }}
                            />

                            <div
                                style={
                                    styles.kpiIcon(
                                        "#edf5ff",
                                        "#1877ef"
                                    )
                                }
                            >
                                <BarChart3
                                    size={20}
                                />
                            </div>

                            <div
                                style={
                                    styles.kpiText
                                }
                            >
                                <span
                                    style={
                                        styles.kpiLabel
                                    }
                                >
                                    {`Production ${dashboardData.activeModelMetric.label}`}
                                </span>

                                <strong
                                    style={
                                        styles.kpiValue
                                    }
                                >
                                    {
                                        primaryMetricText
                                    }
                                </strong>

                                <small
                                    style={
                                        styles.kpiSmall
                                    }
                                >
                                    {
                                        dashboardData.modelName
                                            ? `Monitoring: ${dashboardData.modelName}`
                                            : dashboardData.workflowCompleted
                                                ? "Latest workflow result"
                                                : "Monitoring result"
                                    }
                                </small>
                            </div>
                        </div>

                        <div
                            style={
                                styles.kpiCard
                            }
                        >
                            <div
                                style={{
                                    ...styles.kpiDecor,
                                    background:
                                        "radial-gradient(circle, rgba(125,91,255,.14), rgba(125,91,255,0))",
                                }}
                            />

                            <div
                                style={
                                    styles.kpiIcon(
                                        "#f2efff",
                                        "#7459df"
                                    )
                                }
                            >
                                <Database
                                    size={20}
                                />
                            </div>

                            <div
                                style={
                                    styles.kpiText
                                }
                            >
                                <span
                                    style={
                                        styles.kpiLabel
                                    }
                                >
                                    Monitored Instances
                                </span>

                                <strong
                                    style={
                                        styles.kpiValue
                                    }
                                >
                                    {
                                        totalInstancesText
                                    }
                                </strong>

                                <small
                                    style={
                                        styles.kpiSmall
                                    }
                                >
                                    {
                                        dashboardData
                                            .predictionErrors !==
                                        null
                                            ? `${formatCount(
                                                dashboardData
                                                    .predictionErrors
                                            )} prediction errors`
                                            : "No monitoring run recorded"
                                    }
                                </small>

                                <small
                                    style={{
                                        ...styles.kpiSmall,
                                        marginTop: 2,
                                    }}
                                >
                                    {
                                        dashboardData
                                            .monitoringSource
                                    }
                                </small>
                            </div>
                        </div>

                        <div
                            style={
                                styles.kpiCard
                            }
                        >
                            <div
                                style={{
                                    ...styles.kpiDecor,
                                    background:
                                        "radial-gradient(circle, rgba(244,83,105,.13), rgba(244,83,105,0))",
                                }}
                            />

                            <div
                                style={
                                    styles.kpiIcon(
                                        "#fff0f2",
                                        "#ee5367"
                                    )
                                }
                            >
                                <Activity
                                    size={20}
                                />
                            </div>

                            <div
                                style={
                                    styles.kpiText
                                }
                            >
                                <span
                                    style={
                                        styles.kpiLabel
                                    }
                                >
                                    Drift Status
                                </span>

                                <strong
                                    style={{
                                        ...styles.kpiValue,
                                        color:
                                            dashboardData.driftDetected === true
                                                ? "#e84d61"
                                                : dashboardData.driftDetected === false
                                                    ? "#159463"
                                                    : "#c18422",
                                        fontSize: 20,
                                    }}
                                >
                                    {
                                        dashboardData.driftDetected === true
                                            ? "DETECTED"
                                            : dashboardData.driftDetected === false
                                                ? "NOT DETECTED"
                                                : "UNKNOWN"
                                    }
                                </strong>

                                <small
                                    style={
                                        styles.kpiSmall
                                    }
                                >
                                    {
                                        dashboardData.driftDetected === true
                                            ? dashboardData.detectorNames
                                            : dashboardData.driftDetected === false
                                                ? "No detector reported drift"
                                                : "No confirmed detector result"
                                    }
                                </small>
                            </div>
                        </div>

                        <div
                            style={
                                styles.kpiCard
                            }
                        >
                            <div
                                style={{
                                    ...styles.kpiDecor,
                                    background:
                                        "radial-gradient(circle, rgba(245,161,48,.14), rgba(245,161,48,0))",
                                }}
                            />

                            <div
                                style={
                                    styles.kpiIcon(
                                        "#fff7e9",
                                        "#e69b27"
                                    )
                                }
                            >
                                <Bell
                                    size={20}
                                />
                            </div>

                            <div
                                style={
                                    styles.kpiText
                                }
                            >
                                <span
                                    style={
                                        styles.kpiLabel
                                    }
                                >
                                    Active Alerts
                                </span>

                                <strong
                                    style={
                                        styles.kpiValue
                                    }
                                >
                                    {
                                        alertCount
                                    }
                                </strong>

                                <small
                                    style={{
                                        ...styles.kpiSmall,
                                        color:
                                            alertCount >
                                            0
                                                ? "#e19a28"
                                                : "#94a0b3",
                                        fontWeight:
                                            alertCount >
                                            0
                                                ? 650
                                                : 500,
                                    }}
                                >
                                    {
                                        alertCount >
                                        0
                                            ? "Requires attention →"
                                            : "No active alerts"
                                    }
                                </small>
                            </div>
                        </div>
                    </div>

                    {/* CURRENT PRODUCTION VS CANDIDATE MODEL COMPARISON */}
                    <div
                        style={{
                            ...styles.panel,
                            marginBottom: 17,
                            paddingBottom: 18,
                        }}
                    >
                        <div style={styles.panelHeader}>
                            <div>
                                <h4 style={styles.panelTitle}>
                                    Production vs Candidate Model
                                </h4>
                                <p style={styles.panelSub}>
                                    {dashboardData.modelComparison.metricDescription}
                                </p>
                            </div>
                            <span
                                style={styles.statusPill(
                                    dashboardData.modelComparison.available
                                        ? dashboardData.modelComparison.status === "Rejected"
                                            ? "#fff0f2"
                                            : dashboardData.modelComparison.status === "Accepted"
                                                ? "#eaf8f1"
                                                : "#edf5ff"
                                        : "#f3f6fa",
                                    dashboardData.modelComparison.available
                                        ? dashboardData.modelComparison.status === "Rejected"
                                            ? "#df5264"
                                            : dashboardData.modelComparison.status === "Accepted"
                                                ? "#159463"
                                                : "#287cf0"
                                        : "#7d8ca2"
                                )}
                            >
                                {dashboardData.modelComparison.available
                                    ? `Candidate ${dashboardData.modelComparison.status}`
                                    : "No candidate evaluation"}
                            </span>
                        </div>

                        {dashboardData.modelComparison.available ? (
                            <div style={{ padding: "4px 20px 8px" }}>
                                <div style={{
                                    display: "flex",
                                    flexWrap: "wrap",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    gap: 12,
                                    marginBottom: 14,
                                }}>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
                                        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, color: "#526984", fontSize: 11, fontWeight: 650 }}>
                                            <i style={{ width: 10, height: 10, borderRadius: 3, background: "linear-gradient(135deg,#438cff,#2563eb)" }} />
                                            {dashboardData.modelComparison.currentName}
                                        </span>
                                        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, color: "#526984", fontSize: 11, fontWeight: 650 }}>
                                            <i style={{ width: 10, height: 10, borderRadius: 3, background: "linear-gradient(135deg,#35d6a0,#079669)" }} />
                                            {dashboardData.modelComparison.candidateName}
                                        </span>
                                    </div>
                                    <span style={{ color: "#8292a8", fontSize: 10, fontWeight: 600 }}>
                                        Bar heights are scaled per metric; labels show actual values
                                    </span>
                                </div>

                                <div style={{
                                    position: "relative",
                                    overflowX: "auto",
                                    borderRadius: 18,
                                    padding: "22px 18px 16px",
                                    background: "linear-gradient(145deg,#f8fbff 0%,#f2f7ff 48%,#f5fcfa 100%)",
                                    border: "1px solid #e4edf8",
                                    boxShadow: "inset 0 1px 0 rgba(255,255,255,.9)",
                                }}>
                                    <div style={{
                                        display: "grid",
                                        gridTemplateColumns: `repeat(${dashboardData.modelComparison.rows.length}, minmax(125px, 1fr))`,
                                        gap: 12,
                                        minWidth: dashboardData.modelComparison.rows.length > 4 ? `${dashboardData.modelComparison.rows.length * 137}px` : "100%",
                                        alignItems: "stretch",
                                    }}>
                                        {dashboardData.modelComparison.rows.map((metric) => {
                                            const current = Number(metric.current);
                                            const candidate = Number(metric.candidate);
                                            const maxMagnitude = Math.max(Math.abs(current), Math.abs(candidate), 0.000001);
                                            const currentHeight = Math.max(10, Math.abs(current) / maxMagnitude * 150);
                                            const candidateHeight = Math.max(10, Math.abs(candidate) / maxMagnitude * 150);
                                            const delta = candidate - current;
                                            const improved = metric.direction === "lower" ? delta < 0 : delta > 0;
                                            const unchanged = Math.abs(delta) < 1e-10;
                                            const deltaLabel = metric.percentage
                                                ? `${delta > 0 ? "+" : ""}${(Math.abs(current) <= 1 && Math.abs(candidate) <= 1 ? delta * 100 : delta).toFixed(2)} pp`
                                                : `${delta > 0 ? "+" : ""}${delta.toLocaleString(undefined, { maximumFractionDigits: 4 })}`;
                                            const changeLabel = unchanged
                                                ? "Unchanged"
                                                : delta > 0
                                                    ? "Increased"
                                                    : "Decreased";
                                            const deltaColor = unchanged ? "#718198" : improved ? "#07865f" : "#d9485b";

                                            return (
                                                <div key={metric.key} style={{
                                                    minWidth: 0,
                                                    padding: "12px 9px 10px",
                                                    borderRadius: 13,
                                                    background: "rgba(255,255,255,.82)",
                                                    border: "1px solid #e5edf6",
                                                    display: "flex",
                                                    flexDirection: "column",
                                                }}>
                                                    <div style={{
                                                        textAlign: "center",
                                                        color: "#263c5b",
                                                        fontSize: 12,
                                                        fontWeight: 750,
                                                        minHeight: 30,
                                                        display: "flex",
                                                        alignItems: "center",
                                                        justifyContent: "center",
                                                    }}>
                                                        {metric.label}
                                                    </div>

                                                    <div style={{
                                                        height: 184,
                                                        display: "flex",
                                                        alignItems: "flex-end",
                                                        justifyContent: "center",
                                                        gap: 15,
                                                        padding: "12px 4px 0",
                                                        borderBottom: "1px solid #dce6f2",
                                                        backgroundImage: "repeating-linear-gradient(to top, transparent 0, transparent 35px, rgba(148,163,184,.13) 36px)",
                                                    }}>
                                                        <div style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", flex: "0 1 42px", minWidth: 0 }}>
                                                            <strong style={{ color: "#2563eb", fontSize: 10, marginBottom: 5, whiteSpace: "nowrap" }}>
                                                                {formatComparisonValue(metric, current)}
                                                            </strong>
                                                            <div title={`Production: ${formatComparisonValue(metric, current)}`} style={{
                                                                width: "min(100%, 38px)",
                                                                height: `${currentHeight}px`,
                                                                minHeight: 10,
                                                                borderRadius: "8px 8px 2px 2px",
                                                                background: "linear-gradient(180deg,#60a5fa,#2563eb)",
                                                                boxShadow: "0 4px 10px rgba(37,99,235,.16)",
                                                            }} />
                                                        </div>
                                                        <div style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", flex: "0 1 42px", minWidth: 0 }}>
                                                            <strong style={{ color: "#07865f", fontSize: 10, marginBottom: 5, whiteSpace: "nowrap" }}>
                                                                {formatComparisonValue(metric, candidate)}
                                                            </strong>
                                                            <div title={`Candidate: ${formatComparisonValue(metric, candidate)}`} style={{
                                                                width: "min(100%, 38px)",
                                                                height: `${candidateHeight}px`,
                                                                minHeight: 10,
                                                                borderRadius: "8px 8px 2px 2px",
                                                                background: "linear-gradient(180deg,#4adeb0,#059669)",
                                                                boxShadow: "0 4px 10px rgba(5,150,105,.16)",
                                                            }} />
                                                        </div>
                                                    </div>

                                                    <div style={{ display: "flex", justifyContent: "center", gap: 17, paddingTop: 8, color: "#71839b", fontSize: 9, fontWeight: 650 }}>
                                                        <span>Production</span>
                                                        <span>Candidate</span>
                                                    </div>
                                                    <div style={{
                                                        marginTop: 10,
                                                        padding: "6px 5px",
                                                        borderRadius: 8,
                                                        textAlign: "center",
                                                        color: deltaColor,
                                                        background: unchanged ? "#edf2f8" : improved ? "#e8f8f1" : "#fff0f2",
                                                        fontSize: 10,
                                                        fontWeight: 750,
                                                    }}>
                                                        {changeLabel} · {deltaLabel}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <p style={{ margin: "12px 2px 0", color: "#8292a8", fontSize: 9, lineHeight: 1.5 }}>
                                        Each metric is scaled independently so metrics with different units can be compared side by side. Values above each bar are the actual evaluation results. For R², higher is better; for RMSE, MAE and MSE, lower is better.
                                    </p>
                                </div>

                                <div style={{
                                    marginTop: 14,
                                    padding: "13px 15px",
                                    borderRadius: 13,
                                    background: dashboardData.modelComparison.status === "Rejected"
                                        ? "linear-gradient(110deg,#fff4f4,#fff9f7)"
                                        : dashboardData.modelComparison.status === "Accepted"
                                            ? "linear-gradient(110deg,#effbf5,#f6fffb)"
                                            : "linear-gradient(110deg,#f3f7ff,#f8fbff)",
                                    border: `1px solid ${dashboardData.modelComparison.status === "Rejected" ? "#f5d9de" : dashboardData.modelComparison.status === "Accepted" ? "#d7f0e2" : "#e2eaf5"}`,
                                    display: "flex",
                                    alignItems: "flex-start",
                                    gap: 10,
                                }}>
                                    <span style={{
                                        width: 28,
                                        height: 28,
                                        flex: "0 0 28px",
                                        borderRadius: 9,
                                        display: "grid",
                                        placeItems: "center",
                                        background: dashboardData.modelComparison.status === "Rejected" ? "#ffe5e8" : "#e4f6ed",
                                        color: dashboardData.modelComparison.status === "Rejected" ? "#d9485b" : "#07865f",
                                        fontSize: 15,
                                        fontWeight: 800,
                                    }}>
                                        {dashboardData.modelComparison.status === "Rejected" ? "!" : dashboardData.modelComparison.status === "Accepted" ? "✓" : "i"}
                                    </span>
                                    <div style={{ minWidth: 0 }}>
                                        <strong style={{ display: "block", color: dashboardData.modelComparison.status === "Rejected" ? "#bd4052" : "#24415e", fontSize: 11, marginBottom: 3 }}>
                                            {dashboardData.modelComparison.status === "Rejected"
                                                ? "Candidate rejected — production model retained"
                                                : dashboardData.modelComparison.status === "Accepted"
                                                    ? "Candidate accepted by evaluation workflow"
                                                    : "Candidate evaluation completed"}
                                        </strong>
                                        <span style={{ color: "#71839b", fontSize: 10, lineHeight: 1.6 }}>
                                            {dashboardData.modelComparison.status === "Rejected"
                                                ? "The candidate was rejected by the evaluation workflow. Review each metric and the configured acceptance criteria before deployment."
                                                : "Compare the model-specific evaluation metrics before deciding whether the candidate should replace the production model."}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div style={{
                                margin: "2px 20px 18px",
                                padding: "22px 16px",
                                borderRadius: 12,
                                border: "1px dashed #dce5f0",
                                background: "#fafcff",
                                textAlign: "center",
                            }}>
                                <strong style={{ display: "block", color: "#526984", fontSize: 12, marginBottom: 5 }}>
                                    No candidate comparison data available
                                </strong>
                                <span style={{ color: "#8796aa", fontSize: 10, lineHeight: 1.6 }}>
                                    Run a retraining evaluation that returns both production and candidate metrics. The dashboard will display only metrics actually returned by the evaluation; it will not create sample values.
                                </span>
                            </div>
                        )}
                    </div>

                    {/* MAIN CONTENT GRID */}
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns:
                                "minmax(0, 1.72fr) minmax(320px, .88fr)",
                            gap: 17,
                            marginBottom: 17,
                        }}
                    >
                        {/* PERFORMANCE GRAPH */}
                        <div
                            style={
                                styles.panel
                            }
                        >
                            <div
                                style={
                                    styles.panelHeader
                                }
                            >
                                <div>
                                    <h4
                                        style={
                                            styles.panelTitle
                                        }
                                    >
                                        Batch-wise {dashboardData.chartMetricLabel} Trend
                                    </h4>

                                    <p
                                        style={
                                            styles.panelSub
                                        }
                                    >
                                        {
                                            dashboardData.chartHasData
                                                ? `Batch-wise ${dashboardData.chartMetricLabel} across ${dashboardData.chartPoints.length} valid monitored batches · separate from candidate evaluation`
                                                : "Waiting for batch monitoring data"
                                        }
                                    </p>
                                </div>

                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 9,
                                        flexWrap: "wrap",
                                        justifyContent: "flex-end",
                                    }}
                                >
                                    {dashboardData.chartHasData && (
                                        <>
                                            <span
                                                style={{
                                                    display: "inline-flex",
                                                    alignItems: "center",
                                                    gap: 5,
                                                    color: "#159463",
                                                    fontSize: 9.5,
                                                    fontWeight: 650,
                                                }}
                                            >
                                                <i
                                                    style={{
                                                        width: 7,
                                                        height: 7,
                                                        borderRadius: "50%",
                                                        background: "#18a874",
                                                    }}
                                                />
                                                Improving
                                            </span>

                                            <span
                                                style={{
                                                    display: "inline-flex",
                                                    alignItems: "center",
                                                    gap: 5,
                                                    color: "#d65363",
                                                    fontSize: 9.5,
                                                    fontWeight: 650,
                                                }}
                                            >
                                                <i
                                                    style={{
                                                        width: 7,
                                                        height: 7,
                                                        borderRadius: "50%",
                                                        background: "#e05a68",
                                                    }}
                                                />
                                                Declining
                                            </span>

                                            <span
                                                style={{
                                                    display: "inline-flex",
                                                    alignItems: "center",
                                                    gap: 5,
                                                    padding: "5px 8px",
                                                    borderRadius: 8,
                                                    background: "#f4f7fb",
                                                    border: "1px solid #e8eef6",
                                                    color: "#50647e",
                                                    fontSize: 9.5,
                                                    fontWeight: 700,
                                                }}
                                            >
                                                Latest batch&nbsp;
                                                {dashboardData.chartLatest?.batch ?? "—"}:&nbsp;
                                                {formatChartDisplay(
                                                    dashboardData.chartLatest?.value
                                                )}
                                            </span>
                                        </>
                                    )}

                                    <span
                                        style={
                                            styles.statusPill(
                                                dashboardData.chartHasData
                                                    ? "#eaf8f1"
                                                    : "#f3f6fa",
                                                dashboardData.chartHasData
                                                    ? "#159463"
                                                    : "#7d8ca2"
                                            )
                                        }
                                    >
                                        {dashboardData.chartHasData
                                            ? "Live Trend"
                                            : "Waiting"}
                                    </span>
                                </div>
                            </div>

                            {/* GRAPH */}
                            <div
                                style={{
                                    margin:
                                        "2px 20px 0",
                                    height: 300,
                                    position:
                                        "relative",
                                    borderRadius: 15,
                                    overflow:
                                        "hidden",
                                    background:
                                        "linear-gradient(180deg, #fbfdff 0%, #f8fbff 100%)",
                                    border:
                                        "1px solid #edf2f8",
                                }}
                            >
                                {/* Background grid */}
                                <div
                                    style={{
                                        position:
                                            "absolute",
                                        inset:
                                            "18px 18px 31px 18px",
                                        backgroundImage:
                                            "linear-gradient(to right, rgba(133,157,190,.13) 1px, transparent 1px), linear-gradient(to bottom, rgba(133,157,190,.13) 1px, transparent 1px)",
                                        backgroundSize:
                                            "10% 25%",
                                        pointerEvents:
                                            "none",
                                    }}
                                />

                                {/* Soft graph glow */}
                                <div
                                    style={{
                                        position:
                                            "absolute",
                                        width: 260,
                                        height: 170,
                                        right: -80,
                                        top: -80,
                                        borderRadius:
                                            "50%",
                                        background:
                                            "radial-gradient(circle, rgba(55,132,245,.09), rgba(55,132,245,0))",
                                        pointerEvents:
                                            "none",
                                    }}
                                />

                                {/* Y-axis labels */}
                                <div
                                    style={{
                                        position:
                                            "absolute",
                                        top: 20,
                                        bottom: 33,
                                        left: 8,
                                        width: 32,
                                        display:
                                            "flex",
                                        flexDirection:
                                            "column",
                                        justifyContent:
                                            "space-between",
                                        color:
                                            "#9aa7b9",
                                        fontSize: 8.5,
                                        textAlign:
                                            "right",
                                        pointerEvents:
                                            "none",
                                    }}
                                >
                                    <span>
                                        {formatChartDisplay(
                                            dashboardData.chartMax
                                        )}
                                    </span>
                                    <span>
                                        {formatChartDisplay(
                                            dashboardData.chartMax !== null &&
                                            dashboardData.chartMin !== null
                                                ? dashboardData.chartMax -
                                                    (
                                                        dashboardData.chartMax -
                                                        dashboardData.chartMin
                                                    ) *
                                                        0.25
                                                : null
                                        )}
                                    </span>
                                    <span>
                                        {formatChartDisplay(
                                            dashboardData.chartMax !== null &&
                                            dashboardData.chartMin !== null
                                                ? (
                                                    dashboardData.chartMax +
                                                    dashboardData.chartMin
                                                ) /
                                                    2
                                                : null
                                        )}
                                    </span>
                                    <span>
                                        {formatChartDisplay(
                                            dashboardData.chartMin !== null &&
                                            dashboardData.chartMax !== null
                                                ? dashboardData.chartMin +
                                                    (
                                                        dashboardData.chartMax -
                                                        dashboardData.chartMin
                                                    ) *
                                                        0.25
                                                : null
                                        )}
                                    </span>
                                    <span>
                                        {formatChartDisplay(
                                            dashboardData.chartMin
                                        )}
                                    </span>
                                </div>

                                {/* Latest metric badge */}
                                {dashboardData.chartHasData && (
                                    <div
                                        style={{
                                            position: "absolute",
                                            top: 14,
                                            right: 16,
                                            zIndex: 3,
                                            padding: "7px 10px",
                                            borderRadius: 10,
                                            background: "rgba(255,255,255,.94)",
                                            border: "1px solid #e6edf6",
                                            boxShadow: "0 6px 18px rgba(38,76,118,.08)",
                                            backdropFilter: "blur(6px)",
                                            pointerEvents: "none",
                                        }}
                                    >
                                        <div
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 6,
                                            }}
                                        >
                                            <span
                                                style={{
                                                    width: 7,
                                                    height: 7,
                                                    borderRadius: "50%",
                                                    background:
                                                        dashboardData.latestTrend === "improving"
                                                            ? "#18a874"
                                                            : dashboardData.latestTrend === "declining"
                                                            ? "#e05a68"
                                                            : "#257cf0",
                                                }}
                                            />
                                            <span
                                                style={{
                                                    color: "#7f8fa5",
                                                    fontSize: 8.5,
                                                    fontWeight: 650,
                                                }}
                                            >
                                                Latest batch · {dashboardData.chartMetricLabel}
                                            </span>
                                        </div>

                                        <strong
                                            style={{
                                                display: "block",
                                                marginTop: 2,
                                                color: "#172f52",
                                                fontSize: 15,
                                                lineHeight: 1.15,
                                            }}
                                        >
                                            {formatChartDisplay(
                                                dashboardData.chartLatest?.value
                                            )}
                                        </strong>
                                    </div>
                                )}

                                {/* Graph SVG */}
                                <svg
                                    viewBox="0 0 100 100"
                                    preserveAspectRatio="none"
                                    style={{
                                        position:
                                            "absolute",
                                        inset:
                                            "18px 18px 32px 44px",
                                        width:
                                            "calc(100% - 62px)",
                                        height:
                                            "calc(100% - 50px)",
                                        overflow:
                                            "visible",
                                    }}
                                    aria-label={`Monitored batch ${dashboardData.chartMetricLabel} chart`}
                                >
                                    <defs>
                                        <linearGradient
                                            id="dwChartFill"
                                            x1="0"
                                            y1="0"
                                            x2="0"
                                            y2="1"
                                        >
                                            <stop
                                                offset="0%"
                                                stopColor="#1677ef"
                                                stopOpacity=".23"
                                            />
                                            <stop
                                                offset="100%"
                                                stopColor="#1677ef"
                                                stopOpacity=".015"
                                            />
                                        </linearGradient>

                                        <linearGradient
                                            id="dwChartLine"
                                            x1="0"
                                            y1="0"
                                            x2="1"
                                            y2="0"
                                        >
                                            <stop
                                                offset="0%"
                                                stopColor="#3c8df7"
                                            />
                                            <stop
                                                offset="50%"
                                                stopColor="#1677ef"
                                            />
                                            <stop
                                                offset="100%"
                                                stopColor="#6b5ce7"
                                            />
                                        </linearGradient>

                                        <filter
                                            id="dwGlow"
                                            x="-50%"
                                            y="-50%"
                                            width="200%"
                                            height="200%"
                                        >
                                            <feGaussianBlur
                                                stdDeviation="1.7"
                                                result="blur"
                                            />
                                            <feMerge>
                                                <feMergeNode
                                                    in="blur"
                                                />
                                                <feMergeNode
                                                    in="SourceGraphic"
                                                />
                                            </feMerge>
                                        </filter>
                                    </defs>

                                    {/* Area */}
                                    {dashboardData.chartHasData && (
                                        <path
                                            d={
                                                dashboardData.chartAreaPath
                                            }
                                            fill="url(#dwChartFill)"
                                        />
                                    )}

                                    {/* Main line underlay */}
                                    {dashboardData.chartHasData && (
                                        <path
                                            d={
                                                dashboardData.chartPath
                                            }
                                            fill="none"
                                            stroke="#9eb6d4"
                                            strokeWidth="3.4"
                                            strokeOpacity=".22"
                                            vectorEffect="non-scaling-stroke"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        />
                                    )}

                                    {/* Improving / declining trend segments */}
                                    {dashboardData.chartTrendSegments.map(
                                        (segment, index) => {
                                            const segmentColor =
                                                segment.trend === "improving"
                                                    ? "#18a874"
                                                    : segment.trend === "declining"
                                                    ? "#e05a68"
                                                    : "#4f8edc";

                                            return (
                                                <line
                                                    key={`trend-${index}`}
                                                    x1={segment.x1}
                                                    y1={segment.y1}
                                                    x2={segment.x2}
                                                    y2={segment.y2}
                                                    stroke={segmentColor}
                                                    strokeWidth="2.35"
                                                    vectorEffect="non-scaling-stroke"
                                                    strokeLinecap="round"
                                                    opacity=".96"
                                                />
                                            );
                                        }
                                    )}

                                    {/* Points */}
                                    {dashboardData.chartPoints.map(
                                        (
                                            point,
                                            index
                                        ) => (
                                            <g
                                                key={`${point.batch}-${index}`}
                                            >
                                                <circle
                                                    cx={
                                                        point.x
                                                    }
                                                    cy={
                                                        point.y
                                                    }
                                                    r={
                                                        index ===
                                                        dashboardData.chartPoints.length -
                                                            1
                                                            ? 3
                                                            : 2
                                                    }
                                                    fill="#ffffff"
                                                    stroke={
                                                        index ===
                                                        dashboardData.chartPoints.length -
                                                            1
                                                            ? dashboardData.latestTrend === "improving"
                                                                ? "#18a874"
                                                                : dashboardData.latestTrend === "declining"
                                                                ? "#e05a68"
                                                                : "#257cf0"
                                                            : "#257cf0"
                                                    }
                                                    strokeWidth={
                                                        index ===
                                                        dashboardData.chartPoints.length -
                                                            1
                                                            ? 2.1
                                                            : 1.2
                                                    }
                                                    vectorEffect="non-scaling-stroke"
                                                >
                                                    <title>
                                                        {`Batch ${point.batch ?? "—"}: ${formatChartDisplay(point.value)}`}
                                                    </title>
                                                </circle>
                                            </g>
                                        )
                                    )}

                                    {/* Latest point halo */}
                                    {dashboardData.chartLatest && (
                                        <circle
                                            cx={dashboardData.chartLatest.x}
                                            cy={dashboardData.chartLatest.y}
                                            r="5.8"
                                            fill={
                                                dashboardData.latestTrend === "improving"
                                                    ? "#18a874"
                                                    : dashboardData.latestTrend === "declining"
                                                    ? "#e05a68"
                                                    : "#257cf0"
                                            }
                                            opacity=".10"
                                        />
                                    )}

                                    {/* Latest vertical guide */}
                                    {dashboardData.chartLatest && (
                                        <line
                                            x1={
                                                dashboardData.chartLatest
                                                    .x
                                            }
                                            x2={
                                                dashboardData.chartLatest
                                                    .x
                                            }
                                            y1="0"
                                            y2="100"
                                            stroke="#257cf0"
                                            strokeDasharray="3 4"
                                            strokeWidth="0.7"
                                            opacity=".24"
                                            vectorEffect="non-scaling-stroke"
                                        />
                                    )}
                                </svg>

                                {/* Drift marker */}
                                {dashboardData.driftDetected &&
                                    dashboardData.chartPoints.length >
                                        2 && (
                                        <div
                                            style={{
                                                position:
                                                    "absolute",
                                                top: 17,
                                                left: 54,
                                                padding:
                                                    "6px 9px",
                                                borderRadius:
                                                    8,
                                                background:
                                                    "#fff0f2",
                                                border:
                                                    "1px solid #ffd9de",
                                                color:
                                                    "#df5264",
                                                fontSize: 9,
                                                fontWeight:
                                                    750,
                                                boxShadow:
                                                    "0 4px 14px rgba(220,70,90,.08)",
                                            }}
                                        >
                                            <span
                                                style={{
                                                    display:
                                                        "inline-block",
                                                    width: 6,
                                                    height: 6,
                                                    borderRadius:
                                                        "50%",
                                                    background:
                                                        "#ee5267",
                                                    marginRight: 5,
                                                }}
                                            />
                                            Drift Detected
                                        </div>
                                    )}

                                {!dashboardData.chartHasData && (
                                    <div
                                        style={{
                                            position:
                                                "absolute",
                                            inset:
                                                0,
                                            display:
                                                "grid",
                                            placeItems:
                                                "center",
                                            color:
                                                "#8796ad",
                                            fontSize: 12,
                                        }}
                                    >
                                        Run Data Stream
                                        monitoring to
                                        populate this
                                        chart.
                                    </div>
                                )}

                                {/* X-axis labels */}
                                <div
                                    style={{
                                        position:
                                            "absolute",
                                        left: 45,
                                        right: 18,
                                        bottom: 9,
                                        display:
                                            "flex",
                                        justifyContent:
                                            "space-between",
                                        color:
                                            "#94a1b3",
                                        fontSize: 8.5,
                                    }}
                                >
                                    {(
                                        dashboardData
                                            .chartLabels
                                            .length
                                            ? dashboardData.chartLabels
                                            : [
                                                "—",
                                                "—",
                                                "—",
                                                "—",
                                                "—",
                                            ]
                                    ).map(
                                        (
                                            label,
                                            index
                                        ) => (
                                            <span
                                                key={`${label}-${index}`}
                                            >
                                                {
                                                    label
                                                }
                                            </span>
                                        )
                                    )}
                                </div>
                            </div>

                            {/* Graph Summary */}
                            <div
                                style={{
                                    display:
                                        "grid",
                                    gridTemplateColumns:
                                        "repeat(4, minmax(0, 1fr))",
                                    gap: 10,
                                    padding:
                                        "12px 20px 18px",
                                }}
                            >
                                <div
                                    style={{
                                        padding:
                                            "11px 12px",
                                        borderRadius:
                                            12,
                                        background:
                                            "#f8faff",
                                        border:
                                            "1px solid #edf2f8",
                                    }}
                                >
                                    <span
                                        style={{
                                            fontSize: 9.5,
                                            color:
                                                "#8290a4",
                                        }}
                                    >
                                        Latest{" "}
                                        {
                                            dashboardData
                                                .chartMetricLabel
                                        }
                                    </span>

                                    <strong
                                        style={{
                                            display:
                                                "block",
                                            marginTop:
                                                4,
                                            color:
                                                "#152d52",
                                            fontSize: 15,
                                        }}
                                    >
                                        {
                                            formatChartDisplay(
                                                dashboardData
                                                    .chartLatest
                                                    ?.value
                                            )
                                        }
                                    </strong>
                                </div>

                                <div
                                    style={{
                                        padding:
                                            "11px 12px",
                                        borderRadius:
                                            12,
                                        background:
                                            "#f8faff",
                                        border:
                                            "1px solid #edf2f8",
                                    }}
                                >
                                    <span
                                        style={{
                                            fontSize: 9.5,
                                            color:
                                                "#8290a4",
                                        }}
                                    >
                                        Batch Average
                                    </span>

                                    <strong
                                        style={{
                                            display:
                                                "block",
                                            marginTop:
                                                4,
                                            color:
                                                "#152d52",
                                            fontSize: 15,
                                        }}
                                    >
                                        {
                                            formatChartDisplay(
                                                dashboardData
                                                    .chartAverage
                                            )
                                        }
                                    </strong>
                                </div>

                                <div
                                    style={{
                                        padding:
                                            "11px 12px",
                                        borderRadius:
                                            12,
                                        background:
                                            "#fff8f9",
                                        border:
                                            "1px solid #f8e8eb",
                                    }}
                                >
                                    <span
                                        style={{
                                            fontSize: 9.5,
                                            color:
                                                "#8290a4",
                                        }}
                                    >
                                        Lowest Batch
                                    </span>

                                    <strong
                                        style={{
                                            display:
                                                "block",
                                            marginTop:
                                                4,
                                            color:
                                                "#dc5969",
                                            fontSize: 15,
                                        }}
                                    >
                                        {
                                            formatChartDisplay(
                                                dashboardData
                                                    .chartMin
                                            )
                                        }
                                    </strong>
                                </div>

                                <div
                                    style={{
                                        padding:
                                            "11px 12px",
                                        borderRadius:
                                            12,
                                        background:
                                            "#f1fbf6",
                                        border:
                                            "1px solid #e1f3e9",
                                    }}
                                >
                                    <span
                                        style={{
                                            fontSize: 9.5,
                                            color:
                                                "#8290a4",
                                        }}
                                    >
                                        Highest Batch
                                    </span>

                                    <strong
                                        style={{
                                            display:
                                                "block",
                                            marginTop:
                                                4,
                                            color:
                                                "#159463",
                                            fontSize: 15,
                                        }}
                                    >
                                        {
                                            formatChartDisplay(
                                                dashboardData
                                                    .chartMax
                                            )
                                        }
                                    </strong>
                                </div>
                            </div>
                        </div>

                        {/* AI AGENTS */}
                        <div
                            style={
                                styles.panel
                            }
                        >
                            <div
                                style={
                                    styles.panelHeader
                                }
                            >
                                <div>
                                    <h4
                                        style={
                                            styles.panelTitle
                                        }
                                    >
                                        AI Agents Status
                                    </h4>

                                    <p
                                        style={
                                            styles.panelSub
                                        }
                                    >
                                        Multi-agent workflow
                                        for autonomous
                                        adaptation
                                    </p>
                                </div>

                                <span
                                    style={
                                        styles.statusPill(
                                            "#edf8f3",
                                            "#159463"
                                        )
                                    }
                                >
                                    {
                                        completedAgents
                                    }{" "}
                                    /{" "}
                                    {
                                        agentNames.length
                                    }{" "}
                                    Completed
                                </span>
                            </div>

                            <div
                                style={{
                                    padding:
                                        "4px 14px 16px",
                                }}
                            >
                                {agentNames.map(
                                    (
                                        agent,
                                        index
                                    ) => {
                                        const status =
                                            dashboardData
                                                .agentStatuses[
                                                agent
                                                ] ||
                                            "Waiting";

                                        const completed =
                                            status ===
                                            "Completed";

                                        const running =
                                            status ===
                                            "Running";

                                        const failed =
                                            status ===
                                            "Failed";

                                        return (
                                            <div
                                                key={
                                                    agent
                                                }
                                                style={{
                                                    display:
                                                        "grid",
                                                    gridTemplateColumns:
                                                        "31px 1fr auto",
                                                    alignItems:
                                                        "center",
                                                    gap: 10,
                                                    padding:
                                                        "11px 10px",
                                                    borderRadius:
                                                        13,
                                                    background:
                                                        index %
                                                            2 ===
                                                            0
                                                            ? "#f8faff"
                                                            : "#ffffff",
                                                    border:
                                                        "1px solid #edf2f7",
                                                    marginBottom:
                                                        7,
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        width: 30,
                                                        height: 30,
                                                        borderRadius: 10,
                                                        display:
                                                            "grid",
                                                        placeItems:
                                                            "center",
                                                        background:
                                                            completed
                                                                ? "#eaf8f1"
                                                                : running
                                                                    ? "#edf5ff"
                                                                    : failed
                                                                        ? "#fff0f2"
                                                                        : "#f3f5f9",
                                                        color:
                                                            completed
                                                                ? "#159463"
                                                                : running
                                                                    ? "#287cf0"
                                                                    : failed
                                                                        ? "#df5264"
                                                                        : "#8492a6",
                                                    }}
                                                >
                                                    <Bot
                                                        size={
                                                            15
                                                        }
                                                    />
                                                </div>

                                                <div
                                                    style={{
                                                        minWidth:
                                                            0,
                                                    }}
                                                >
                                                    <div
                                                        style={{
                                                            color:
                                                                "#243958",
                                                            fontSize:
                                                                11,
                                                            fontWeight:
                                                                700,
                                                            whiteSpace:
                                                                "nowrap",
                                                            overflow:
                                                                "hidden",
                                                            textOverflow:
                                                                "ellipsis",
                                                        }}
                                                    >
                                                        {
                                                            agent
                                                        }
                                                    </div>

                                                    <div
                                                        style={{
                                                            height: 4,
                                                            marginTop: 6,
                                                            borderRadius: 999,
                                                            background:
                                                                "#e9eef5",
                                                            overflow:
                                                                "hidden",
                                                        }}
                                                    >
                                                        <div
                                                            style={{
                                                                width:
                                                                    completed
                                                                        ? "100%"
                                                                        : running
                                                                            ? "65%"
                                                                            : "18%",
                                                                height: "100%",
                                                                borderRadius: 999,
                                                                background:
                                                                    completed
                                                                        ? "#28b783"
                                                                        : running
                                                                            ? "#428bf1"
                                                                            : failed
                                                                                ? "#ea6273"
                                                                                : "#b7c2d1",
                                                            }}
                                                        />
                                                    </div>
                                                </div>

                                                <span
                                                    style={{
                                                        minWidth: 67,
                                                        textAlign:
                                                            "center",
                                                        padding:
                                                            "6px 7px",
                                                        borderRadius:
                                                            8,
                                                        background:
                                                            completed
                                                                ? "#eaf8f1"
                                                                : running
                                                                    ? "#edf5ff"
                                                                    : failed
                                                                        ? "#fff0f2"
                                                                        : "#f3f5f9",
                                                        color:
                                                            completed
                                                                ? "#159463"
                                                                : running
                                                                    ? "#287cf0"
                                                                    : failed
                                                                        ? "#df5264"
                                                                        : "#8592a5",
                                                        fontSize:
                                                            8.5,
                                                        fontWeight:
                                                            750,
                                                    }}
                                                >
                                                    {
                                                        status
                                                    }
                                                </span>
                                            </div>
                                        );
                                    }
                                )}
                            </div>
                        </div>
                    </div>

                    {/* LOWER GRID */}
                    <div
                        style={{
                            display:
                                "grid",
                            gridTemplateColumns:
                                "minmax(0, 1fr) minmax(0, 1fr)",
                            gap: 17,
                        }}
                    >
                        {/* DRIFT DETECTION */}
                        <div
                            style={
                                styles.panel
                            }
                        >
                            <div
                                style={
                                    styles.panelHeader
                                }
                            >
                                <div>
                                    <h4
                                        style={
                                            styles.panelTitle
                                        }
                                    >
                                        Drift Detection
                                    </h4>

                                    <p
                                        style={
                                            styles.panelSub
                                        }
                                    >
                                        ADWIN · DDM ·
                                        Page-Hinkley
                                    </p>
                                </div>

                                <span
                                    style={
                                        styles.statusPill(
                                            dashboardData.driftDetected === true
                                                ? "#fff0f2"
                                                : dashboardData.driftDetected === false
                                                    ? "#eaf8f1"
                                                    : "#fff7e9",
                                            dashboardData.driftDetected === true
                                                ? "#df5264"
                                                : dashboardData.driftDetected === false
                                                    ? "#159463"
                                                    : "#a8751d"
                                        )
                                    }
                                >
                                    {
                                        dashboardData.driftDetected === true
                                            ? "Drift detected"
                                            : dashboardData.driftDetected === false
                                                ? "No drift"
                                                : "Status unknown"
                                    }
                                </span>
                            </div>

                            <div
                                style={{
                                    display:
                                        "grid",
                                    gridTemplateColumns:
                                        "repeat(3, minmax(0, 1fr))",
                                    gap: 11,
                                    padding:
                                        "5px 20px 20px",
                                }}
                            >
                                {dashboardData.detectorCards.map(
                                    (
                                        detector
                                    ) => {
                                        const isDrift =
                                            detector.status ===
                                            "DRIFT";
                                        const isUnknown =
                                            detector.status ===
                                            "UNKNOWN";

                                        return (
                                            <div
                                                key={
                                                    detector.name
                                                }
                                                style={{
                                                    position:
                                                        "relative",
                                                    minHeight:
                                                        108,
                                                    display:
                                                        "flex",
                                                    flexDirection:
                                                        "column",
                                                    justifyContent:
                                                        "center",
                                                    alignItems:
                                                        "center",
                                                    borderRadius:
                                                        14,
                                                    background:
                                                        isDrift
                                                            ? "#fff8f9"
                                                            : isUnknown
                                                                ? "#fffaf0"
                                                                : "#f8fbff",
                                                    border:
                                                        isDrift
                                                            ? "1px solid #f7dfe4"
                                                            : isUnknown
                                                                ? "1px solid #f3e6c9"
                                                                : "1px solid #e9eff7",
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        width: 35,
                                                        height: 35,
                                                        borderRadius:
                                                            11,
                                                        display:
                                                            "grid",
                                                        placeItems:
                                                            "center",
                                                        marginBottom:
                                                            8,
                                                        background:
                                                            isDrift
                                                                ? "#ffedf0"
                                                                : isUnknown
                                                                    ? "#fff3d9"
                                                                    : "#edf5ff",
                                                        color:
                                                            isDrift
                                                                ? "#e65367"
                                                                : isUnknown
                                                                    ? "#a8751d"
                                                                    : "#3d7fe0",
                                                    }}
                                                >
                                                    <Activity
                                                        size={
                                                            16
                                                        }
                                                    />
                                                </div>

                                                <strong
                                                    style={{
                                                        color:
                                                            "#243958",
                                                        fontSize:
                                                            11,
                                                    }}
                                                >
                                                    {
                                                        detector.name
                                                    }
                                                </strong>

                                                <span
                                                    style={{
                                                        marginTop:
                                                            7,
                                                        padding:
                                                            "5px 8px",
                                                        borderRadius:
                                                            7,
                                                        background:
                                                            isDrift
                                                                ? "#ffecef"
                                                                : isUnknown
                                                                    ? "#fff3d9"
                                                                    : "#eaf8f1",
                                                        color:
                                                            isDrift
                                                                ? "#df5264"
                                                                : isUnknown
                                                                    ? "#a8751d"
                                                                    : "#159463",
                                                        fontSize:
                                                            8,
                                                        fontWeight:
                                                            750,
                                                    }}
                                                >
                                                    {
                                                        detector.status
                                                    }
                                                </span>
                                            </div>
                                        );
                                    }
                                )}
                            </div>
                        </div>

                        {/* RECENT ALERTS */}
                        <div
                            style={
                                styles.panel
                            }
                        >
                            <div
                                style={
                                    styles.panelHeader
                                }
                            >
                                <div>
                                    <h4
                                        style={
                                            styles.panelTitle
                                        }
                                    >
                                        Recent Alerts
                                    </h4>

                                    <p
                                        style={
                                            styles.panelSub
                                        }
                                    >
                                        Latest system events
                                    </p>
                                </div>

                                <span
                                    style={{
                                        color:
                                            "#2377e8",
                                        fontSize:
                                            10,
                                        fontWeight:
                                            700,
                                    }}
                                >
                                    View All →
                                </span>
                            </div>

                            <div
                                style={{
                                    padding:
                                        "5px 20px 20px",
                                }}
                            >
                                {dashboardData.alerts.length >
                                0 ? (
                                    dashboardData.alerts.map(
                                        (
                                            alert,
                                            index
                                        ) => (
                                            <div
                                                key={
                                                    alert.title
                                                }
                                                style={{
                                                    display:
                                                        "flex",
                                                    alignItems:
                                                        "center",
                                                    gap: 12,
                                                    padding:
                                                        "11px 12px",
                                                    borderRadius:
                                                        12,
                                                    background:
                                                        index %
                                                            2 ===
                                                            0
                                                            ? "#f8faff"
                                                            : "#ffffff",
                                                    border:
                                                        "1px solid #edf2f7",
                                                    marginBottom:
                                                        7,
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        width: 32,
                                                        height: 32,
                                                        borderRadius:
                                                            10,
                                                        display:
                                                            "grid",
                                                        placeItems:
                                                            "center",
                                                        background:
                                                            alert.icon ===
                                                            "🔴"
                                                                ? "#fff0f2"
                                                                : alert.icon ===
                                                                    "🟠"
                                                                    ? "#fff7e9"
                                                                    : alert.icon ===
                                                                        "🔵"
                                                                        ? "#edf5ff"
                                                                        : "#eaf8f1",
                                                        fontSize:
                                                            14,
                                                    }}
                                                >
                                                    {
                                                        alert.icon
                                                    }
                                                </div>

                                                <div
                                                    style={{
                                                        flex: 1,
                                                        minWidth:
                                                            0,
                                                    }}
                                                >
                                                    <strong
                                                        style={{
                                                            display:
                                                                "block",
                                                            color:
                                                                "#243958",
                                                            fontSize:
                                                                11,
                                                        }}
                                                    >
                                                        {
                                                            alert.title
                                                        }
                                                    </strong>

                                                    <span
                                                        style={{
                                                            display:
                                                                "block",
                                                            marginTop:
                                                                3,
                                                            color:
                                                                "#8a98ad",
                                                            fontSize:
                                                                9.5,
                                                        }}
                                                    >
                                                        {index ===
                                                        0
                                                            ? dashboardData.driftDetected
                                                                ? "Significant performance change detected"
                                                                : "Latest monitoring event"
                                                            : index ===
                                                                1
                                                                ? "Latest workflow event"
                                                                : "Adaptive monitoring workflow"}
                                                    </span>
                                                </div>

                                                <span
                                                    style={{
                                                        color:
                                                            "#9aa6b7",
                                                        fontSize:
                                                            8.5,
                                                        whiteSpace:
                                                            "nowrap",
                                                    }}
                                                >
                                                    Latest
                                                </span>
                                            </div>
                                        )
                                    )
                                ) : (
                                    <div
                                        style={{
                                            padding:
                                                "22px",
                                            textAlign:
                                                "center",
                                            color:
                                                "#8b99ad",
                                            fontSize:
                                                10.5,
                                            background:
                                                "#f8faff",
                                            borderRadius:
                                                12,
                                            border:
                                                "1px solid #edf2f7",
                                        }}
                                    >
                                        No workflow alerts
                                        recorded
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}

export default Dashboard;