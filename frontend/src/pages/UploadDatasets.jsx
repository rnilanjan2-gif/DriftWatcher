import { useState } from "react";

import {
  Upload,
  Database,
  BrainCircuit,
  Play,
  BarChart3,
  CheckCircle2,
} from "lucide-react";

import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import "../App.css";
import {
  uploadModel,
  uploadPreprocessor,
  uploadDatasets,
  createMonitoringConfig,
} from "../services/api";

const emptyInspection = {
  rows: "—",
  columns: "—",
  numerical_features: "—",
  categorical_features: "—",
  missing_values: "—",
  duplicate_rows: "—",
  target_unique_values: "—",
};

function UploadDatasets() {
  // --------------------------------------------------
  // Model upload state
  // --------------------------------------------------

  const [modelFile, setModelFile] = useState(null);
  const [modelUploadStatus, setModelUploadStatus] =
    useState("Waiting for upload");
  const [modelUploadError, setModelUploadError] = useState("");

  // Backend-saved model metadata
  const [modelPath, setModelPath] = useState("");
  const [modelType, setModelType] = useState("");
  const [framework, setFramework] = useState("");

  // --------------------------------------------------
  // Preprocessor upload state
  // --------------------------------------------------

  const [preprocessorFile, setPreprocessorFile] = useState(null);
  const [preprocessorPath, setPreprocessorPath] = useState("");
  const [preprocessorUploadStatus, setPreprocessorUploadStatus] =
    useState("Waiting for upload");
  const [preprocessorUploadError, setPreprocessorUploadError] =
    useState("");

  // --------------------------------------------------
  // Dataset upload state
  // --------------------------------------------------

  const [referenceDataset, setReferenceDataset] = useState(null);
  const [currentDataset, setCurrentDataset] = useState(null);

  const [targetColumn, setTargetColumn] = useState("");
  const [problemType, setProblemType] = useState("");

  const [datasetUploadStatus, setDatasetUploadStatus] =
    useState("Waiting for dataset upload");
  const [datasetUploadError, setDatasetUploadError] = useState("");

  const [referenceInspection, setReferenceInspection] =
    useState(emptyInspection);
  const [currentInspection, setCurrentInspection] =
    useState(emptyInspection);

  // Backend-saved dataset paths
  const [referenceDatasetPath, setReferenceDatasetPath] = useState("");
  const [currentDatasetPath, setCurrentDatasetPath] = useState("");

  // Monitoring configuration state
  const [monitoringFeature, setMonitoringFeature] = useState("");
  const [batchSize, setBatchSize] = useState(100);
  const [maxBatches, setMaxBatches] = useState("");
  const [monitoringConfigStatus, setMonitoringConfigStatus] =
    useState("Waiting for configuration");
  const [monitoringConfigError, setMonitoringConfigError] = useState("");

  // --------------------------------------------------
  // Model upload
  // --------------------------------------------------

  const handleModelUpload = async () => {
    if (!modelFile) {
      setModelUploadError("Please choose a model file first.");
      setModelUploadStatus("No model selected");
      return;
    }

    setModelUploadError("");
    setModelUploadStatus("Uploading model...");

    try {
      const result = await uploadModel(modelFile);

      if (result?.status === "success") {
        const savedModelPath = result?.saved_path || "";
        const savedModelType = result?.model_type || "";
        const savedFramework = result?.framework || "";

        setModelPath(savedModelPath);
        setModelType(savedModelType);
        setFramework(savedFramework);

        localStorage.setItem(
          "driftwatcher.modelConfig",
          JSON.stringify({
            modelPath: savedModelPath,
            modelType: savedModelType,
            framework: savedFramework,
            filename: modelFile.name,
          })
        );
      }

      setModelUploadStatus(
        result?.status === "success"
          ? "Model uploaded successfully"
          : "Upload completed"
      );
    } catch (error) {
      console.error("Model upload failed:", error);

      const message =
        error?.response?.data?.detail ||
        error?.message ||
        "Model upload failed.";

      setModelUploadError(message);
      setModelUploadStatus("Upload failed");
    }
  };

  // --------------------------------------------------
  // Preprocessor upload
  // --------------------------------------------------

  const handlePreprocessorUpload = async () => {
    if (!preprocessorFile) {
      setPreprocessorUploadError(
        "Please choose a preprocessor file first."
      );
      setPreprocessorUploadStatus("No preprocessor selected");
      return;
    }

    setPreprocessorUploadError("");
    setPreprocessorUploadStatus("Uploading preprocessor...");

    try {
      const result = await uploadPreprocessor(preprocessorFile);

      if (result?.status === "success") {
        const savedPreprocessorPath = result?.saved_path || "";

        setPreprocessorPath(savedPreprocessorPath);

        localStorage.setItem(
          "driftwatcher.preprocessorConfig",
          JSON.stringify({
            preprocessorPath: savedPreprocessorPath,
            filename: preprocessorFile.name,
          })
        );

        setPreprocessorUploadStatus(
          "Preprocessor uploaded successfully"
        );
      } else {
        setPreprocessorUploadStatus("Upload completed");
      }
    } catch (error) {
      console.error("Preprocessor upload failed:", error);

      const message =
        error?.response?.data?.detail ||
        error?.message ||
        "Preprocessor upload failed.";

      setPreprocessorUploadError(message);
      setPreprocessorUploadStatus("Upload failed");
    }
  };

  // --------------------------------------------------
  // Dataset upload
  // --------------------------------------------------

  const handleDatasetUpload = async () => {
    if (!referenceDataset || !currentDataset) {
      setDatasetUploadError(
        "Please choose both the reference dataset and current dataset."
      );
      setDatasetUploadStatus("Both datasets are required");
      return;
    }

    if (!targetColumn.trim()) {
      setDatasetUploadError("Please enter the target column.");
      setDatasetUploadStatus("Target column required");
      return;
    }

    if (!problemType) {
      setDatasetUploadError("Please select the problem type.");
      setDatasetUploadStatus("Problem type required");
      return;
    }

    setDatasetUploadError("");
    setDatasetUploadStatus("Uploading and inspecting datasets...");

    try {
      const result = await uploadDatasets({
        referenceDataset,
        currentDataset,
        targetColumn: targetColumn.trim(),
        problemType,
      });

      if (result?.status === "success") {
        const savedReferencePath =
          result?.reference_dataset?.saved_path || "";
        const savedCurrentPath =
          result?.current_dataset?.saved_path || "";

        setReferenceDatasetPath(savedReferencePath);
        setCurrentDatasetPath(savedCurrentPath);

        localStorage.setItem(
          "driftwatcher.datasetConfig",
          JSON.stringify({
            referenceDatasetPath: savedReferencePath,
            currentDatasetPath: savedCurrentPath,
            targetColumn: targetColumn.trim(),
            problemType,
            referenceFilename: referenceDataset.name,
            currentFilename: currentDataset.name,
          })
        );

        setReferenceInspection(
          result?.reference_dataset?.inspection || emptyInspection
        );

        setCurrentInspection(
          result?.current_dataset?.inspection || emptyInspection
        );

        setDatasetUploadStatus(
          "Reference and current datasets uploaded successfully"
        );
      } else {
        setDatasetUploadStatus("Dataset upload completed");
      }
    } catch (error) {
      console.error("Dataset upload failed:", error);

      const message =
        error?.response?.data?.detail ||
        error?.message ||
        "Dataset upload failed.";

      setDatasetUploadError(message);
      setDatasetUploadStatus("Upload failed");
    }
  };

  // --------------------------------------------------
  // Create Monitoring Configuration
  // --------------------------------------------------

  const handleCreateMonitoringConfig = async () => {
    if (!modelPath) {
      setMonitoringConfigError("Please upload the model first.");
      setMonitoringConfigStatus("Model required");
      return;
    }

    if (!referenceDatasetPath || !currentDatasetPath) {
      setMonitoringConfigError(
        "Please upload both reference and current datasets first."
      );
      setMonitoringConfigStatus("Datasets required");
      return;
    }

    if (!preprocessorPath) {
      setMonitoringConfigError(
        "Please upload the fitted preprocessor first."
      );
      setMonitoringConfigStatus("Preprocessor required");
      return;
    }

    if (!targetColumn.trim()) {
      setMonitoringConfigError("Please enter the target column.");
      setMonitoringConfigStatus("Target column required");
      return;
    }

    if (!problemType) {
      setMonitoringConfigError("Please select the problem type.");
      setMonitoringConfigStatus("Problem type required");
      return;
    }

    setMonitoringConfigError("");
    setMonitoringConfigStatus("Creating monitoring configuration...");

    try {
      const result = await createMonitoringConfig({
        modelPath,
        referenceDatasetPath,
        currentDatasetPath,
        targetColumn: targetColumn.trim(),
        problemType,
        modelType: modelType || null,
        framework: framework || null,
        monitoringFeature: monitoringFeature.trim() || null,
      });

      if (result?.status === "success") {
        const monitoringConfig = {
          modelPath,
          modelType,
          framework,
          preprocessorPath,
          referenceDatasetPath,
          currentDatasetPath,
          targetColumn: targetColumn.trim(),
          problemType,
          monitoringFeature: monitoringFeature.trim() || null,
          batchSize: Number(batchSize) || 100,
          maxBatches: maxBatches ? Number(maxBatches) : null,
        };

        localStorage.setItem(
          "driftwatcher.monitoringConfig",
          JSON.stringify(monitoringConfig)
        );

        setMonitoringConfigStatus(
          "Monitoring configuration created successfully"
        );
      } else {
        setMonitoringConfigStatus("Configuration created");
      }
    } catch (error) {
      console.error("Monitoring configuration failed:", error);

      const message =
        error?.response?.data?.detail ||
        error?.message ||
        "Failed to create monitoring configuration.";

      setMonitoringConfigError(message);
      setMonitoringConfigStatus("Configuration failed");
    }
  };

  // --------------------------------------------------
  // Inspection helper
  // --------------------------------------------------

  const inspectionValue = (inspection, key) =>
    inspection?.[key] ?? "—";

  return (
    <div className="app-shell">
      <Sidebar />

      <main className="main-area">
        <Topbar title="Upload Model & Datasets" />

        <section className="dashboard-content">
          <div className="page-heading">
            <div>
              <h3>Upload Model & Datasets</h3>
              <p>
                Upload your trained model, reference dataset, and current
                monitoring data to start monitoring.
              </p>
            </div>
          </div>

          {/* =========================
              Upload Section
          ========================== */}
          <div className="upload-page-grid">
            {/* Model Upload */}
            <div className="panel upload-card">
              <div className="upload-card-header">
                <div className="upload-icon blue">
                  <BrainCircuit size={22} />
                </div>

                <div>
                  <h4>Trained Model</h4>
                  <p>Upload your trained ML/DL model</p>
                </div>
              </div>

              <label className="file-upload-box">
                <Upload size={28} />

                <strong>Choose Model File</strong>

                <span>
                  Supported model formats depend on the available model
                  adapter.
                </span>

                <input
                  type="file"
                  accept=".joblib,.pkl,.pickle,.pt,.pth,.bin,.keras,.h5,.json,.ubj,.txt,.lgb"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    setModelFile(file);
                    setModelUploadError("");
                    setModelUploadStatus(
                      file
                        ? "Model selected — ready to upload"
                        : "Waiting for upload"
                    );
                  }}
                />
              </label>

              <div style={{ marginTop: "14px" }}>
                <small>
                  {modelFile
                    ? `Selected: ${modelFile.name}`
                    : "No model file selected"}
                </small>

                <button
                  type="button"
                  className="primary-action"
                  onClick={handleModelUpload}
                  style={{ marginTop: "10px", width: "100%" }}
                  disabled={
                    !modelFile || modelUploadStatus === "Uploading model..."
                  }
                >
                  <Upload size={17} />
                  {modelUploadStatus === "Uploading model..."
                    ? "Uploading..."
                    : "Upload Model"}
                </button>

                <small
                  style={{
                    display: "block",
                    marginTop: "8px",
                    color: modelUploadError ? "#d14343" : undefined,
                  }}
                >
                  {modelUploadError || modelUploadStatus}
                </small>
              </div>
            </div>

            {/* Preprocessor Upload */}
            <div className="panel upload-card">
              <div className="upload-card-header">
                <div className="upload-icon green">
                  <Database size={22} />
                </div>

                <div>
                  <h4>Preprocessing Pipeline</h4>
                  <p>Fitted transformation pipeline used by the model</p>
                </div>
              </div>

              <label className="file-upload-box">
                <Upload size={28} />

                <strong>Choose Preprocessor File</strong>

                <span>Supported formats: .joblib, .pkl, .pickle</span>

                <input
                  type="file"
                  accept=".joblib,.pkl,.pickle"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    setPreprocessorFile(file);
                    setPreprocessorUploadError("");
                    setPreprocessorUploadStatus(
                      file
                        ? "Preprocessor selected — ready to upload"
                        : "Waiting for upload"
                    );
                  }}
                />
              </label>

              <div style={{ marginTop: "14px" }}>
                <small>
                  {preprocessorFile
                    ? `Selected: ${preprocessorFile.name}`
                    : "No preprocessor file selected"}
                </small>

                <button
                  type="button"
                  className="primary-action"
                  onClick={handlePreprocessorUpload}
                  style={{ marginTop: "10px", width: "100%" }}
                  disabled={
                    !preprocessorFile ||
                    preprocessorUploadStatus ===
                      "Uploading preprocessor..."
                  }
                >
                  <Upload size={17} />
                  {preprocessorUploadStatus ===
                  "Uploading preprocessor..."
                    ? "Uploading..."
                    : "Upload Preprocessor"}
                </button>

                <small
                  style={{
                    display: "block",
                    marginTop: "8px",
                    color: preprocessorUploadError
                      ? "#d14343"
                      : undefined,
                  }}
                >
                  {preprocessorUploadError ||
                    preprocessorUploadStatus}
                </small>
              </div>
            </div>

            {/* Reference Dataset */}
            <div className="panel upload-card">
              <div className="upload-card-header">
                <div className="upload-icon purple">
                  <Database size={22} />
                </div>

                <div>
                  <h4>Reference / Training Dataset</h4>
                  <p>Baseline data used by the model</p>
                </div>
              </div>

              <label className="file-upload-box">
                <Upload size={28} />

                <strong>Choose Reference Dataset</strong>

                <span>CSV, Parquet, JSON or Excel</span>

                <input
                  type="file"
                  accept=".csv,.parquet,.json,.xlsx"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    setReferenceDataset(file);
                    setDatasetUploadError("");
                    setDatasetUploadStatus(
                      file
                        ? "Reference dataset selected"
                        : "Waiting for dataset upload"
                    );
                  }}
                />
              </label>

              <small style={{ display: "block", marginTop: "14px" }}>
                {referenceDataset
                  ? `Selected: ${referenceDataset.name}`
                  : "No reference dataset selected"}
              </small>
            </div>

            {/* Current Dataset */}
            <div className="panel upload-card">
              <div className="upload-card-header">
                <div className="upload-icon orange">
                  <Database size={22} />
                </div>

                <div>
                  <h4>Current / Monitoring Dataset</h4>
                  <p>Incoming or production monitoring data</p>
                </div>
              </div>

              <label className="file-upload-box">
                <Upload size={28} />

                <strong>Choose Current Dataset</strong>

                <span>CSV, Parquet, JSON or Excel</span>

                <input
                  type="file"
                  accept=".csv,.parquet,.json,.xlsx"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    setCurrentDataset(file);
                    setDatasetUploadError("");
                    setDatasetUploadStatus(
                      file
                        ? "Current dataset selected"
                        : "Waiting for dataset upload"
                    );
                  }}
                />
              </label>

              <small style={{ display: "block", marginTop: "14px" }}>
                {currentDataset
                  ? `Selected: ${currentDataset.name}`
                  : "No current dataset selected"}
              </small>
            </div>
          </div>

          {/* Dataset Upload Action */}
          <div
            className="panel"
            style={{
              marginTop: "18px",
              padding: "18px 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "18px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <h4 style={{ margin: 0 }}>Dataset Upload & Inspection</h4>
              <p style={{ margin: "6px 0 0" }}>
                Upload both datasets to the backend and run dataset inspection.
              </p>

              <small
                style={{
                  display: "block",
                  marginTop: "7px",
                  color: datasetUploadError ? "#d14343" : undefined,
                }}
              >
                {datasetUploadError || datasetUploadStatus}
              </small>
            </div>

            <button
              type="button"
              className="primary-action"
              onClick={handleDatasetUpload}
              disabled={
                !referenceDataset ||
                !currentDataset ||
                datasetUploadStatus ===
                  "Uploading and inspecting datasets..."
              }
            >
              <Upload size={17} />
              {datasetUploadStatus ===
              "Uploading and inspecting datasets..."
                ? "Uploading..."
                : "Upload Datasets"}
            </button>
          </div>

          {/* =========================
              Monitoring Configuration
          ========================== */}
          <div className="panel configuration-panel">
            <div className="panel-header">
              <div>
                <h4>Monitoring Configuration</h4>

                <p>
                  Provide the information required to configure monitoring.
                </p>
              </div>
            </div>

            <div className="configuration-grid">
              {/* Target Column */}
              <div className="form-group">
                <label>Target Column</label>

                <input
                  type="text"
                  placeholder="e.g. target_column"
                  value={targetColumn}
                  onChange={(event) => setTargetColumn(event.target.value)}
                />
              </div>

              {/* Problem Type */}
              <div className="form-group">
                <label>Problem Type</label>

                <select
                  value={problemType}
                  onChange={(event) => setProblemType(event.target.value)}
                >
                  <option value="" disabled>
                    Select problem type
                  </option>
                  <option value="classification">Classification</option>
                  <option value="regression">Regression</option>
                </select>
              </div>

              {/* Monitoring Feature */}
              <div className="form-group">
                <label>Monitoring Feature</label>

                <input
                  type="text"
                  placeholder="Optional — e.g. Risk_Score"
                  value={monitoringFeature}
                  onChange={(event) => setMonitoringFeature(event.target.value)}
                />
              </div>

              {/* Batch Size */}
              <div className="form-group">
                <label>Batch Size</label>

                <input
                  type="number"
                  min="1"
                  value={batchSize}
                  onChange={(event) => setBatchSize(event.target.value)}
                  placeholder="e.g. 100"
                />
              </div>

              {/* Maximum Batches */}
              <div className="form-group">
                <label>Maximum Batches</label>

                <input
                  type="number"
                  min="1"
                  value={maxBatches}
                  onChange={(event) => setMaxBatches(event.target.value)}
                  placeholder="Optional — e.g. 100"
                />
              </div>
            </div>

            <div
              style={{
                marginTop: "18px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "14px",
                flexWrap: "wrap",
              }}
            >
              <small
                style={{
                  color: monitoringConfigError ? "#d14343" : undefined,
                }}
              >
                {monitoringConfigError || monitoringConfigStatus}
              </small>

              <button
                type="button"
                className="primary-action"
                onClick={handleCreateMonitoringConfig}
                disabled={
                  !modelPath ||
                  !referenceDatasetPath ||
                  !currentDatasetPath ||
                  monitoringConfigStatus ===
                    "Creating monitoring configuration..."
                }
              >
                <Play size={18} />
                {monitoringConfigStatus ===
                "Creating monitoring configuration..."
                  ? "Creating..."
                  : "Create Monitoring Configuration"}
              </button>
            </div>
          </div>

          {/* =========================
              Dataset Inspection
          ========================== */}
          <div className="panel dataset-inspection-panel">
            <div className="panel-header">
              <div>
                <h4>Dataset Inspection</h4>

                <p>
                  Dataset structure and quality information returned by the
                  backend inspector.
                </p>
              </div>

              <div className="inspection-status">
                <CheckCircle2 size={17} />
                {datasetUploadStatus ===
                "Reference and current datasets uploaded successfully"
                  ? "Inspection completed"
                  : "Ready for inspection"}
              </div>
            </div>

            <div className="inspection-grid">
              {/* Reference Dataset Inspection */}
              <div className="inspection-card">
                <div className="inspection-card-header">
                  <div className="inspection-icon purple">
                    <BarChart3 size={20} />
                  </div>

                  <div>
                    <h4>Reference / Training Dataset</h4>
                    <p>Dataset inspection results</p>
                  </div>
                </div>

                <div className="inspection-stats">
                  <div className="inspection-stat">
                    <span>Rows</span>
                    <strong>
                      {inspectionValue(referenceInspection, "rows")}
                    </strong>
                  </div>

                  <div className="inspection-stat">
                    <span>Columns</span>
                    <strong>
                      {inspectionValue(referenceInspection, "columns")}
                    </strong>
                  </div>

                  <div className="inspection-stat">
                    <span>Numerical Features</span>
                    <strong>
                      {Array.isArray(referenceInspection?.numerical_features)
                        ? referenceInspection.numerical_features.length
                        : inspectionValue(
                            referenceInspection,
                            "numerical_features"
                          )}
                    </strong>
                  </div>

                  <div className="inspection-stat">
                    <span>Categorical Features</span>
                    <strong>
                      {Array.isArray(referenceInspection?.categorical_features)
                        ? referenceInspection.categorical_features.length
                        : inspectionValue(
                            referenceInspection,
                            "categorical_features"
                          )}
                    </strong>
                  </div>

                  <div className="inspection-stat">
                    <span>Missing Values</span>
                    <strong>
                      {inspectionValue(
                        referenceInspection,
                        "missing_values"
                      )}
                    </strong>
                  </div>

                  <div className="inspection-stat">
                    <span>Duplicate Rows</span>
                    <strong>
                      {inspectionValue(
                        referenceInspection,
                        "duplicate_rows"
                      )}
                    </strong>
                  </div>

                  <div className="inspection-stat">
                    <span>Target Unique Values</span>
                    <strong>
                      {inspectionValue(
                        referenceInspection,
                        "target_unique_values"
                      )}
                    </strong>
                  </div>

                  <div className="inspection-stat">
                    <span>Status</span>
                    <strong>
                      {referenceInspection?.status === "success"
                        ? "Inspected"
                        : "Waiting for upload"}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Current Dataset Inspection */}
              <div className="inspection-card">
                <div className="inspection-card-header">
                  <div className="inspection-icon orange">
                    <BarChart3 size={20} />
                  </div>

                  <div>
                    <h4>Current / Monitoring Dataset</h4>
                    <p>Dataset inspection results</p>
                  </div>
                </div>

                <div className="inspection-stats">
                  <div className="inspection-stat">
                    <span>Rows</span>
                    <strong>
                      {inspectionValue(currentInspection, "rows")}
                    </strong>
                  </div>

                  <div className="inspection-stat">
                    <span>Columns</span>
                    <strong>
                      {inspectionValue(currentInspection, "columns")}
                    </strong>
                  </div>

                  <div className="inspection-stat">
                    <span>Numerical Features</span>
                    <strong>
                      {Array.isArray(currentInspection?.numerical_features)
                        ? currentInspection.numerical_features.length
                        : inspectionValue(
                            currentInspection,
                            "numerical_features"
                          )}
                    </strong>
                  </div>

                  <div className="inspection-stat">
                    <span>Categorical Features</span>
                    <strong>
                      {Array.isArray(currentInspection?.categorical_features)
                        ? currentInspection.categorical_features.length
                        : inspectionValue(
                            currentInspection,
                            "categorical_features"
                          )}
                    </strong>
                  </div>

                  <div className="inspection-stat">
                    <span>Missing Values</span>
                    <strong>
                      {inspectionValue(currentInspection, "missing_values")}
                    </strong>
                  </div>

                  <div className="inspection-stat">
                    <span>Duplicate Rows</span>
                    <strong>
                      {inspectionValue(currentInspection, "duplicate_rows")}
                    </strong>
                  </div>

                  <div className="inspection-stat">
                    <span>Target Unique Values</span>
                    <strong>
                      {inspectionValue(
                        currentInspection,
                        "target_unique_values"
                      )}
                    </strong>
                  </div>

                  <div className="inspection-stat">
                    <span>Status</span>
                    <strong>
                      {currentInspection?.status === "success"
                        ? "Inspected"
                        : "Waiting for upload"}
                    </strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default UploadDatasets;
