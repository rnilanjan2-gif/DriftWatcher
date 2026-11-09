import { useCallback, useEffect, useMemo, useState } from "react";

import {
  GitBranch,
  CheckCircle2,
  ShieldCheck,
  Activity,
  Clock3,
  Database,
  RotateCcw,
  Server,
  BarChart3,
} from "lucide-react";

import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import "../App.css";

import {
  getModelRegistry,
  getActiveModel,
  rollbackModel,
} from "../services/api";

const WORKFLOW_STORAGE_KEY = "driftWatcherWorkflowResult";

/* ============================================================
   HELPERS
   ============================================================ */

const formatPercent = (value) => {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const numericValue = Number(value);

  if (Number.isNaN(numericValue)) {
    return "—";
  }

  return `${(numericValue * 100).toFixed(2)}%`;
};

const formatMetric = (value, digits = 2) => {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const numericValue = Number(value);

  if (Number.isNaN(numericValue)) {
    return "—";
  }

  return numericValue.toFixed(digits);
};

const formatCompactMetric = (value) => {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const numericValue = Number(value);

  if (Number.isNaN(numericValue)) {
    return "—";
  }

  const absoluteValue = Math.abs(numericValue);

  if (absoluteValue >= 1_000_000_000) {
    return `${(numericValue / 1_000_000_000).toFixed(2)}B`;
  }

  if (absoluteValue >= 1_000_000) {
    return `${(numericValue / 1_000_000).toFixed(2)}M`;
  }

  if (absoluteValue >= 1_000) {
    return `${(numericValue / 1_000).toFixed(2)}K`;
  }

  return numericValue.toFixed(2);
};

const formatModelName = (modelType) => {
  if (!modelType) {
    return "Unknown Model";
  }

  return String(modelType)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const normalizeProblemType = (problemType) => {
  if (!problemType) {
    return null;
  }

  const normalized = String(problemType).toLowerCase();

  if (normalized.includes("regress")) {
    return "regression";
  }

  if (normalized.includes("class")) {
    return "classification";
  }

  return normalized;
};

/* ============================================================
   WORKFLOW RESULT
   ============================================================ */

const getWorkflowResult = () => {
  if (typeof window === "undefined") {
    return null;
  }

  if (window.__driftWatcherWorkflowResult) {
    return window.__driftWatcherWorkflowResult;
  }

  try {
    const storedResult = window.localStorage.getItem(
      WORKFLOW_STORAGE_KEY
    );

    if (!storedResult) {
      return null;
    }

    return JSON.parse(storedResult);
  } catch (error) {
    console.warn(
      "Unable to restore stored DriftWatcher workflow result:",
      error
    );

    return null;
  }
};

const getRetrainingResult = (workflowResult) => {
  const wrapper = workflowResult?.retraining || null;

  return (
    wrapper?.retraining_result ||
    wrapper ||
    null
  );
};

const getComparison = (workflowResult) => {
  const retrainingResult = getRetrainingResult(workflowResult);

  return (
    retrainingResult?.comparison ||
    workflowResult?.retraining?.comparison ||
    {}
  );
};

/* ============================================================
   COMPONENT
   ============================================================ */

function Deployment() {
  const [registry, setRegistry] = useState(null);
  const [activeModel, setActiveModel] = useState(null);

  const [workflowResult, setWorkflowResult] = useState(
    getWorkflowResult()
  );

  const [loading, setLoading] = useState(true);
  const [rollbackLoading, setRollbackLoading] = useState(false);

  const [error, setError] = useState("");
  const [rollbackMessage, setRollbackMessage] = useState("");

  const [selectedRollbackVersion, setSelectedRollbackVersion] =
    useState("");

  /* ============================================================
     LOAD BACKEND REGISTRY
     ============================================================ */

  const loadRegistry = useCallback(async () => {
    try {
      setError("");

      const [registryResult, activeResult] = await Promise.all([
        getModelRegistry(),
        getActiveModel(),
      ]);

      setRegistry(registryResult);

      setActiveModel(
        activeResult?.active_model || null
      );

      const versions = registryResult?.versions || [];

      const backendActiveVersion =
        registryResult?.active_version ||
        activeResult?.active_model?.version;

      const rollbackCandidate =
        versions.find(
          (item) =>
            item?.version &&
            item.version !== backendActiveVersion
        )?.version || "";

      setSelectedRollbackVersion((current) => {
        if (
          current &&
          versions.some(
            (item) => item?.version === current
          ) &&
          current !== backendActiveVersion
        ) {
          return current;
        }

        return rollbackCandidate;
      });
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
  }, []);

  useEffect(() => {
    loadRegistry();
  }, [loadRegistry]);

  /* ============================================================
     LISTEN FOR LATEST WORKFLOW RESULT
     ============================================================ */

  useEffect(() => {
    const handleWorkflowResult = (event) => {
      const result = event?.detail || null;

      setWorkflowResult(result);

      if (result) {
        try {
          window.localStorage.setItem(
            WORKFLOW_STORAGE_KEY,
            JSON.stringify(result)
          );

          window.__driftWatcherWorkflowResult = result;
        } catch (storageError) {
          console.warn(
            "Unable to persist DriftWatcher workflow result:",
            storageError
          );
        }
      }

      /*
       * Important:
       * Refresh registry state, but DO NOT replace the backend
       * active model with the latest workflow model.
       *
       * The registry remains the source of truth for production
       * deployment.
       */
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

  /* ============================================================
     DERIVED STATE
     ============================================================ */

  const versions = registry?.versions || [];

  /*
   * ACTIVE PRODUCTION MODEL
   *
   * This must always come from the backend registry.
   */
  const activeVersion =
    registry?.active_version ||
    activeModel?.version ||
    "—";

  const activeMetrics =
    activeModel?.metrics || {};

  const activeModelType =
    activeModel?.model_type || "—";

  const activeProblemType = normalizeProblemType(
    activeModel?.problem_type
  );

  /*
   * LATEST WORKFLOW MODEL
   *
   * This represents the model used in the most recent
   * monitoring workflow. It does NOT mean that the model
   * has been deployed.
   */
  const workflowModel =
    workflowResult?.model || {};

  const workflowModelType =
    workflowModel?.model_type ||
    getRetrainingResult(workflowResult)?.model_type ||
    null;

  const workflowFramework =
    workflowModel?.framework ||
    null;

  const workflowProblemType = normalizeProblemType(
    workflowResult?.configuration?.problem_type ||
      workflowResult?.problem_type
  );

  const workflowModelPath =
    workflowModel?.path ||
    null;

  const comparison = useMemo(
    () => getComparison(workflowResult),
    [workflowResult]
  );

  const candidateAccepted =
    comparison?.candidate_accepted === true;

  const workflowAction =
    workflowResult?.action?.action ||
    workflowResult?.action?.details?.action ||
    null;

  const workflowActionStatus =
    workflowResult?.action?.status ||
    null;

  const hasSuccessfulDeployment =
    workflowAction === "MODEL_DEPLOYED" &&
    workflowActionStatus === "success";

  const candidateRejected =
    comparison?.candidate_accepted === false;

  const latestWorkflowHasModel =
    Boolean(workflowModelType);

  /*
   * DEPLOYMENT NOTIFICATION
   *
   * Show a success message only when the backend confirms that
   * the candidate was actually deployed. For every other completed
   * workflow outcome, keep the previous registry model as active.
   */
  const hasWorkflowDeploymentOutcome =
    Boolean(
      workflowResult &&
      (
        typeof comparison?.candidate_accepted === "boolean" ||
        workflowAction
      )
    );

  const showDeploymentNotification =
    hasWorkflowDeploymentOutcome && !loading;

  const previousProductionModelAvailable =
    Boolean(activeModel?.version && activeVersion !== "—");

  const deploymentNotification = hasSuccessfulDeployment
    ? {
        type: "success",
        title: "New production model is now active",
        message: `The candidate model was accepted, registered, and successfully deployed. Version ${activeVersion} is now serving as the active production model.`,
        activeMessage: `Active production version: ${activeVersion}`,
      }
    : {
        type: "warning",
        title: "Deployment not performed",
        message:
          candidateRejected
            ? "The newly trained candidate model did not meet the configured acceptance criteria and was not deployed."
            : workflowAction === "INVESTIGATION_REQUIRED"
              ? "The workflow requires further investigation. The candidate model was not deployed."
              : workflowAction === "DEPLOYMENT_BLOCKED"
                ? "The candidate model was not explicitly accepted, so deployment was blocked."
                : workflowAction === "MODEL_DEPLOYMENT_FAILED"
                  ? "The candidate model could not be deployed. The existing production deployment has been retained."
                  : workflowAction === "MODEL_REGISTRATION_FAILED"
                    ? "The candidate model could not be registered, so it was not deployed."
                    : "The latest workflow did not confirm a successful model deployment.",
        activeMessage: previousProductionModelAvailable
          ? `Previous production model ${activeVersion} remains active.`
          : "No active production model is currently reported by the registry.",
      };

  /* ============================================================
     ACTIVE MODEL METRICS
     ============================================================ */

  const activeMetricCards = useMemo(() => {
    const problemType = activeProblemType;

    if (problemType === "regression") {
      return [
        {
          label: "R²",
          value: formatPercent(activeMetrics.r2),
        },
        {
          label: "MAE",
          value: formatCompactMetric(activeMetrics.mae),
        },
        {
          label: "MSE",
          value: formatCompactMetric(activeMetrics.mse),
        },
        {
          label: "RMSE",
          value: formatCompactMetric(activeMetrics.rmse),
        },
      ];
    }

    return [
      {
        label: "Accuracy",
        value: formatPercent(activeMetrics.accuracy),
      },
      {
        label: "Precision",
        value: formatPercent(activeMetrics.precision),
      },
      {
        label: "Recall",
        value: formatPercent(activeMetrics.recall),
      },
      {
        label: "F1 Score",
        value: formatPercent(activeMetrics.f1_score),
      },
    ];
  }, [activeProblemType, activeMetrics]);

  /* ============================================================
     DEPLOYMENT STATUS
     ============================================================ */

  const deploymentStatus =
    activeModel?.version
      ? "ACTIVE"
      : "NOT DEPLOYED";

  const deploymentStatusText =
    activeModel?.version
      ? "Model deployed"
      : "No active model";

  /* ============================================================
     DEPLOYMENT WORKFLOW
     ============================================================ */

  const deploymentSteps = useMemo(() => {
    /*
     * These steps describe actual registry/deployment state.
     * A rejected candidate must not be shown as deployed.
     */

    const deployed =
      Boolean(activeModel?.version);

    const registered =
      hasSuccessfulDeployment ||
      Boolean(
        workflowResult?.action?.details?.version
      );

    const accepted =
      candidateAccepted ||
      hasSuccessfulDeployment;

    let candidateDescription =
      "Candidate acceptance has not been confirmed in the current workflow.";

    let candidateStatus = "Pending";

    if (candidateAccepted) {
      candidateDescription =
        "The candidate model passed the configured evaluation criteria.";
      candidateStatus = "Completed";
    } else if (candidateRejected) {
      candidateDescription =
        "The candidate model did not pass the configured evaluation criteria.";
      candidateStatus = "Rejected";
    } else if (hasSuccessfulDeployment) {
      candidateDescription =
        "The candidate model was accepted by the automated workflow.";
      candidateStatus = "Completed";
    }

    return [
      {
        title: "Candidate evaluation",
        description: candidateDescription,
        status: candidateStatus,
      },
      {
        title: "Model registered",
        description: registered
          ? "The accepted candidate is available in the model registry."
          : "No newly registered candidate is confirmed by the current workflow.",
        status: registered
          ? "Completed"
          : "Pending",
      },
      {
        title: "Model deployed",
        description: deployed
          ? `Version ${activeVersion} is currently marked active in the registry.`
          : "Deployment status is determined from the model registry.",
        status: deployed
          ? "Completed"
          : "Pending",
      },
      {
        title: "Monitoring state",
        description: activeModel?.version
          ? "The active production model is available for DriftWatcher monitoring."
          : "No active model is currently available for monitoring.",
        status: activeModel?.version
          ? "Active"
          : "Pending",
      },
    ];
  }, [
    candidateAccepted,
    candidateRejected,
    hasSuccessfulDeployment,
    activeModel?.version,
    activeVersion,
    workflowResult,
  ]);

  /* ============================================================
     MONITORING WORKFLOW HEALTH
     ============================================================ */

  const monitoringWorkflowStatus = workflowResult
    ? "READY"
    : activeModel?.version
      ? "ACTIVE"
      : "IDLE";

  const monitoringWorkflowDescription =
    workflowResult
      ? "Latest workflow result is available for this session."
      : activeModel?.version
        ? "Active production model available; no latest workflow result is stored in the current browser."
        : "No active model or workflow result is currently available.";

  /* ============================================================
     ROLLBACK
     ============================================================ */

  const handleRollback = async () => {
    if (!selectedRollbackVersion) {
      setRollbackMessage(
        "Select a registered version to roll back to."
      );
      return;
    }

    if (selectedRollbackVersion === activeVersion) {
      setRollbackMessage(
        `${selectedRollbackVersion} is already the active version.`
      );
      return;
    }

    const confirmed = window.confirm(
      `Rollback the active deployment to ${selectedRollbackVersion}?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setRollbackLoading(true);
      setRollbackMessage("");
      setError("");

      const result = await rollbackModel(
        selectedRollbackVersion
      );

      if (result?.status === "success") {
        setRollbackMessage(
          `Rollback completed. ${selectedRollbackVersion} is now active.`
        );

        await loadRegistry();
      } else {
        setRollbackMessage(
          result?.message ||
            "Rollback completed with an unexpected response."
        );
      }
    } catch (err) {
      console.error(
        "Rollback failed:",
        err
      );

      setRollbackMessage(
        err?.response?.data?.detail ||
          err?.message ||
          "Rollback failed."
      );
    } finally {
      setRollbackLoading(false);
    }
  };

  /* ============================================================
     RENDER
     ============================================================ */

  return (
    <div className="app-shell">
      <Sidebar />

      <main className="main-area">
        <Topbar title="Deployment" />

        <section className="dashboard-content deployment-page">

          {/* ==================================================
              PAGE HEADER
          ================================================== */}

          <div className="page-heading">
            <div>
              <h2>Model Deployment</h2>

              <p>
                Manage deployed model versions and monitor
                the active production model.
              </p>
            </div>

            <div className="summary-status success">
              <CheckCircle2 size={16} />

              <span>
                {deploymentStatusText}
              </span>
            </div>
          </div>

          {error && (
            <div
              style={{
                marginBottom: "16px",
                padding: "12px 14px",
                borderRadius: "10px",
                background: "#fff4f4",
                border: "1px solid #ffd5d5",
                color: "#c43d3d",
                fontSize: "12px",
              }}
            >
              {error}
            </div>
          )}

          {/* ==================================================
              OVERVIEW CARDS
          ================================================== */}

          <div className="dp-overview-grid">

            {/* DEPLOYMENT STATUS */}

            <div className="dp-overview-card">
              <div className="dp-overview-icon green">
                <CheckCircle2 size={22} />
              </div>

              <div className="dp-overview-content">
                <span>
                  Deployment Status
                </span>

                <strong
                  style={{
                    fontSize: "19px",
                    whiteSpace: "nowrap",
                  }}
                >
                  {loading
                    ? "..."
                    : deploymentStatus}
                </strong>

                <small>
                  Registry deployment state
                </small>
              </div>
            </div>

            {/* ACTIVE VERSION */}

            <div className="dp-overview-card">
              <div className="dp-overview-icon blue">
                <GitBranch size={22} />
              </div>

              <div className="dp-overview-content">
                <span>
                  Active Version
                </span>

                <strong
                  style={{
                    fontSize: "19px",
                    whiteSpace: "nowrap",
                  }}
                >
                  {loading
                    ? "..."
                    : activeVersion}
                </strong>

                <small>
                  Currently active registry version
                </small>
              </div>
            </div>

            {/* ACTIVE MODEL */}

            <div className="dp-overview-card">
              <div className="dp-overview-icon purple">
                <Activity size={22} />
              </div>

              <div className="dp-overview-content">
                <span>
                  Active Model
                </span>

                <strong
                  style={{
                    fontSize: "16px",
                    whiteSpace: "nowrap",
                  }}
                >
                  {loading
                    ? "..."
                    : formatModelName(
                        activeModelType
                      )}
                </strong>

                <small>
                  Production model in registry
                </small>
              </div>
            </div>

            {/* DEPLOYMENT MODE */}

            <div className="dp-overview-card">
              <div className="dp-overview-icon orange">
                <Server size={22} />
              </div>

              <div className="dp-overview-content">
                <span>
                  Deployment Mode
                </span>

                <strong
                  style={{
                    fontSize: "16px",
                    lineHeight: "1.2",
                    whiteSpace: "nowrap",
                    letterSpacing: "0.2px",
                  }}
                >
                  REGISTRY
                </strong>

                <small>
                  Model registry controlled
                </small>
              </div>
            </div>
          </div>

          {/* ==================================================
              DYNAMIC DEPLOYMENT NOTIFICATION
          ================================================== */}

          {showDeploymentNotification && (
            <div
              role="status"
              aria-live="polite"
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "14px",
                marginBottom: "20px",
                padding: "18px 20px",
                borderRadius: "12px",
                background:
                  deploymentNotification.type === "success"
                    ? "#f0fdf7"
                    : "#fffaf0",
                border:
                  deploymentNotification.type === "success"
                    ? "1px solid #b8ebd0"
                    : "1px solid #f4d9a6",
                boxShadow: "0 2px 8px rgba(35, 55, 80, 0.04)",
              }}
            >
              <div
                style={{
                  flexShrink: 0,
                  display: "grid",
                  placeItems: "center",
                  width: "38px",
                  height: "38px",
                  borderRadius: "10px",
                  color:
                    deploymentNotification.type === "success"
                      ? "#0b9b62"
                      : "#b7791f",
                  background:
                    deploymentNotification.type === "success"
                      ? "#d9f7e8"
                      : "#fff0cc",
                }}
              >
                {deploymentNotification.type === "success" ? (
                  <CheckCircle2 size={21} />
                ) : (
                  <ShieldCheck size={21} />
                )}
              </div>

              <div style={{ minWidth: 0, flex: 1 }}>
                <strong
                  style={{
                    display: "block",
                    marginBottom: "5px",
                    color:
                      deploymentNotification.type === "success"
                        ? "#087647"
                        : "#8a5a12",
                    fontSize: "15px",
                  }}
                >
                  {deploymentNotification.title}
                </strong>

                <p
                  style={{
                    margin: 0,
                    color: "#53677e",
                    fontSize: "12px",
                    lineHeight: 1.6,
                  }}
                >
                  {deploymentNotification.message}
                </p>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "7px",
                    marginTop: "9px",
                    color:
                      deploymentNotification.type === "success"
                        ? "#087647"
                        : previousProductionModelAvailable
                          ? "#087647"
                          : "#8a5a12",
                    fontSize: "12px",
                    fontWeight: 700,
                  }}
                >
                  {previousProductionModelAvailable ||
                  deploymentNotification.type === "success" ? (
                    <CheckCircle2 size={15} />
                  ) : null}
                  <span>{deploymentNotification.activeMessage}</span>
                </div>
              </div>
            </div>
          )}

          {/* ==================================================
              ACTIVE MODEL + LATEST WORKFLOW
          ================================================== */}

          <div className="dp-two-column">

            {/* ACTIVE PRODUCTION MODEL */}

            <div className="dp-panel">

              <div className="dp-panel-header">
                <div>
                  <h3>
                    Active Production Model
                  </h3>

                  <p>
                    The model currently registered and
                    deployed for production monitoring.
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
                      : `${activeVersion} — ${formatModelName(
                          activeModelType
                        )}`}
                  </h3>

                  <p>
                    {hasSuccessfulDeployment
                      ? "Candidate model accepted and deployed by the automated workflow."
                      : "Current active model loaded from the DriftWatcher model registry."}
                  </p>
                </div>

                <div className="dp-active-badge">
                  <span></span>
                  ACTIVE
                </div>
              </div>

              {/* ACTIVE MODEL METRICS */}

              <div className="dp-model-metrics">

                {activeMetricCards.map(
                  (metric) => (
                    <div key={metric.label}>
                      <span>
                        {metric.label}
                      </span>

                      <strong>
                        {metric.value}
                      </strong>
                    </div>
                  )
                )}

              </div>
            </div>

            {/* LATEST WORKFLOW MODEL */}

            <div className="dp-panel">

              <div className="dp-panel-header">
                <div>
                  <h3>
                    Latest Workflow Model
                  </h3>

                  <p>
                    The model used in the most recent
                    monitoring workflow. This does not
                    automatically mean it is deployed.
                  </p>
                </div>

                <div className="dp-panel-icon blue">
                  <BarChart3 size={20} />
                </div>
              </div>

              <div
                style={{
                  padding: "18px 0 6px",
                }}
              >
                {!latestWorkflowHasModel ? (
                  <div
                    style={{
                      padding: "18px",
                      borderRadius: "10px",
                      background: "#f8fbff",
                      border: "1px solid #e3edf8",
                      color: "#61758d",
                      fontSize: "13px",
                    }}
                  >
                    No latest workflow model is available
                    in the current browser session.
                  </div>
                ) : (
                  <>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "14px",
                        padding: "14px",
                        borderRadius: "10px",
                        background: "#f8fbff",
                        border: "1px solid #e3edf8",
                      }}
                    >
                      <div
                        className="dp-model-icon"
                        style={{
                          flexShrink: 0,
                        }}
                      >
                        <Activity size={24} />
                      </div>

                      <div
                        style={{
                          minWidth: 0,
                          flex: 1,
                        }}
                      >
                        <span
                          style={{
                            display: "block",
                            fontSize: "11px",
                            color: "#8295aa",
                            marginBottom: "4px",
                          }}
                        >
                          Latest Workflow Model
                        </span>

                        <strong
                          style={{
                            display: "block",
                            fontSize: "17px",
                            color: "#29425f",
                            marginBottom: "4px",
                          }}
                        >
                          {formatModelName(
                            workflowModelType
                          )}
                        </strong>

                        <span
                          style={{
                            display: "block",
                            fontSize: "11px",
                            color: "#6e8298",
                          }}
                        >
                          {workflowFramework
                            ? `Framework: ${workflowFramework}`
                            : "Framework information unavailable"}
                        </span>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(2, minmax(0, 1fr))",
                        gap: "10px",
                        marginTop: "12px",
                      }}
                    >
                      <div
                        style={{
                          padding: "12px",
                          borderRadius: "9px",
                          background: "#ffffff",
                          border: "1px solid #e5edf7",
                        }}
                      >
                        <span
                          style={{
                            display: "block",
                            fontSize: "10px",
                            color: "#8295aa",
                            marginBottom: "4px",
                          }}
                        >
                          Problem Type
                        </span>

                        <strong
                          style={{
                            fontSize: "13px",
                            color: "#405873",
                            textTransform: "capitalize",
                          }}
                        >
                          {workflowProblemType ||
                            "—"}
                        </strong>
                      </div>

                      <div
                        style={{
                          padding: "12px",
                          borderRadius: "9px",
                          background: "#ffffff",
                          border: "1px solid #e5edf7",
                        }}
                      >
                        <span
                          style={{
                            display: "block",
                            fontSize: "10px",
                            color: "#8295aa",
                            marginBottom: "4px",
                          }}
                        >
                          Workflow Status
                        </span>

                        <strong
                          style={{
                            fontSize: "13px",
                            color: candidateRejected
                              ? "#c43d3d"
                              : candidateAccepted ||
                                  hasSuccessfulDeployment
                                ? "#0b9b62"
                                : "#405873",
                          }}
                        >
                          {candidateRejected
                            ? "Candidate Rejected"
                            : candidateAccepted ||
                                hasSuccessfulDeployment
                              ? "Candidate Accepted"
                              : "Evaluated"}
                        </strong>
                      </div>
                    </div>

                    <div
                      style={{
                        marginTop: "12px",
                        padding: "12px",
                        borderRadius: "9px",
                        background:
                          candidateRejected
                            ? "#fff7f7"
                            : hasSuccessfulDeployment
                              ? "#f3fff9"
                              : "#f8fbff",
                        border:
                          candidateRejected
                            ? "1px solid #ffdada"
                            : hasSuccessfulDeployment
                              ? "1px solid #d6f3e5"
                              : "1px solid #e3edf8",
                        fontSize: "11px",
                        lineHeight: "1.5",
                        color: "#61758d",
                      }}
                    >
                      {candidateRejected
                        ? "This workflow model was evaluated but was not promoted to production because the candidate did not satisfy the configured acceptance criteria."
                        : hasSuccessfulDeployment
                          ? "This workflow model was accepted and successfully deployed by the automated workflow."
                          : "This workflow model represents the latest monitoring run. Production deployment is controlled separately by the backend model registry."}
                    </div>

                    {workflowModelPath && (
                      <div
                        style={{
                          marginTop: "10px",
                          fontSize: "10px",
                          color: "#8a9caf",
                          wordBreak: "break-all",
                        }}
                      >
                        Model path: {workflowModelPath}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ==================================================
              DEPLOYMENT HEALTH
          ================================================== */}

          <div className="dp-panel">

            <div className="dp-panel-header">
              <div>
                <h3>
                  Deployment Health
                </h3>

                <p>
                  Current status of the deployed production model.
                </p>
              </div>

              <div className="dp-panel-icon blue">
                <Activity size={20} />
              </div>
            </div>

            <div className="dp-health">

              {/* MODEL AVAILABLE */}

              <div className="dp-health-item">

                <div className="dp-health-icon green">
                  <CheckCircle2 size={18} />
                </div>

                <div>
                  <strong>
                    Model Available
                  </strong>

                  <span>
                    {activeModel?.model_file
                      ? "Registered model file available"
                      : "No active model file reported"}
                  </span>
                </div>

                <b>
                  {activeModel?.model_file
                    ? "OK"
                    : "—"}
                </b>
              </div>

              {/* MONITORING WORKFLOW */}

              <div className="dp-health-item">

                <div className="dp-health-icon green">
                  <Activity size={18} />
                </div>

                <div>
                  <strong>
                    Monitoring Workflow
                  </strong>

                  <span>
                    {monitoringWorkflowDescription}
                  </span>
                </div>

                <b>
                  {monitoringWorkflowStatus}
                </b>
              </div>

              {/* REGISTRY */}

              <div className="dp-health-item">

                <div className="dp-health-icon blue">
                  <Database size={18} />
                </div>

                <div>
                  <strong>
                    Registry Connected
                  </strong>

                  <span>
                    {registry
                      ? `${versions.length} registered version${
                          versions.length === 1
                            ? ""
                            : "s"
                        }`
                      : "Registry unavailable"}
                  </span>
                </div>

                <b>
                  {registry
                    ? "READY"
                    : "—"}
                </b>
              </div>
            </div>
          </div>

          {/* ==================================================
              DEPLOYMENT WORKFLOW
          ================================================== */}

          <div className="dp-panel">

            <div className="dp-panel-header">
              <div>
                <h3>
                  Deployment Workflow
                </h3>

                <p>
                  Automated sequence from candidate evaluation
                  to active model registration.
                </p>
              </div>

              <div className="dp-panel-icon purple">
                <GitBranch size={20} />
              </div>
            </div>

            <div className="dp-workflow">

              {deploymentSteps.map(
                (step, index) => (
                  <div
                    className="dp-workflow-step"
                    key={step.title}
                  >
                    <div className="dp-step-number">
                      {index + 1}
                    </div>

                    <div className="dp-step-content">

                      <div className="dp-step-title">

                        <strong>
                          {step.title}
                        </strong>

                        <span
                          className={
                            step.status === "Active"
                              ? "active"
                              : step.status === "Rejected"
                                ? "rejected"
                                : ""
                          }
                        >
                          <CheckCircle2 size={14} />

                          {step.status}
                        </span>
                      </div>

                      <p>
                        {step.description}
                      </p>
                    </div>
                  </div>
                )
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
                  Live version history returned by the
                  DriftWatcher backend registry.
                </p>
              </div>

              <div className="dp-panel-icon blue">
                <Database size={20} />
              </div>
            </div>

            <div className="dp-registry-table">

              <div
                className="dp-registry-header"
                style={{
                  gridTemplateColumns:
                    "0.7fr 1.5fr 1fr 1fr 1fr 1fr",
                }}
              >
                <div>
                  Version
                </div>

                <div>
                  Model
                </div>

                <div>
                  Status
                </div>

                <div>
                  Primary Metric
                </div>

                <div>
                  Problem Type
                </div>

                <div>
                  Deployment
                </div>
              </div>

              {loading && (
                <div
                  className="dp-registry-row"
                  style={{
                    gridTemplateColumns:
                      "1fr",
                  }}
                >
                  <div>
                    Loading model registry...
                  </div>
                </div>
              )}

              {!loading &&
                versions.length === 0 && (
                  <div
                    className="dp-registry-row"
                    style={{
                      gridTemplateColumns:
                        "1fr",
                    }}
                  >
                    <div>
                      No model versions are currently
                      registered.
                    </div>
                  </div>
                )}

              {!loading &&
                versions.map((model) => {
                  const isActive =
                    model.version === activeVersion;

                  const problemType =
                    normalizeProblemType(
                      model.problem_type
                    );

                  const isRegression =
                    problemType === "regression";

                  const primaryMetric =
                    isRegression
                      ? formatPercent(
                          model.metrics?.r2
                        )
                      : formatPercent(
                          model.metrics?.accuracy
                        );

                  return (
                    <div
                      className="dp-registry-row"
                      key={model.version}
                      style={{
                        gridTemplateColumns:
                          "0.7fr 1.5fr 1fr 1fr 1fr 1fr",
                      }}
                    >
                      <div className="dp-version">
                        {model.version}
                      </div>

                      <div>
                        {formatModelName(
                          model.model_type
                        )}
                      </div>

                      <div>
                        <span
                          className={`dp-status ${
                            isActive
                              ? "active"
                              : "previous"
                          }`}
                        >
                          {isActive
                            ? "Active"
                            : "Registered"}
                        </span>
                      </div>

                      <div>
                        {primaryMetric}
                      </div>

                      <div
                        style={{
                          textTransform:
                            "capitalize",
                        }}
                      >
                        {problemType || "—"}
                      </div>

                      <div>
                        {isActive
                          ? "Active"
                          : "Available"}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* ==================================================
              ROLLBACK
          ================================================== */}

          <div className="dp-rollback-card">

            <div className="dp-rollback-icon">
              <RotateCcw size={24} />
            </div>

            <div className="dp-rollback-content">

              <span>
                Model Safety
              </span>

              <h3>
                Registered model versions remain available.
              </h3>

              <p>
                Select a registered version to restore it
                as the active production deployment.
              </p>

              <select
                value={selectedRollbackVersion}
                onChange={(event) =>
                  setSelectedRollbackVersion(
                    event.target.value
                  )
                }
                disabled={
                  rollbackLoading ||
                  versions.length === 0
                }
                style={{
                  marginTop: "12px",
                  width: "100%",
                  maxWidth: "280px",
                  padding: "9px 11px",
                  border: "1px solid #dce9f8",
                  borderRadius: "9px",
                  background: "#ffffff",
                  color: "#425b78",
                  fontSize: "12px",
                  outline: "none",
                }}
              >
                <option value="">
                  Select version to rollback
                </option>

                {versions
                  .filter(
                    (item) =>
                      item?.version !==
                      activeVersion
                  )
                  .map((item) => (
                    <option
                      key={item.version}
                      value={item.version}
                    >
                      {item.version} —{" "}
                      {formatModelName(
                        item.model_type
                      )}
                    </option>
                  ))}
              </select>

              {rollbackMessage && (
                <p
                  style={{
                    marginTop: "8px",
                    color:
                      rollbackMessage
                        .toLowerCase()
                        .includes("failed")
                        ? "#c43d3d"
                        : "#0b9b62",
                    fontWeight: 600,
                  }}
                >
                  {rollbackMessage}
                </p>
              )}
            </div>

            <button
              className="dp-rollback-button"
              onClick={handleRollback}
              disabled={
                rollbackLoading ||
                !selectedRollbackVersion ||
                selectedRollbackVersion ===
                  activeVersion
              }
              style={{
                opacity:
                  rollbackLoading ||
                  !selectedRollbackVersion ||
                  selectedRollbackVersion ===
                    activeVersion
                    ? 0.55
                    : 1,

                cursor:
                  rollbackLoading ||
                  !selectedRollbackVersion ||
                  selectedRollbackVersion ===
                    activeVersion
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              <RotateCcw size={16} />

              {rollbackLoading
                ? "Rolling back..."
                : "Rollback"}
            </button>
          </div>

          {/* ==================================================
              LAST UPDATED
          ================================================== */}

          <div className="dp-last-updated">
            <Clock3 size={14} />

            <span>
              Registry state is loaded directly from the
              DriftWatcher backend
            </span>
          </div>
        </section>
      </main>
    </div>
  );
}

export default Deployment;