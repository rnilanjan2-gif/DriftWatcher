import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect } from "react";

import Dashboard from "./pages/Dashboard";
import Models from "./pages/Models";
import UploadDatasets from "./pages/UploadDatasets";
import DataStream from "./pages/DataStream";
import DriftDetection from "./pages/DriftDetection";
import AIAgents from "./pages/AIAgents";
import RootCause from "./pages/RootCause";
import Retraining from "./pages/Retraining";
import Deployment from "./pages/Deployment";
import Reports from "./pages/Reports";
import Alerts from "./pages/Alerts";
import Experiments from "./pages/Experiments";

import { healthCheck } from "./services/api";

import "./App.css";

function App() {
  useEffect(() => {
    healthCheck()
      .then((data) => {
        console.log("DriftWatcher API:", data);
      })
      .catch((error) => {
        console.error("DriftWatcher API connection failed:", error);
      });
  }, []);

  return (
    <BrowserRouter>
      <Routes>

        <Route path="/" element={<Dashboard />} />

        <Route path="/models" element={<Models />} />

        <Route path="/upload" element={<UploadDatasets />} />

        <Route path="/data-stream" element={<DataStream />} />

        <Route path="/drift-detection" element={<DriftDetection />} />

        <Route path="/ai-agents" element={<AIAgents />} />

        <Route path="/root-cause" element={<RootCause />} />

        <Route path="/retraining" element={<Retraining />} />

        <Route path="/deployment" element={<Deployment />} />

        <Route path="/reports" element={<Reports />} />

        <Route path="/alerts" element={<Alerts />} />

        <Route path="/experiments" element={<Experiments />} />

      </Routes>
    </BrowserRouter>
  );
}

export default App;