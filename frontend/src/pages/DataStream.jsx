import { useEffect, useMemo, useState } from "react";

import {
  Activity,
  Database,
  Gauge,
  Radio,
  Clock3,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import "../App.css";
import { runStreamDriftDetection } from "../services/api";

const demoBatchResults = [
  { batch_number: 156, rows: 100, prediction_errors: 16, error_rate: 16.0 },
  { batch_number: 157, rows: 100, prediction_errors: 19, error_rate: 19.0 },
  { batch_number: 158, rows: 100, prediction_errors: 17, error_rate: 17.0 },
  { batch_number: 159, rows: 100, prediction_errors: 22, error_rate: 22.0 },
  { batch_number: 160, rows: 100, prediction_errors: 20, error_rate: 20.0 },
  { batch_number: 161, rows: 100, prediction_errors: 24, error_rate: 24.0 },
  { batch_number: 162, rows: 100, prediction_errors: 21, error_rate: 21.0 },
  { batch_number: 163, rows: 100, prediction_errors: 26, error_rate: 26.0 },
  { batch_number: 164, rows: 100, prediction_errors: 23, error_rate: 23.0 },
  { batch_number: 165, rows: 100, prediction_errors: 28, error_rate: 28.0 },
  { batch_number: 166, rows: 100, prediction_errors: 25, error_rate: 25.0 },
  { batch_number: 167, rows: 100, prediction_errors: 27, error_rate: 27.0 },
];

function formatErrorRate(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }

  return Math.abs(value) <= 1 ? value * 100 : value;
}

function normalizeProblemType(value) {
  const normalized = String(value || "").trim().toLowerCase();

  return normalized.includes("regress")
    ? "regression"
    : "classification";
}

function getNestedMetric(batch, keys) {
  if (!batch || typeof batch !== "object") {
    return null;
  }

  const containers = [
    batch,
    batch.metrics,
    batch.metric_values,
    batch.performance,
    batch.model_metrics,
  ];

  for (const container of containers) {
    if (!container || typeof container !== "object") {
      continue;
    }

    for (const key of keys) {
      const value = container[key];

      if (
        typeof value === "number" &&
        Number.isFinite(value)
      ) {
        return value;
      }
    }
  }

  return null;
}

function getRegressionMetricInfo(batch) {
  const candidates = [
    {
      key: "rmse",
      label: "RMSE",
      keys: [
        "rmse",
        "root_mean_squared_error",
        "rootMeanSquaredError",
      ],
    },
    {
      key: "mae",
      label: "MAE",
      keys: [
        "mae",
        "mean_absolute_error",
        "meanAbsoluteError",
      ],
    },
    {
      key: "mse",
      label: "MSE",
      keys: [
        "mse",
        "mean_squared_error",
        "meanSquaredError",
      ],
    },
    {
      key: "r2",
      label: "R²",
      keys: [
        "r2",
        "r2_score",
        "r2Score",
        "r_squared",
        "rSquared",
      ],
    },
  ];

  for (const candidate of candidates) {
    const value = getNestedMetric(
      batch,
      candidate.keys
    );

    if (value !== null) {
      return {
        key: candidate.key,
        label: candidate.label,
        value,
      };
    }
  }

  return null;
}

function formatMetricValue(value, metricKey) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    return "—";
  }

  return metricKey === "r2"
    ? value.toFixed(3)
    : value.toFixed(3);
}

function BatchMetricTooltip({
  active,
  payload,
  problemType,
}) {
  if (
    !active ||
    !payload ||
    !payload.length
  ) {
    return null;
  }

  const row = payload[0].payload;

  if (problemType === "regression") {
    const metricInfo = row.regression_metric;

    return (
      <div className="stream-tooltip">
        <strong>
          Batch {row.batch_number}
        </strong>

        <span>
          {metricInfo?.label || "Regression metric"}:{" "}
          {metricInfo
            ? formatMetricValue(
                metricInfo.value,
                metricInfo.key
              )
            : "—"}
        </span>

        <span>
          Rows: {row.rows ?? "—"}
        </span>
      </div>
    );
  }

  const formattedErrorRate =
    formatErrorRate(row.error_rate);

  return (
    <div className="stream-tooltip">
      <strong>
        Batch {row.batch_number}
      </strong>

      <span>
        Error rate:{" "}
        {formattedErrorRate !== null
          ? `${formattedErrorRate.toFixed(1)}%`
          : "—"}
      </span>

      <span>
        Prediction errors:{" "}
        {row.prediction_errors ?? "—"}
      </span>

      <span>
        Rows: {row.rows ?? "—"}
      </span>
    </div>
  );
}

function DataStream() {
  const [monitoringConfig, setMonitoringConfig] =
    useState(null);

  const [streamResult, setStreamResult] =
    useState(null);

  const [streamStatus, setStreamStatus] =
    useState("Ready to run");

  const [streamError, setStreamError] =
    useState("");

  useEffect(() => {
    try {
      const savedConfig =
        localStorage.getItem(
          "driftwatcher.monitoringConfig"
        );

      if (savedConfig) {
        const parsedConfig =
          JSON.parse(savedConfig);

        setMonitoringConfig({
          ...parsedConfig,
          preprocessorPath:
            parsedConfig.preprocessorPath ||
            null,
        });

        return;
      }

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

      if (
        modelConfig &&
        datasetConfig
      ) {
        setMonitoringConfig({
          modelPath:
            modelConfig.modelPath,

          modelType:
            modelConfig.modelType,

          framework:
            modelConfig.framework,

          referenceDatasetPath:
            datasetConfig.referenceDatasetPath,

          currentDatasetPath:
            datasetConfig.currentDatasetPath,

          targetColumn:
            datasetConfig.targetColumn || "",

          problemType:
            datasetConfig.problemType || "",

          monitoringFeature:
            datasetConfig.monitoringFeature ||
            null,

          preprocessorPath:
            modelConfig.preprocessorPath ||
            datasetConfig.preprocessorPath ||
            null,

          batchSize:
            datasetConfig.batchSize || 100,

          maxBatches:
            datasetConfig.maxBatches || null,
        });
      }
    } catch (error) {
      console.error(
        "Failed to load monitoring configuration:",
        error
      );
    }
  }, []);

  const handleRunStreamMonitoring =
    async () => {
      if (
        !monitoringConfig?.modelPath ||
        !monitoringConfig?.currentDatasetPath
      ) {
        setStreamError(
          "Please complete Model Upload, Dataset Upload, and Monitoring Configuration first."
        );

        setStreamStatus(
          "Configuration required"
        );

        return;
      }

      setStreamError("");

      setStreamStatus(
        "Running batch monitoring..."
      );

      try {
        const preprocessorPath =
          monitoringConfig.preprocessorPath ||
          null;

        const targetColumn =
          monitoringConfig.targetColumn?.trim() ||
          null;

        const result =
          await runStreamDriftDetection({
            modelPath:
              monitoringConfig.modelPath,

            currentDatasetPath:
              monitoringConfig.currentDatasetPath,

            targetColumn,

            preprocessorPath,

            monitoringFeature:
              monitoringConfig.monitoringFeature ||
              null,

            batchSize:
              Number(
                monitoringConfig.batchSize
              ) || 100,

            maxBatches:
              monitoringConfig.maxBatches
                ? Number(
                    monitoringConfig.maxBatches
                  )
                : null,
          });

        if (
          result?.status !== "success"
        ) {
          const message =
            result?.message ||
            "Backend returned an unsuccessful monitoring result.";

          setStreamResult(null);

          setStreamError(message);

          setStreamStatus(
            "Monitoring failed"
          );

          return;
        }

        setStreamResult(result);

        try {
          localStorage.setItem(
            "driftwatcher.streamResult",
            JSON.stringify(result)
          );

          window.dispatchEvent(
            new CustomEvent(
              "driftwatcher:stream-result",
              {
                detail: result,
              }
            )
          );
        } catch (storageError) {
          console.error(
            "Failed to persist DriftWatcher monitoring result:",
            storageError
          );
        }

        setStreamStatus(
          "Monitoring completed"
        );
      } catch (error) {
        console.error(
          "Stream monitoring failed:",
          error
        );

        const message =
          error?.response?.data?.detail ||
          error?.message ||
          "Stream monitoring failed.";

        setStreamError(message);

        setStreamStatus(
          "Monitoring failed"
        );
      }
    };

  const problemType =
    normalizeProblemType(
      monitoringConfig?.problemType ||
        streamResult?.problem_type
    );

  const isRegression =
    problemType === "regression";

  const liveBatchResults = useMemo(() => {
    if (
      streamResult &&
      Array.isArray(
        streamResult.batch_results
      )
    ) {
      return streamResult.batch_results;
    }

    if (
      streamStatus ===
      "Monitoring failed"
    ) {
      return [];
    }

    /*
     * Demo error-rate data is only valid
     * for classification preview.
     *
     * Never show the classification demo
     * graph for regression.
     */
    return isRegression
      ? []
      : demoBatchResults;
  }, [
    streamResult,
    streamStatus,
    isRegression,
  ]);

  /*
   * Classification:
   *   error_rate is used.
   *
   * Regression:
   *   use an actual RMSE, MAE, MSE,
   *   or R² value if the backend provides
   *   one.
   *
   * prediction_errors/error_rate are NOT
   * interpreted as regression metrics.
   */
  const chartBatchResults = useMemo(() => {
    return liveBatchResults.map(
      (batch) => {
        if (isRegression) {
          const regressionMetric =
            getRegressionMetricInfo(
              batch
            );

          return {
            ...batch,

            regression_metric:
              regressionMetric,

            metric_value:
              regressionMetric?.value ??
              null,
          };
        }

        return {
          ...batch,

          metric_value:
            typeof batch?.error_rate ===
            "number"
              ? formatErrorRate(
                  batch.error_rate
                )
              : null,
        };
      }
    );
  }, [
    liveBatchResults,
    isRegression,
  ]);

  const regressionMetricKey =
    useMemo(() => {
      const metric =
        chartBatchResults.find(
          (batch) =>
            batch?.regression_metric
        )?.regression_metric;

      return metric?.key || null;
    }, [chartBatchResults]);

  const regressionMetricLabel =
    useMemo(() => {
      const metric =
        chartBatchResults.find(
          (batch) =>
            batch?.regression_metric
        )?.regression_metric;

      return (
        metric?.label ||
        "Regression Metric"
      );
    }, [chartBatchResults]);

  const hasChartMetric =
    chartBatchResults.some(
      (batch) =>
        typeof batch?.metric_value ===
          "number" &&
        Number.isFinite(
          batch.metric_value
        )
    );

  const rowsProcessed =
    streamResult?.total_rows_processed ??
    "—";

  const processedBatches =
    streamResult?.batches_processed ??
    "—";

  const batchSize =
    streamResult?.batch_size ??
    monitoringConfig?.batchSize ??
    100;

  const totalPredictionErrors =
    isRegression
      ? "—"
      : streamResult?.total_prediction_errors ??
        "—";

  const processingStatus =
    streamResult
      ? "COMPLETED"
      : streamStatus ===
          "Monitoring failed"
        ? "FAILED"
        : "NOT RUN";

  const firstBatch =
    streamResult &&
    liveBatchResults.length > 0
      ? liveBatchResults[0]
          ?.batch_number
      : "—";

  const latestBatch =
    streamResult &&
    liveBatchResults.length > 0
      ? liveBatchResults[
          liveBatchResults.length - 1
        ]?.batch_number
      : "—";

  return (
    <div className="app-shell">
      <Sidebar />

      <main className="main-area">
        <Topbar title="Data Stream" />

        <section className="dashboard-content">
          <div className="page-heading">
            <div>
              <h3>
                Data Stream Monitoring
              </h3>

              <p>
                Monitor batch processing
                activity and model
                performance from the
                current data source.
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
              <div className="system-status">
                <span className="status-dot"></span>

                {streamStatus}
              </div>

              <button
                type="button"
                className="primary-action"
                onClick={
                  handleRunStreamMonitoring
                }
                disabled={
                  streamStatus ===
                  "Running batch monitoring..."
                }
              >
                {streamStatus ===
                "Running batch monitoring..."
                  ? "Running..."
                  : "Run Batch Monitoring"}
              </button>
            </div>
          </div>

          {streamError && (
            <div
              className="panel"
              style={{
                marginBottom: "18px",
                color: "#d14343",
              }}
            >
              {streamError}
            </div>
          )}

          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-icon blue">
                <Database size={21} />
              </div>

              <div>
                <span>
                  Rows Processed
                </span>

                <strong>
                  {typeof rowsProcessed ===
                  "number"
                    ? rowsProcessed.toLocaleString()
                    : rowsProcessed}
                </strong>

                <small>
                  total rows processed
                </small>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-icon purple">
                <Activity size={21} />
              </div>

              <div>
                <span>Batch Size</span>

                <strong>
                  {batchSize}
                </strong>

                <small>
                  rows per batch
                </small>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-icon orange">
                <Gauge size={21} />
              </div>

              <div>
                <span>
                  Batches Processed
                </span>

                <strong>
                  {processedBatches}
                </strong>

                <small>
                  completed batches
                </small>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-icon green">
                <Radio size={21} />
              </div>

              <div>
                <span>
                  Processing Status
                </span>

                <strong>
                  {processingStatus}
                </strong>

                <small>
                  batch monitoring run
                </small>
              </div>
            </div>
          </div>

          <div className="dashboard-grid">
            <div className="panel large-panel">
              <div className="panel-header">
                <div>
                  <h4>
                    {isRegression
                      ? `Batch ${regressionMetricLabel} Trend`
                      : "Batch Prediction Error Trend"}
                  </h4>

                  <p>
                    {isRegression
                      ? "Regression performance metric calculated for each processed batch"
                      : "Prediction error rate calculated for each processed batch"}
                  </p>
                </div>

                <span className="panel-status">
                  Monitoring
                </span>
              </div>

              <div className="stream-chart">
                <div className="stream-chart-header">
                  <div>
                    <span className="stream-chart-title">
                      {isRegression
                        ? `${regressionMetricLabel} by batch`
                        : "Error rate by batch"}
                    </span>

                    <span className="stream-chart-subtitle">
                      {streamResult
                        ? hasChartMetric
                          ? "Backend batch_results"
                          : isRegression
                            ? "Backend did not return a regression metric for these batches"
                            : "Backend batch_results"
                        : streamStatus ===
                            "Monitoring failed"
                          ? "No live results — monitoring failed"
                          : isRegression
                            ? "Run monitoring for live regression metrics"
                            : "Preview — run monitoring for live results"}
                    </span>
                  </div>

                  <span className="stream-chart-badge">
                    {isRegression
                      ? regressionMetricKey
                        ? regressionMetricLabel.toUpperCase()
                        : "REGRESSION"
                      : "ERROR RATE"}
                  </span>
                </div>

                <div className="waveform-chart">
                  {hasChartMetric ? (
                    <ResponsiveContainer
                      width="100%"
                      height={285}
                    >
                      <AreaChart
                        data={
                          chartBatchResults
                        }
                        margin={{
                          top: 12,
                          right: 12,
                          left: 0,
                          bottom: 8,
                        }}
                      >
                        <defs>
                          <linearGradient
                            id={
                              isRegression
                                ? "regressionMetricGradient"
                                : "errorRateGradient"
                            }
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor="#1677ff"
                              stopOpacity={0.25}
                            />

                            <stop
                              offset="100%"
                              stopColor="#1677ff"
                              stopOpacity={0.02}
                            />
                          </linearGradient>
                        </defs>

                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke="#e9eef5"
                        />

                        <XAxis
                          dataKey="batch_number"
                          tick={{
                            fontSize: 10,
                          }}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(
                            value
                          ) =>
                            `#${value}`
                          }
                        />

                        <YAxis
                          tick={{
                            fontSize: 10,
                          }}
                          tickLine={false}
                          axisLine={false}
                          width={52}
                          tickFormatter={(
                            value
                          ) =>
                            isRegression
                              ? Number(
                                  value
                                ).toFixed(2)
                              : `${value}%`
                          }
                        />

                        <Tooltip
                          content={
                            <BatchMetricTooltip
                              problemType={
                                problemType
                              }
                            />
                          }
                          cursor={{
                            stroke:
                              "#b8c8df",
                            strokeDasharray:
                              "4 4",
                          }}
                        />

                        <Area
                          type="monotone"
                          dataKey="metric_value"
                          stroke="#1677ff"
                          strokeWidth={3}
                          fill={
                            isRegression
                              ? "url(#regressionMetricGradient)"
                              : "url(#errorRateGradient)"
                          }
                          dot={false}
                          activeDot={{
                            r: 5,
                          }}
                          isAnimationActive={
                            true
                          }
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div
                      style={{
                        height: "285px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent:
                          "center",
                        textAlign: "center",
                        padding: "24px",
                        color: "#667085",
                        fontSize: "14px",
                        lineHeight: 1.6,
                      }}
                    >
                      {isRegression
                        ? "No regression metric was returned for the processed batches. The graph is intentionally not showing prediction error rate because 100% prediction error is not a valid regression performance metric."
                        : "No batch error-rate values are available yet."}
                    </div>
                  )}
                </div>

                <div className="stream-chart-footer">
                  <span>
                    Batch #{firstBatch}
                  </span>

                  <span>
                    Latest: Batch #
                    {latestBatch}
                  </span>

                  <span>
                    {isRegression
                      ? "Lower RMSE/MAE/MSE is generally better; higher R² is generally better"
                      : "Higher error rate may indicate model degradation"}
                  </span>
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-header">
                <div>
                  <h4>
                    Stream Information
                  </h4>

                  <p>
                    Current processing
                    state
                  </p>
                </div>
              </div>

              <div className="stream-info-list">
                <div className="stream-info-row">
                  <span>
                    Data Source
                  </span>

                  <strong>
                    Current Dataset
                  </strong>
                </div>

                <div className="stream-info-row">
                  <span>
                    Batch Size
                  </span>

                  <strong>
                    {batchSize} rows
                  </strong>
                </div>

                <div className="stream-info-row">
                  <span>
                    Batches Processed
                  </span>

                  <strong>
                    {processedBatches}
                  </strong>
                </div>

                <div className="stream-info-row">
                  <span>
                    Rows Processed
                  </span>

                  <strong>
                    {typeof rowsProcessed ===
                    "number"
                      ? rowsProcessed.toLocaleString()
                      : rowsProcessed}
                  </strong>
                </div>

                <div className="stream-info-row">
                  <span>
                    Last Batch
                  </span>

                  <strong>
                    #{latestBatch}
                  </strong>
                </div>

                <div className="stream-info-row">
                  <span>Status</span>

                  <span className="active-badge">
                    {streamResult
                      ? "Completed"
                      : "Not Run"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <div>
                <h4>
                  Monitoring Batch Preview
                </h4>

                <p>
                  Recent batch results
                  returned by the selected
                  monitoring run
                </p>
              </div>

              <span className="link-text">
                {streamResult
                  ? "Live Results"
                  : "Waiting for Results"}
              </span>
            </div>

            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Batch</th>
                    <th>Rows</th>

                    <th>
                      {isRegression
                        ? "Batch Metric"
                        : "Prediction Errors"}
                    </th>

                    <th>
                      {isRegression
                        ? "Metric Value"
                        : "Error Rate"}
                    </th>

                    <th>Status</th>
                  </tr>
                </thead>

                <tbody>
                  {/*
                   * IMPORTANT:
                   * Use chartBatchResults here instead of
                   * liveBatchResults.
                   *
                   * chartBatchResults already contains:
                   *   regression_metric
                   *   metric_value
                   *
                   * Therefore RMSE/MAE/MSE/R² will now
                   * appear in the regression table.
                   */}
                  {chartBatchResults
                    .slice(-4)
                    .map(
                      (
                        batch,
                        index
                      ) => {
                        const formattedErrorRate =
                          formatErrorRate(
                            batch?.error_rate
                          );

                        return (
                          <tr
                            key={`${batch?.batch_number ?? "batch"}-${index}`}
                          >
                            <td>
                              {batch?.batch_number !==
                              undefined
                                ? `#${batch.batch_number}`
                                : "—"}
                            </td>

                            <td>
                              {typeof batch?.rows ===
                              "number"
                                ? batch.rows.toLocaleString()
                                : batch?.rows ??
                                  "—"}
                            </td>

                            <td>
                              {isRegression
                                ? batch
                                    ?.regression_metric
                                    ?.label ||
                                  "—"
                                : typeof batch?.prediction_errors ===
                                    "number"
                                  ? batch.prediction_errors.toLocaleString()
                                  : batch?.prediction_errors ??
                                    "—"}
                            </td>

                            <td>
                              {isRegression
                                ? batch
                                    ?.regression_metric
                                  ? formatMetricValue(
                                      batch
                                        .regression_metric
                                        .value,
                                      batch
                                        .regression_metric
                                        .key
                                    )
                                  : "—"
                                : formattedErrorRate !==
                                    null
                                  ? `${formattedErrorRate.toFixed(
                                      1
                                    )}%`
                                  : batch?.error_rate ??
                                    "—"}
                            </td>

                            <td>
                              <span className="table-status success">
                                Processed
                              </span>
                            </td>
                          </tr>
                        );
                      }
                    )}

                  {chartBatchResults.length ===
                    0 && (
                    <tr>
                      <td
                        colSpan="5"
                        style={{
                          textAlign:
                            "center",
                        }}
                      >
                        No monitoring batch
                        results available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel processing-panel">
            <div className="processing-item">
              <Clock3 size={19} />

              <div>
                <strong>
                  Dataset Last Timestamp
                </strong>

                <span>
                  {streamResult
                    ? "Not returned by monitoring API"
                    : "—"}
                </span>
              </div>
            </div>

            <div className="processing-item">
              <ArrowUpRight size={19} />

              <div>
                <strong>
                  Rows Processed
                </strong>

                <span>
                  {typeof rowsProcessed ===
                  "number"
                    ? rowsProcessed.toLocaleString()
                    : rowsProcessed}
                </span>
              </div>
            </div>

            <div className="processing-item">
              <ArrowDownRight size={19} />

              <div>
                <strong>
                  {isRegression
                    ? "Regression Metric"
                    : "Total Prediction Errors"}
                </strong>

                <span>
                  {isRegression
                    ? regressionMetricLabel
                    : typeof totalPredictionErrors ===
                        "number"
                      ? totalPredictionErrors.toLocaleString()
                      : totalPredictionErrors}
                </span>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default DataStream;