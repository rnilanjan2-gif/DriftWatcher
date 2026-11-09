import {
  Activity,
  Bell,
  Bot,
  BrainCircuit,
  FileText,
  Gauge,
  GitBranch,
  Layers3,
  LineChart,
  RefreshCw,
  Settings,
  ShieldAlert,
  Upload,
  Workflow,
} from "lucide-react";

import { NavLink } from "react-router-dom";

const navigation = [
  { label: "Dashboard", path: "/", icon: Gauge },
  { label: "Models", path: "/models", icon: Layers3 },
  { label: "Upload & Datasets", path: "/upload", icon: Upload },
  { label: "Data Stream", path: "/data-stream", icon: Activity },
  { label: "Drift Detection", path: "/drift-detection", icon: LineChart },
  { label: "AI Agents", path: "/ai-agents", icon: Bot },
  { label: "Root Cause Analysis", path: "/root-cause", icon: BrainCircuit },
  { label: "Retraining", path: "/retraining", icon: RefreshCw },
  { label: "Deployment", path: "/deployment", icon: GitBranch },
  { label: "Reports", path: "/reports", icon: FileText },
  { label: "Alerts", path: "/alerts", icon: Bell },
  { label: "Experiments", path: "/experiments", icon: Workflow },
  { label: "Settings", path: "/settings", icon: Settings },
];

function Sidebar() {
  return (
    <aside className="sidebar">
      {/* Brand */}
      <div className="brand">
        <div className="brand-icon">
          <Activity size={25} />
        </div>

        <div>
          <h1>DriftWatcher</h1>
          <span>Agentic AI Platform</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {navigation.map(({ label, path, icon: Icon }) => (
          <NavLink
            key={label}
            to={path}
            end={path === "/"}
            className={({ isActive }) =>
              `nav-item ${isActive ? "active" : ""}`
            }
          >
            <Icon size={18} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
        <div className="footer-icon">
          <ShieldAlert size={20} />
        </div>

        <div>
          <strong>Agentic AI</strong>
          <span>for Reliable ML</span>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;