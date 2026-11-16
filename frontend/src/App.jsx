
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
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

import Login from "./auth/Login";

import { healthCheck } from "./services/api";

import "./App.css";

// Protect all application pages
function RequireDemoLogin() {
  const isLoggedIn =
    sessionStorage.getItem("driftwatcher_demo_login") === "true";

  return isLoggedIn ? <Outlet /> : <Navigate to="/login" replace />;
}

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

        {/* Public Login Page */}
        <Route path="/login" element={<Login />} />

        {/* Protected Application Pages */}
        <Route element={<RequireDemoLogin />}>

          <Route path="/" element={<Navigate to="/upload" replace />} />

          <Route path="/dashboard" element={<Dashboard />} />

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

        </Route>

        {/* Unknown routes */}
        <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>
    </BrowserRouter>
  );
}

export default App;
