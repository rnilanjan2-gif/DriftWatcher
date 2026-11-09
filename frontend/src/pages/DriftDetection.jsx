import { useEffect, useMemo, useState } from "react";

import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Radio,
  TrendingUp,
} from "lucide-react";

import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import "../App.css";

function DriftDetection() {
  const [streamResult, setStreamResult] = useState(() => {
    try {
      const storedResult = localStorage.getItem(
        "driftwatcher.streamResult"
      );

      if (storedResult) {
        const parsedResult = JSON.parse(storedResult);

        if (parsedResult && typeof parsedResult === "object") {
          return parsedResult;
        }
      }
    } catch (err) {
      console.error(
        "Failed to load persisted DriftWatcher monitoring result:",
        err
      );
    }

    return window.__driftWatcherStreamResult || null;
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  /*
   * ---------------------------------------------------------
   * Load latest monitoring result
   * ---------------------------------------------------------
   */
  useEffect(() => {
    const loadMonitoringResult = () => {
      try {
        const storedResult = localStorage.getItem(
          "driftwatcher.streamResult"
        );

        if (storedResult) {
          const parsedResult = JSON.parse(storedResult);

          if (parsedResult && typeof parsedResult === "object") {
            setStreamResult(parsedResult);
            setError("");
            return;
          }
        }

        const runtimeResult =
          window.__driftWatcherStreamResult || null;

        setStreamResult(runtimeResult);

        if (runtimeResult) {
          setError("");
        }
      } catch (err) {
        console.error(
          "Failed to load DriftWatcher monitoring result:",
          err
        );

        setError(
          "Unable to load the latest monitoring result."
        );
      }
    };

    loadMonitoringResult();

    const handleStreamResult = (event) => {
      const result =
        event?.detail ||
        window.__driftWatcherStreamResult ||
        null;

      if (result && typeof result === "object") {
        setStreamResult(result);
        setError("");
        return;
      }

      loadMonitoringResult();
    };

    window.addEventListener(
      "driftwatcher:stream-result",
      handleStreamResult
    );

    const handleStorageChange = (event) => {
      if (event.key === "driftwatcher.streamResult") {
        loadMonitoringResult();
      }
    };

    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener(
        "driftwatcher:stream-result",
        handleStreamResult
      );

      window.removeEventListener(
        "storage",
        handleStorageChange
      );
    };
  }, []);

  /*
   * ---------------------------------------------------------
   * Backend result values
   * ---------------------------------------------------------
   */
  const batchesProcessed =
    streamResult?.batches_processed ?? null;

  const rowsProcessed =
    streamResult?.total_rows_processed ?? null;

  const predictionErrors =
    streamResult?.total_prediction_errors ?? null;

  const driftDetected =
    typeof streamResult?.drift_detected === "boolean"
      ? streamResult.drift_detected
      : null;

  const driftEvents = Array.isArray(
    streamResult?.drift_events
  )
    ? streamResult.drift_events
    : [];

  const detectorSummary =
    streamResult?.detector_summary ?? {};

  /*
   * ---------------------------------------------------------
   * Detector counts
   * ---------------------------------------------------------
   */
  const adwinDetections =
    detectorSummary?.adwin_detections ?? 0;

  const ddmDetections =
    detectorSummary?.ddm_detections ?? 0;

  const pageHinkleyDetections =
    detectorSummary?.page_hinkley_detections ?? 0;

  /*
   * ---------------------------------------------------------
   * Detector cards
   * ---------------------------------------------------------
   */
  const detectors = useMemo(
    () => [
      {
        name: "ADWIN",

        status:
          !streamResult
            ? "READY"
            : adwinDetections > 0
              ? "DRIFT DETECTED"
              : "NO DRIFT",

        statusClass:
          streamResult && adwinDetections > 0
            ? "danger"
            : "success",

        description:
          "Adaptive Windowing drift detector",

        detections: streamResult
          ? adwinDetections
          : "—",

        icon: Activity,
      },

      {
        name: "DDM",

        status:
          !streamResult
            ? "READY"
            : ddmDetections > 0
              ? "DRIFT DETECTED"
              : "NO DRIFT",

        statusClass:
          streamResult && ddmDetections > 0
            ? "danger"
            : "success",

        description:
          "Drift Detection Method",

        detections: streamResult
          ? ddmDetections
          : "—",

        icon: AlertTriangle,
      },

      {
        name: "Page-Hinkley",

        status:
          !streamResult
            ? "READY"
            : pageHinkleyDetections > 0
              ? "DRIFT DETECTED"
              : "NO DRIFT",

        statusClass:
          streamResult && pageHinkleyDetections > 0
            ? "danger"
            : "success",

        description:
          "Change detection algorithm",

        detections: streamResult
          ? pageHinkleyDetections
          : "—",

        icon: TrendingUp,
      },
    ],
    [
      streamResult,
      adwinDetections,
      ddmDetections,
      pageHinkleyDetections,
    ]
  );

  /*
   * ---------------------------------------------------------
   * Overall detection status
   * ---------------------------------------------------------
   */
  const detectionStatus = !streamResult
    ? "NOT RUN"
    : driftDetected
      ? "DRIFT DETECTED"
      : "NO DRIFT";

  const pageStatus = !streamResult
    ? "NOT RUN"
    : driftDetected
      ? "DRIFT DETECTED"
      : "NO DRIFT";

  /*
   * ---------------------------------------------------------
   * Refresh latest result
   * ---------------------------------------------------------
   */
  const refreshResult = () => {
    setLoading(true);
    setError("");

    try {
      const storedResult = localStorage.getItem(
        "driftwatcher.streamResult"
      );

      if (!storedResult) {
        const runtimeResult =
          window.__driftWatcherStreamResult || null;

        if (!runtimeResult) {
          setStreamResult(null);

          setError(
            "No monitoring result is available yet. Run monitoring from the Data Stream page first."
          );

          return;
        }

        setStreamResult(runtimeResult);
        return;
      }

      const parsedResult = JSON.parse(storedResult);

      if (!parsedResult || typeof parsedResult !== "object") {
        throw new Error("Invalid monitoring result.");
      }

      setStreamResult(parsedResult);
    } catch (err) {
      console.error(
        "Failed to refresh DriftWatcher monitoring result:",
        err
      );

      setError(
        "Unable to read the latest monitoring result."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-shell">
      <Sidebar />

      <main className="main-area">
        <Topbar title="Drift Detection" />

        <section className="dashboard-content">

          {/* =========================
              Page Heading
          ========================== */}
          <div className="page-heading">
            <div>
              <h2>Drift Detection</h2>

              <p>
                Monitor concept drift using multiple
                statistical detection algorithms.
              </p>
            </div>

            <div
              className={`status-badge ${
                streamResult && driftDetected
                  ? "danger-badge"
                  : ""
              }`}
            >
              <span className="status-dot"></span>

              {pageStatus}
            </div>
          </div>

          {/* =========================
              Error Message
          ========================== */}
          {error && (
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
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                <AlertTriangle size={20} />

                <div>
                  <strong>
                    Monitoring Result
                  </strong>

                  <p style={{ margin: "4px 0 0" }}>
                    {error}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* =========================
              Summary Cards
          ========================== */}
          <div className="kpi-grid">

            {/* Rows Processed */}
            <div className="kpi-card">
              <div className="kpi-icon blue">
                <Activity size={22} />
              </div>

              <div>
                <span className="kpi-label">
                  Rows Processed
                </span>

                <strong>
                  {rowsProcessed !== null
                    ? rowsProcessed.toLocaleString()
                    : "—"}
                </strong>

                <small>
                  Monitoring data processed
                </small>
              </div>
            </div>

            {/* Drift Events */}
            <div className="kpi-card">
              <div className="kpi-icon purple">
                <Radio size={22} />
              </div>

              <div>
                <span className="kpi-label">
                  Drift Events
                </span>

                <strong>
                  {streamResult
                    ? driftEvents.length
                    : "—"}
                </strong>

                <small>
                  Detected during monitoring
                </small>
              </div>
            </div>

            {/* Prediction Errors */}
            <div className="kpi-card">
              <div className="kpi-icon red">
                <AlertTriangle size={22} />
              </div>

              <div>
                <span className="kpi-label">
                  Prediction Errors
                </span>

                <strong>
                  {predictionErrors !== null
                    ? predictionErrors.toLocaleString()
                    : "—"}
                </strong>

                <small>
                  Total errors observed
                </small>
              </div>
            </div>

            {/* Detection Status */}
            <div className="kpi-card">
              <div className="kpi-icon green">
                <CheckCircle2 size={22} />
              </div>

              <div>
                <span className="kpi-label">
                  Detection Status
                </span>

                <strong>
                  {detectionStatus}
                </strong>

                <small>
                  Overall monitoring result
                </small>
              </div>
            </div>
          </div>

          {/* =========================
              Detector Cards + Timeline
          ========================== */}
          <div className="content-grid two-column">

            {/* Drift Detectors */}
            <div className="panel-card">
              <div className="panel-header">
                <div>
                  <h3>Drift Detectors</h3>

                  <p>
                    Status of the configured drift detection
                    algorithms
                  </p>
                </div>

                <span className="live-badge">
                  {streamResult
                    ? "RESULT AVAILABLE"
                    : "READY"}
                </span>
              </div>

              <div className="detector-grid">
                {detectors.map((detector) => {
                  const Icon = detector.icon;

                  return (
                    <div
                      className="detector-card"
                      key={detector.name}
                    >
                      <div className="detector-icon">
                        <Icon size={21} />
                      </div>

                      <h4>
                        {detector.name}
                      </h4>

                      <p>
                        {detector.description}
                      </p>

                      <div
                        className={`detector-status ${detector.statusClass}`}
                      >
                        {detector.status}
                      </div>

                      <span className="detector-count">
                        {detector.detections} detected
                        events
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Detection Timeline */}
            <div className="panel-card">
              <div className="panel-header">
                <div>
                  <h3>
                    Drift Events Timeline
                  </h3>

                  <p>
                    Chronological detector events from
                    monitoring batches
                  </p>
                </div>

                <Clock3 size={20} />
              </div>

              <div className="timeline">
                {driftEvents.length > 0 ? (
                  driftEvents.map(
                    (event, index) => (
                      <div
                        className="timeline-item"
                        key={`${event.batch_number ?? "batch"}-${
                          event.row_index ?? index
                        }-${index}`}
                      >
                        <div
                          className={`timeline-marker ${
                            event?.detectors?.adwin ||
                            event?.detectors?.ddm ||
                            event?.detectors?.page_hinkley
                              ? "danger"
                              : "success"
                          }`}
                        ></div>

                        <div>
                          <strong>
                            {
                              event?.detectors?.adwin ||
                              event?.detectors?.ddm ||
                              event?.detectors?.page_hinkley
                                ? "Drift detected"
                                : "Monitoring event"
                            }
                          </strong>

                          <p>
                            Batch{" "}
                            {event.batch_number ??
                              "—"}
                            {" • "}
                            Row{" "}
                            {event.row_index ??
                              "—"}
                          </p>

                          <p>
                            ADWIN:{" "}
                            {event?.detectors
                              ?.adwin
                              ? "DRIFT"
                              : "No drift"}

                            {" • "}

                            DDM:{" "}
                            {event?.detectors?.ddm
                              ? "DRIFT"
                              : "No drift"}

                            {" • "}

                            Page-Hinkley:{" "}
                            {event?.detectors
                              ?.page_hinkley
                              ? "DRIFT"
                              : "No drift"}
                          </p>
                        </div>
                      </div>
                    )
                  )
                ) : (
                  <>
                    <div className="timeline-item">
                      <div
                        className={`timeline-marker ${
                          streamResult
                            ? "success"
                            : "danger"
                        }`}
                      ></div>

                      <div>
                        <strong>
                          {streamResult
                            ? "No drift events detected"
                            : "Drift events will appear here"}
                        </strong>

                        <p>
                          {streamResult
                            ? "The monitoring run completed without recorded drift events."
                            : "Batch number and row index will be shown after monitoring."}
                        </p>
                      </div>
                    </div>

                    <div className="timeline-item">
                      <div className="timeline-marker success"></div>

                      <div>
                        <strong>
                          {streamResult
                            ? "Monitoring result available"
                            : "Monitoring engine ready"}
                        </strong>

                        <p>
                          ADWIN, DDM and Page-Hinkley
                          results are populated from
                          the backend monitoring result.
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* =========================
              Detection Summary
          ========================== */}
          <div className="panel-card drift-summary-panel">
            <div className="panel-header">
              <div>
                <h3>Detection Summary</h3>

                <p>
                  Current concept drift analysis returned
                  by the monitoring engine.
                </p>
              </div>

              <div
                className={`summary-status ${
                  streamResult && driftDetected
                    ? "danger-badge"
                    : ""
                }`}
              >
                <span className="status-dot"></span>

                {streamResult
                  ? driftDetected
                    ? "DRIFT DETECTED"
                    : "NO DRIFT"
                  : "NOT RUN"}
              </div>
            </div>

            <div className="summary-grid">

              <div>
                <span>
                  Batches Processed
                </span>

                <strong>
                  {batchesProcessed !== null
                    ? batchesProcessed
                    : "—"}
                </strong>
              </div>

              <div>
                <span>
                  Rows Processed
                </span>

                <strong>
                  {rowsProcessed !== null
                    ? rowsProcessed.toLocaleString()
                    : "—"}
                </strong>
              </div>

              <div>
                <span>
                  Prediction Errors
                </span>

                <strong>
                  {predictionErrors !== null
                    ? predictionErrors.toLocaleString()
                    : "—"}
                </strong>
              </div>

              <div>
                <span>
                  Drift Detected
                </span>

                <strong>
                  {driftDetected === null
                    ? "—"
                    : driftDetected
                      ? "YES"
                      : "NO"}
                </strong>
              </div>

              <div>
                <span>
                  Drift Events
                </span>

                <strong>
                  {streamResult
                    ? driftEvents.length
                    : "—"}
                </strong>
              </div>

            </div>
          </div>

          {/* =========================
              Latest Result Action
          ========================== */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: "18px",
            }}
          >
            <button
              className="secondary-button"
              type="button"
              onClick={refreshResult}
              disabled={loading}
            >
              <Radio size={17} />

              {loading
                ? "Refreshing..."
                : "Refresh Monitoring Result"}
            </button>
          </div>

        </section>
      </main>
    </div>
  );
}

export default DriftDetection;