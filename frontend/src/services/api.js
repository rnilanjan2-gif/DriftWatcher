import axios from "axios";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "https://driftwatcher-api-696855161019.asia-south1.run.app";

const api = axios.create({
  baseURL: API_BASE_URL,
});

// ==================================================
// HEALTH CHECK
// ==================================================

export const healthCheck = async () => {
  const response = await api.get("/health");

  return response.data;
};

// ==================================================
// UPLOAD MODEL
// ==================================================

export const uploadModel = async (file) => {
  const formData = new FormData();

  formData.append("file", file);

  const response = await api.post(
    "/upload-model",
    formData
  );

  return response.data;
};

// ==================================================
// UPLOAD PREPROCESSOR
// ==================================================

export const uploadPreprocessor = async (file) => {
  const formData = new FormData();

  formData.append("file", file);

  const response = await api.post(
    "/upload-preprocessor",
    formData
  );

  return response.data;
};

// ==================================================
// UPLOAD REFERENCE + CURRENT DATASETS
// ==================================================

export const uploadDatasets = async ({
  referenceDataset,
  currentDataset,
  targetColumn,
  problemType,
}) => {
  const formData = new FormData();

  formData.append(
    "reference_dataset",
    referenceDataset
  );

  formData.append(
    "current_dataset",
    currentDataset
  );

  if (targetColumn) {
    formData.append(
      "target_column",
      targetColumn
    );
  }

  if (problemType) {
    formData.append(
      "problem_type",
      problemType
    );
  }

  const response = await api.post(
    "/upload-datasets",
    formData
  );

  return response.data;
};

// ==================================================
// CREATE MONITORING CONFIGURATION
// ==================================================

export const createMonitoringConfig = async ({
  modelPath,
  referenceDatasetPath,
  currentDatasetPath,
  targetColumn,
  problemType,
  modelType = null,
  framework = null,
  monitoringFeature = null,
}) => {
  const response = await api.post(
    "/create-monitoring-config",
    null,
    {
      params: {
        model_path: modelPath,
        reference_dataset_path:
          referenceDatasetPath,
        current_dataset_path:
          currentDatasetPath,
        target_column:
          targetColumn,
        problem_type:
          problemType,
        model_type:
          modelType,
        framework:
          framework,
        monitoring_feature:
          monitoringFeature,
      },
    }
  );

  return response.data;
};

// ==================================================
// STANDARD MODEL MONITORING
// ==================================================

export const runMonitoring = async ({
  modelPath,
  currentDatasetPath,
  targetColumn,
  preprocessorPath = null,
}) => {
  const response = await api.post(
    "/run-monitoring",
    null,
    {
      params: {
        model_path:
          modelPath,
        current_dataset_path:
          currentDatasetPath,
        target_column:
          targetColumn,
        preprocessor_path:
          preprocessorPath,
      },
    }
  );

  return response.data;
};

// ==================================================
// STREAM DRIFT DETECTION
// ==================================================

export const runStreamDriftDetection = async ({
  modelPath,
  currentDatasetPath,
  targetColumn,
  preprocessorPath = null,
  monitoringFeature = null,
  batchSize = 100,
  maxBatches = null,
}) => {
  const response = await api.post(
    "/run-stream-drift-detection",
    null,
    {
      params: {
        model_path:
          modelPath,
        current_dataset_path:
          currentDatasetPath,
        target_column:
          targetColumn,
        preprocessor_path:
          preprocessorPath,
        monitoring_feature:
          monitoringFeature,
        batch_size:
          batchSize,
        max_batches:
          maxBatches,
      },
    }
  );

  return response.data;
};

// ==================================================
// COMPLETE DRIFTWATCHER WORKFLOW
// ==================================================

export const runWorkflow = async ({
  referenceDatasetPath,
  currentDatasetPath,
  modelPath,
  targetColumn,
  preprocessorPath = null,
  problemType = null,
  monitoringFeature = null,
  timestampColumn = null,
}) => {
  const response = await api.post(
    "/run-workflow",
    null,
    {
      params: {
        reference_dataset_path:
          referenceDatasetPath,

        current_dataset_path:
          currentDatasetPath,

        model_path:
          modelPath,

        target_column:
          targetColumn,

        preprocessor_path:
          preprocessorPath,

        problem_type:
          problemType,

        monitoring_feature:
          monitoringFeature,

        timestamp_column:
          timestampColumn,
      },
    }
  );

  return response.data;
};

// ==================================================
// MODEL REGISTRY
// ==================================================

export const getModelRegistry = async () => {
  const response = await api.get(
    "/model-registry"
  );

  return response.data;
};

// ==================================================
// ACTIVE MODEL
// ==================================================

export const getActiveModel = async () => {
  const response = await api.get(
    "/active-model"
  );

  return response.data;
};

// ==================================================
// ROLLBACK MODEL
// ==================================================

export const rollbackModel = async (
  version
) => {
  const response = await api.post(
    "/rollback",
    null,
    {
      params: {
        version,
      },
    }
  );

  return response.data;
};

// ==================================================
// EXPORT AXIOS INSTANCE
// ==================================================

export default api;