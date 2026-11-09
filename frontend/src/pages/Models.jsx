import { useCallback, useEffect, useMemo, useState } from "react";

import {
  CheckCircle2,
  GitBranch,
  Database,
  Activity,
  ShieldCheck,
  Clock3,
} from "lucide-react";

import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import "../App.css";

import {
  getModelRegistry,
  getActiveModel,
} from "../services/api";

/* ============================================================
   METRIC HELPERS
   ============================================================ */

const normalizeMetricKey = (metricKey) => {
  const key = String(metricKey || "")
    .trim()
    .toLowerCase();

  const aliases = {
    f1: "f1_score",
    f1_score: "f1_score",
    r2: "r2_score",
    r2_score: "r2_score",
    auc: "auc",
    roc_auc: "roc_auc",
    roc_auc_score: "roc_auc_score",
    accuracy_score: "accuracy",
    mean_absolute_error: "mae",
    mean_squared_error: "mse",
    root_mean_squared_error: "rmse",
    mean_absolute_percentage_error: "mape",
  };

  return aliases[key] || key;
};

const formatMetricLabel = (metricKey) => {
  if (!metricKey) {
    return "Metric";
  }

  const canonicalKey = normalizeMetricKey(metricKey);

  const labels = {
    accuracy: "Accuracy",
    precision: "Precision",
    recall: "Recall",
    f1_score: "F1 Score",
    r2_score: "R² Score",
    mae: "MAE",
    mse: "MSE",
    rmse: "RMSE",
    mape: "MAPE",
    auc: "AUC",
    roc_auc: "ROC AUC",
    roc_auc_score: "ROC AUC",
    log_loss: "Log Loss",
    prediction_errors: "Prediction Errors",
  };

  if (labels[canonicalKey]) {
    return labels[canonicalKey];
  }

  return String(canonicalKey)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const buildCanonicalMetrics = (metricSources = []) => {
  const sources = Array.isArray(metricSources)
    ? metricSources
    : [metricSources];

  const canonicalMetrics = {};

  sources.forEach((source) => {
    if (!source || typeof source !== "object") {
      return;
    }

    Object.entries(source).forEach(([rawKey, value]) => {
      if (
        value === null ||
        value === undefined ||
        value === ""
      ) {
        return;
      }

      const canonicalKey = normalizeMetricKey(rawKey);

      if (
        !(canonicalKey in canonicalMetrics) ||
        rawKey === canonicalKey
      ) {
        canonicalMetrics[canonicalKey] = value;
      }
    });
  });

  return canonicalMetrics;
};

const formatMetricValue = (value, metricKey = "") => {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
  }

  const numericValue = Number(value);

  if (Number.isNaN(numericValue)) {
    return String(value);
  }

  const key = normalizeMetricKey(metricKey);

  const percentageMetrics = new Set([
    "accuracy",
    "precision",
    "recall",
    "f1_score",
    "auc",
    "roc_auc",
    "roc_auc_score",
    "mape",
  ]);

  if (percentageMetrics.has(key)) {
    const percentageValue =
      Math.abs(numericValue) <= 1
        ? numericValue * 100
        : numericValue;

    return `${percentageValue.toFixed(2)}%`;
  }

  if (key === "r2_score") {
    return numericValue.toFixed(4);
  }

  if (Number.isInteger(numericValue)) {
    return numericValue.toLocaleString();
  }

  return numericValue.toFixed(4);
};

/*
 * Determines the metric family from actual backend metrics.
 * No model-name assumptions are used here.
 */
const getMetricFamily = (metrics = {}) => {
  const canonicalMetrics =
    buildCanonicalMetrics(metrics);

  const keys = Object.keys(canonicalMetrics);

  const classificationMetrics = [
    "accuracy",
    "precision",
    "recall",
    "f1_score",
    "roc_auc",
    "auc",
    "log_loss",
  ];

  const regressionMetrics = [
    "r2_score",
    "mae",
    "mse",
    "rmse",
    "mape",
  ];

  const hasClassificationMetric =
    classificationMetrics.some((key) =>
      keys.includes(key)
    );

  const hasRegressionMetric =
    regressionMetrics.some((key) =>
      keys.includes(key)
    );

  if (hasRegressionMetric && !hasClassificationMetric) {
    return "regression";
  }

  if (
    hasClassificationMetric &&
    !hasRegressionMetric
  ) {
    return "classification";
  }

  if (
    hasClassificationMetric &&
    hasRegressionMetric
  ) {
    return "mixed";
  }

  return "unknown";
};

const getMetricDefinitions = (
  metrics = {},
  primaryMetric = null
) => {
  const canonicalMetrics =
    buildCanonicalMetrics(metrics);

  const availableKeys = Object.keys(
    canonicalMetrics
  ).filter(
    (key) =>
      canonicalMetrics[key] !== null &&
      canonicalMetrics[key] !== undefined &&
      canonicalMetrics[key] !== ""
  );

  const canonicalPrimaryMetric =
    normalizeMetricKey(primaryMetric);

  /*
   * Keep classification and regression metric ordering
   * appropriate to the actual active model.
   */
  const classificationOrder = [
    "accuracy",
    "f1_score",
    "precision",
    "recall",
    "roc_auc",
    "auc",
    "log_loss",
  ];

  const regressionOrder = [
    "r2_score",
    "mae",
    "rmse",
    "mse",
    "mape",
  ];

  const family = getMetricFamily(
    canonicalMetrics
  );

  let preferredOrder;

  if (family === "regression") {
    preferredOrder = regressionOrder;
  } else if (family === "classification") {
    preferredOrder = classificationOrder;
  } else {
    preferredOrder = [
      ...classificationOrder,
      ...regressionOrder,
    ];
  }

  const orderedKeys = [
    canonicalPrimaryMetric,
    ...preferredOrder,
    ...availableKeys,
  ]
    .filter(Boolean)
    .filter(
      (key, index, array) =>
        array.indexOf(key) === index
    )
    .filter((key) =>
      availableKeys.includes(key)
    );

  return orderedKeys
    .slice(0, 4)
    .map((key) => ({
      key,
      label: formatMetricLabel(key),
    }));
};

/* ============================================================
   MODEL HELPERS
   ============================================================ */

const formatModelName = (modelType) => {
  if (!modelType) {
    return "Unknown Model";
  }

  return String(modelType)
    // XGBClassifier -> XGB Classifier
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    // RandomForest -> Random Forest
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    // Underscores / hyphens -> spaces
    .replace(/[_-]+/g, " ")
    // Normalize multiple spaces
    .replace(/\s+/g, " ")
    .trim();
};

const getModelType = (model) => {
  return (
    model?.model_type ||
    model?.model_name ||
    model?.architecture ||
    model?.name ||
    model?.type ||
    null
  );
};

/*
 * Framework comes directly from backend metadata.
 * There is intentionally NO frontend model -> framework mapping.
 */
const getFrameworkName = (model) => {
  const framework =
    model?.framework ||
    model?.framework_name ||
    model?.model_framework ||
    model?.metadata?.framework;

  if (!framework) {
    return "Not provided";
  }

  return String(framework);
};

const getWorkflowResult = () => {
  return (
    window.__driftWatcherWorkflowResult ||
    null
  );
};

const getRetrainingResult = (workflowResult) => {
  const retraining =
    workflowResult?.retraining || null;

  return (
    retraining?.retraining_result ||
    retraining ||
    null
  );
};

const getWorkflowDeploymentVersion = (
  workflowResult
) => {
  return (
    workflowResult?.action?.details?.version ||
    workflowResult?.action?.details?.deployment
      ?.active_version ||
    workflowResult?.action?.version ||
    null
  );
};

/* ============================================================
   COMPONENT
   ============================================================ */

function Models() {
  const [registry, setRegistry] = useState(null);
  const [activeModel, setActiveModel] = useState(null);
  const [workflowResult, setWorkflowResult] =
    useState(getWorkflowResult);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadRegistry = useCallback(
    async () => {
      try {
        setError("");

        const [
          registryResult,
          activeResult,
        ] = await Promise.all([
          getModelRegistry(),
          getActiveModel(),
        ]);

        setRegistry(
          registryResult || null
        );

        setActiveModel(
          activeResult?.active_model ||
            null
        );
      } catch (err) {
        console.error(
          "Failed to load model registry:",
          err
        );

        setError(
          err?.response?.data?.detail ||
            err?.message ||
            "Unable to load the model registry."
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    loadRegistry();
  }, [loadRegistry]);

  useEffect(() => {
    const handleWorkflowResult = (
      event
    ) => {
      setWorkflowResult(
        event.detail || null
      );

      loadRegistry();
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
  }, [loadRegistry]);

  /* ==========================================================
     BACKEND DATA
     ========================================================== */

  const versions =
    registry?.versions || [];

  const activeVersion =
    registry?.active_version ||
    activeModel?.version ||
    "—";

  /*
   * Match active registry entry with active-model endpoint.
   * Active endpoint data is allowed to override registry data.
   */
  const activeRegistryModel =
    versions.find(
      (model) =>
        model?.version ===
        activeVersion
    );

  const activeModelData = {
    ...(activeRegistryModel || {}),
    ...(activeModel || {}),
    metrics: {
      ...(activeRegistryModel?.metrics ||
        {}),
      ...(activeModel?.metrics || {}),
    },
  };

  const activeMetrics =
    activeModelData?.metrics || {};

  const canonicalActiveMetrics =
    useMemo(
      () =>
        buildCanonicalMetrics(
          activeMetrics
        ),
      [activeMetrics]
    );

  const activeModelType =
    getModelType(
      activeModelData
    ) || "—";

  const activeModelName =
    formatModelName(
      activeModelType
    );

  const activeFramework =
    getFrameworkName(
      activeModelData
    );

  const backendPrimaryMetric =
    activeModelData?.primary_metric ||
    activeModelData?.primaryMetric ||
    null;

  const activeMetricDefinitions =
    useMemo(
      () =>
        getMetricDefinitions(
          canonicalActiveMetrics,
          backendPrimaryMetric
        ),
      [
        canonicalActiveMetrics,
        backendPrimaryMetric,
      ]
    );

  const primaryMetricKey =
    activeMetricDefinitions[0]?.key ||
    null;

  const primaryMetricValue =
    primaryMetricKey &&
    Object.prototype.hasOwnProperty.call(
      canonicalActiveMetrics,
      primaryMetricKey
    )
      ? canonicalActiveMetrics[
          primaryMetricKey
        ]
      : null;

  /*
   * This is intentionally based on the ACTIVE model's
   * metrics. Therefore:
   *
   * XGBClassifier -> Accuracy / F1 / Precision / Recall
   *
   * XGBRegressor -> R² / MAE / RMSE / MSE
   */
  const activeMetricFamily =
    useMemo(
      () =>
        getMetricFamily(
          canonicalActiveMetrics
        ),
      [canonicalActiveMetrics]
    );

  /*
   * Registry columns follow the active model's metric
   * family rather than taking metrics from unrelated
   * historical models.
   */
  const registryMetricDefinitions =
    useMemo(() => {
      if (
        Object.keys(
          canonicalActiveMetrics
        ).length > 0
      ) {
        return getMetricDefinitions(
          canonicalActiveMetrics,
          backendPrimaryMetric
        );
      }

      /*
       * Fallback when the active model does not
       * expose metrics.
       */
      const firstMetricSource =
        versions.find(
          (model) =>
            model?.metrics &&
            Object.keys(
              model.metrics
            ).length > 0
        )?.metrics;

      return getMetricDefinitions(
        firstMetricSource || {},
        null
      );
    }, [
      canonicalActiveMetrics,
      backendPrimaryMetric,
      versions,
    ]);

  const workflowDeploymentVersion =
    getWorkflowDeploymentVersion(
      workflowResult
    );

  const hasCurrentWorkflowDeployment =
    Boolean(
      workflowDeploymentVersion
    ) &&
    workflowDeploymentVersion ===
      activeVersion &&
    workflowResult?.action?.action ===
      "MODEL_DEPLOYED" &&
    workflowResult?.action?.status ===
      "success";

  const retrainingResult = useMemo(
    () =>
      getRetrainingResult(
        workflowResult
      ),
    [workflowResult]
  );

  const trainingFeatures =
    retrainingResult?.feature_count ??
    retrainingResult?.features_count ??
    retrainingResult?.training_features ??
    null;

  const trainingSamples =
    retrainingResult?.training_samples ??
    retrainingResult?.train_samples ??
    null;

  const validationSamples =
    retrainingResult?.validation_samples ??
    retrainingResult?.val_samples ??
    null;

  const canUseWorkflowTrainingInfo =
    hasCurrentWorkflowDeployment;

  const statusLabel = loading
    ? "Loading Registry"
    : error
    ? "Registry Unavailable"
    : activeModel?.version
    ? "Model Registry Active"
    : "No Active Model";

  /* ==========================================================
     REGISTRY TABLE LAYOUT
     ========================================================== */

  /*
   * The registry uses a controlled minimum width and
   * horizontal scrolling on narrower screens.
   */
  const registryGridStyle = {
    display: "grid",
    gridTemplateColumns:
      "80px minmax(170px, 1.35fr) minmax(120px, 1fr) 115px repeat(4, minmax(105px, 1fr)) 105px",
    minWidth: "1160px",
    alignItems: "center",
  };

  const registryCellStyle = {
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    minWidth: 0,
  };

  /* ==========================================================
     VIEW
     ========================================================== */

  return (
    <div className="app-shell">
      <Sidebar />

      <main className="main-area">
        <Topbar title="Models" />

        <section className="dashboard-content deployment-page">

          {/* ==================================================
              PAGE HEADER
              ================================================== */}

          <div className="page-heading">
            <div>
              <h2>Model Management</h2>

              <p>
                Manage registered models,
                performance metrics, and
                deployment versions.
              </p>
            </div>

            <div
              className={`summary-status ${
                error
                  ? "warning"
                  : "success"
              }`}
            >
              <CheckCircle2 size={16} />

              <span>
                {statusLabel}
              </span>
            </div>
          </div>

          {/* ==================================================
              ERROR
              ================================================== */}

          {error && (
            <div
              className="dp-panel"
              style={{
                marginBottom: "18px",
                border:
                  "1px solid rgba(220, 38, 38, 0.18)",
              }}
            >
              <div className="dp-panel-header">
                <div>
                  <h3>
                    Model Registry Error
                  </h3>

                  <p>{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* ==================================================
              OVERVIEW CARDS
              ================================================== */}

          <div className="dp-overview-grid">

            {/* ACTIVE MODEL */}

            <div className="dp-overview-card">

              <div className="dp-overview-icon green">
                <CheckCircle2 size={22} />
              </div>

              <div className="dp-overview-content">

                <span>
                  Active Model
                </span>

                <strong
                  style={{
                    fontSize: "20px",
                    lineHeight: "1.2",
                    whiteSpace: "nowrap",
                  }}
                >
                  {loading
                    ? "..."
                    : activeVersion}
                </strong>

                <small>
                  Production model
                </small>

              </div>

            </div>

            {/* MODEL TYPE */}

            <div className="dp-overview-card">

              <div className="dp-overview-icon blue">
                <GitBranch size={22} />
              </div>

              <div className="dp-overview-content">

                <span>
                  Model Type
                </span>

                <strong
                  style={{
                    fontSize: "16px",
                    lineHeight: "1.3",
                    whiteSpace: "normal",
                    wordBreak: "normal",
                    overflowWrap: "normal",
                    maxWidth: "100%",
                  }}
                >
                  {loading
                    ? "..."
                    : activeModelName}
                </strong>

                <small>
                  {loading
                    ? "..."
                    : activeFramework}
                </small>

              </div>

            </div>

            {/* PRIMARY METRIC */}

            <div className="dp-overview-card">

              <div className="dp-overview-icon purple">
                <Activity size={22} />
              </div>

              <div className="dp-overview-content">

                <span>
                  {activeMetricDefinitions[0]
                    ?.label ||
                    "Primary Metric"}
                </span>

                <strong
                  style={{
                    fontSize: "20px",
                    lineHeight: "1.2",
                    whiteSpace: "nowrap",
                  }}
                >
                  {loading
                    ? "..."
                    : formatMetricValue(
                        primaryMetricValue,
                        primaryMetricKey
                      )}
                </strong>

                <small>
                  Current production
                  performance
                </small>

              </div>

            </div>

            {/* REGISTERED VERSIONS */}

            <div className="dp-overview-card">

              <div className="dp-overview-icon orange">
                <Database size={22} />
              </div>

              <div className="dp-overview-content">

                <span>
                  Registered Versions
                </span>

                <strong
                  style={{
                    fontSize: "20px",
                    lineHeight: "1.2",
                    whiteSpace: "nowrap",
                  }}
                >
                  {loading
                    ? "..."
                    : versions.length}
                </strong>

                <small>
                  Model registry
                  history
                </small>

              </div>

            </div>

          </div>

          {/* ==================================================
              ACTIVE PRODUCTION MODEL
              ================================================== */}

          <div className="dp-panel">

            <div className="dp-panel-header">

              <div>

                <h3>
                  Active Production Model
                </h3>

                <p>
                  The model currently
                  deployed and monitored
                  by DriftWatcher.
                </p>

              </div>

              <div className="dp-panel-icon green">
                <ShieldCheck size={20} />
              </div>

            </div>

            <div className="dp-active-model">

              <div className="dp-model-icon">
                <GitBranch size={26} />
              </div>

              <div className="dp-model-info">

                <span>
                  Current Version
                </span>

                <h3>
                  {loading
                    ? "Loading..."
                    : `${activeVersion} — ${activeModelName}`}
                </h3>

                <p>
                  {hasCurrentWorkflowDeployment
                    ? "Candidate model accepted and deployed by the automated workflow."
                    : "Current active model loaded from the DriftWatcher model registry."}
                </p>

              </div>

              <div className="dp-active-badge">
                <span></span>
                ACTIVE
              </div>

            </div>

            {/* DYNAMIC ACTIVE MODEL METRICS */}

            <div className="dp-model-metrics">

              {activeMetricDefinitions.length >
              0 ? (

                activeMetricDefinitions.map(
                  (metric) => (

                    <div
                      key={metric.key}
                    >

                      <span>
                        {metric.label}
                      </span>

                      <strong>
                        {formatMetricValue(
                          canonicalActiveMetrics[
                            metric.key
                          ],
                          metric.key
                        )}
                      </strong>

                    </div>

                  )
                )

              ) : (

                <div>

                  <span>
                    Performance Metrics
                  </span>

                  <strong>
                    Not recorded
                  </strong>

                </div>

              )}

            </div>

          </div>

          {/* ==================================================
              MODEL REGISTRY
              ================================================== */}

          <div className="dp-panel">

            <div className="dp-panel-header">

              <div>

                <h3>
                  Model Registry
                </h3>

                <p>
                  Live version history
                  returned by the
                  DriftWatcher backend
                  registry.
                </p>

              </div>

              <div className="dp-panel-icon blue">
                <Database size={20} />
              </div>

            </div>

            {/*
             * Horizontal scrolling is intentionally enabled
             * only for this table. This prevents the columns
             * from wrapping into two lines.
             */}

            <div
              className="dp-registry-table"
              style={{
                overflowX: "auto",
                overflowY: "hidden",
                WebkitOverflowScrolling:
                  "touch",
              }}
            >

              {/* TABLE HEADER */}

              <div
                className="dp-registry-header"
                style={{
                  ...registryGridStyle,
                  paddingLeft: "14px",
                  paddingRight: "14px",
                }}
              >

                <div style={registryCellStyle}>
                  Version
                </div>

                <div style={registryCellStyle}>
                  Model
                </div>

                <div style={registryCellStyle}>
                  Framework
                </div>

                <div style={registryCellStyle}>
                  Status
                </div>

                {registryMetricDefinitions.map(
                  (metric) => (

                    <div
                      key={metric.key}
                      style={registryCellStyle}
                      title={metric.label}
                    >
                      {metric.label}
                    </div>

                  )
                )}

                {Array.from({
                  length: Math.max(
                    0,
                    4 -
                      registryMetricDefinitions.length
                  ),
                }).map(
                  (_, index) => (

                    <div
                      key={`metric-placeholder-${index}`}
                      style={registryCellStyle}
                    >
                      Metric
                    </div>

                  )
                )}

                <div style={registryCellStyle}>
                  Deployment
                </div>

              </div>

              {/* LOADING */}

              {loading ? (

                <div
                  className="dp-registry-row"
                  style={{
                    ...registryGridStyle,
                    paddingLeft: "14px",
                    paddingRight: "14px",
                  }}
                >

                  <div
                    style={{
                      gridColumn:
                        "1 / -1",
                    }}
                  >
                    Loading model
                    registry...
                  </div>

                </div>

              ) : versions.length ===
                0 ? (

                <div
                  className="dp-registry-row"
                  style={{
                    ...registryGridStyle,
                    paddingLeft: "14px",
                    paddingRight: "14px",
                  }}
                >

                  <div
                    style={{
                      gridColumn:
                        "1 / -1",
                    }}
                  >
                    No registered
                    model versions
                    found.
                  </div>

                </div>

              ) : (

                versions.map(
                  (model) => {

                    const isActive =
                      model?.version ===
                      activeVersion;

                    const modelStatus =
                      isActive
                        ? "Active"
                        : "Registered";

                    const modelMetrics =
                      buildCanonicalMetrics(
                        model?.metrics ||
                          {}
                      );

                    return (

                      <div
                        className="dp-registry-row"
                        key={model?.version}
                        style={{
                          ...registryGridStyle,
                          paddingLeft: "14px",
                          paddingRight: "14px",
                        }}
                      >

                        {/* VERSION */}

                        <div
                          className="dp-version"
                          style={
                            registryCellStyle
                          }
                        >
                          {model?.version ||
                            "—"}
                        </div>

                        {/* MODEL */}

                        <div
                          style={
                            registryCellStyle
                          }
                          title={formatModelName(
                            getModelType(
                              model
                            )
                          )}
                        >
                          {formatModelName(
                            getModelType(
                              model
                            )
                          )}
                        </div>

                        {/* FRAMEWORK */}

                        <div
                          style={
                            registryCellStyle
                          }
                          title={getFrameworkName(
                            model
                          )}
                        >
                          {getFrameworkName(
                            model
                          )}
                        </div>

                        {/* STATUS */}

                        <div
                          style={{
                            ...registryCellStyle,
                            overflow:
                              "visible",
                          }}
                        >

                          <span
                            className={`dp-status ${
                              isActive
                                ? "active"
                                : "previous"
                            }`}
                            style={{
                              whiteSpace:
                                "nowrap",
                            }}
                          >

                            {isActive ? (

                              <CheckCircle2
                                size={13}
                              />

                            ) : (

                              <Clock3
                                size={13}
                              />

                            )}

                            {modelStatus}

                          </span>

                        </div>

                        {/* DYNAMIC METRICS */}

                        {registryMetricDefinitions.map(
                          (metric) => (

                            <div
                              key={`${model?.version}-${metric.key}`}
                              style={
                                registryCellStyle
                              }
                              title={formatMetricValue(
                                modelMetrics[
                                  metric.key
                                ],
                                metric.key
                              )}
                            >

                              <strong>
                                {formatMetricValue(
                                  modelMetrics[
                                    metric.key
                                  ],
                                  metric.key
                                )}
                              </strong>

                            </div>

                          )
                        )}

                        {/* EMPTY METRIC COLUMNS */}

                        {Array.from({
                          length: Math.max(
                            0,
                            4 -
                              registryMetricDefinitions.length
                          ),
                        }).map(
                          (_, index) => (

                            <div
                              key={`${model?.version}-metric-placeholder-${index}`}
                              style={
                                registryCellStyle
                              }
                            >
                              —
                            </div>

                          )
                        )}

                        {/* DEPLOYMENT */}

                        <div
                          style={
                            registryCellStyle
                          }
                        >
                          {isActive
                            ? "Active"
                            : "Available"}
                        </div>

                      </div>

                    );

                  }
                )

              )}

            </div>

          </div>

          {/* ==================================================
              MODEL INFORMATION
              ================================================== */}

          <div className="dp-panel">

            <div className="dp-panel-header">

              <div>

                <h3>
                  Model Information
                </h3>

                <p>
                  Technical information
                  about the currently
                  active model.
                </p>

              </div>

              <div className="dp-panel-icon blue">
                <GitBranch size={20} />
              </div>

            </div>

            <div className="dp-model-metrics">

              <div>

                <span>
                  Model Framework
                </span>

                <strong>
                  {activeFramework}
                </strong>

              </div>

              <div>

                <span>
                  Model Type
                </span>

                <strong>
                  {activeModelName}
                </strong>

              </div>

              <div>

                <span>
                  Training Features
                </span>

                <strong>
                  {canUseWorkflowTrainingInfo &&
                  trainingFeatures !==
                    null
                    ? trainingFeatures
                    : "Not recorded"}
                </strong>

              </div>

              <div>

                <span>
                  Training Samples
                </span>

                <strong>
                  {canUseWorkflowTrainingInfo &&
                  trainingSamples !==
                    null
                    ? Number(
                        trainingSamples
                      ).toLocaleString()
                    : "Not recorded"}
                </strong>

              </div>

              <div>

                <span>
                  Validation Samples
                </span>

                <strong>
                  {canUseWorkflowTrainingInfo &&
                  validationSamples !==
                    null
                    ? Number(
                        validationSamples
                      ).toLocaleString()
                    : "Not recorded"}
                </strong>

              </div>

              <div>

                <span>
                  Deployment Status
                </span>

                <strong>
                  {activeModel?.version
                    ? "Production Active"
                    : "Not Deployed"}
                </strong>

              </div>

            </div>

          </div>

          {/* ==================================================
              MODEL SAFETY
              ================================================== */}

          <div className="dp-rollback-card">

            <div className="dp-rollback-icon">
              <ShieldCheck size={24} />
            </div>

            <div className="dp-rollback-content">

              <span>
                MODEL SAFETY
              </span>

              <h3>
                Registered model
                versions remain
                available.
              </h3>

              <p>
                DriftWatcher maintains
                registered model
                versions so that a
                previous deployment
                can be restored when
                required.
              </p>

            </div>

            <button
              className="dp-rollback-button"
              type="button"
              onClick={() => {
                document
                  .querySelector(
                    ".dp-registry-table"
                  )
                  ?.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                  });
              }}
            >

              <Database size={16} />

              View Registry

            </button>

          </div>

        </section>
      </main>
    </div>
  );
}

export default Models;