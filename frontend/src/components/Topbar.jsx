import {
  Bell,
  Search,
} from "lucide-react";

function Topbar({ title = "Dashboard" }) {
  return (
    <header className="topbar">
      <div>
        <div className="breadcrumb">
          DriftWatcher / {title}
        </div>

        <h2>{title}</h2>
      </div>

      <div className="topbar-actions">
        <div className="search-box">
          <Search size={17} />
          <input placeholder="Search..." />
        </div>

        <button className="icon-button">
          <Bell size={19} />
          <span className="notification-dot"></span>
        </button>

        <div className="user-profile">
          <div className="avatar">N</div>

          <div>
            <strong>Nilanjan Roy</strong>
            <span>Administrator</span>
          </div>
        </div>
      </div>
    </header>
  );
}

export default Topbar;