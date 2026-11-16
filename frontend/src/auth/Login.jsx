
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity } from "lucide-react";
import "./Login.css";

function Login() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = (e) => {
    e.preventDefault();

    if (username === "demo_user" && password === "Drift@2026") {
      sessionStorage.setItem("driftwatcher_demo_login", "true");
      navigate("/upload", { replace: true });
    } else {
      setError("Invalid username or password. Please try again.");
    }
  };

  return (
    <div className="login-page">
      <section className="login-left">
        <div className="login-brand">
          <div className="brand-logo">
            <Activity size={25} />
          </div>
          <div>
            <h2>DriftWatcher</h2>
            <p>Agentic AI Platform</p>
          </div>
        </div>

        <div className="login-intro">
          <h1>
            AI-Driven ML Model
            <span>Monitoring Platform</span>
          </h1>

          <p>
            Detect concept drift, analyze root causes, and adapt
            models with a multi-agent AI framework.
          </p>
        </div>

        <div className="login-features">
          <div>〰 <span>Real-time Drift Detection</span></div>
          <div>▱ <span>Multi-Agent Analysis</span></div>
          <div>⟳ <span>Adaptive Retraining</span></div>
          <div>▥ <span>Model Monitoring & Reports</span></div>
        </div>
      </section>

      <section className="login-right">
        <div className="login-card">
          <div className="login-card-brand">
            <div className="brand-logo">
                <Activity size={25} />
            </div>
            <div>
              <h2>DriftWatcher</h2>
              <p>Agentic AI Platform</p>
            </div>
          </div>

          <h1>Welcome to DriftWatcher</h1>
          <p className="login-subtitle">
            Sign in to access the model monitoring dashboard.
          </p>

          <form onSubmit={handleLogin}>
            <div className="login-input">
              <span>♙</span>
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError("");
                }}
                required
              />
            </div>

            <div className="login-input">
              <span>♙</span>
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError("");
                }}
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>

            {error && <p className="login-error">{error}</p>}

            <button type="submit" className="login-button">
              Login
            </button>
          </form>

          <div className="demo-notice">
            <strong>ⓘ Demo Access</strong>
            <p>Use the demo credentials to explore the platform.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

export default Login;
