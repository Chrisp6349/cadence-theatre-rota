// -----------------------------------------------------------------------
// shell.js
// Renders the Cadence sidebar + topbar into #shellRoot on every page,
// with nav items shown/hidden by role. Leave/annual-leave intentionally
// left out. Insights/Staff-profiles are still placeholders for a later
// phase; Calendar (On Call Calendar) is implemented.
// -----------------------------------------------------------------------

import { logout } from "./auth.js";
import { initThemeControls } from "./theme.js";

const ICONS = {
  dashboard: `<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>`,
  rota: `<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>`,
  calendar: `<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>`,
  admin: `<path d="M12 2l8 3v6c0 5-3.4 8.4-8 11-4.6-2.6-8-6-8-11V5l8-3z"/>`,
  settings: `<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.6 1.6 0 00.32 1.76"/>`,
  moon: `<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>`,
  minus: `<path d="M5 12h14"/>`,
  plus: `<path d="M12 5v14M5 12h14"/>`
};

function iconSvg(key){
  return `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[key]}</svg>`;
}

// pages: [{ key, label, href, icon, roles: [...] }]
const NAV = [
  { section: "Overview" },
  { key: "dashboard", label: "Dashboard", href: "dashboard.html", icon: "dashboard", roles: ["viewer","editor","admin"] },
  { key: "rota", label: "Rota", href: "rota.html", icon: "rota", roles: ["viewer","editor","admin"] },
  { key: "calendar", label: "On Call Calendar", href: "calendar.html", icon: "calendar", roles: ["viewer","editor","admin"] },
  { section: "System" },
  { key: "admin", label: "Administration", href: "admin.html", icon: "admin", roles: ["admin"] },
];

export function renderShell({ profile, activePage, title }) {
  const root = document.getElementById("shellRoot");
  const initials = (profile.displayName || "?").split(" ").map(s => s[0]).slice(0,2).join("").toUpperCase();

  let navHtml = "";
  NAV.forEach(item => {
    if (item.section) { navHtml += `<div class="nav-section-label">${item.section}</div>`; return; }
    if (!item.roles.includes(profile.role)) return;
    navHtml += `<a class="nav-item ${item.key === activePage ? "active" : ""}" href="${item.href}">
      ${iconSvg(item.icon)}<span class="nav-label">${item.label}</span></a>`;
  });

  root.innerHTML = `
    <div class="app-shell">
      <aside class="app-sidebar" id="sidebar">
        <div class="sb-trust">
          <div class="logo-mark">${(profile.departmentName || "??").slice(0,2).toUpperCase()}</div>
          <div style="flex:1;min-width:0;">
            <div class="dept-name">${profile.departmentName || "Department"}</div>
            <div class="dept-sub">${profile.role}</div>
          </div>
          <button class="sb-collapse-btn" id="collapseBtn" aria-label="Collapse sidebar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M9 4l-6 8 6 8M21 4l-6 8 6 8"/></svg>
          </button>
        </div>
        <div class="sb-nav">${navHtml}</div>
        <div class="sb-foot">
          <div class="avatar">${initials}</div>
          <div style="min-width:0;flex:1;">
            <div class="who">${profile.displayName || "—"}</div>
            <div class="role">${profile.role}</div>
          </div>
          <button class="btn btn-ghost btn-sm" id="logoutBtn" title="Sign out">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
          </button>
        </div>
      </aside>
      <div class="app-main">
        <div class="app-topbar">
          <h3>${title}</h3>
          <div class="topbar-right">
            <button class="icon-btn" id="textSizeDownBtn" title="Smaller text">${iconSvg("minus")}</button>
            <span class="text-size-label" id="textSizeLabel">M</span>
            <button class="icon-btn" id="textSizeUpBtn" title="Larger text">${iconSvg("plus")}</button>
            <button class="icon-btn" id="darkModeBtn" title="Toggle dark mode">${iconSvg("moon")}</button>
          </div>
        </div>
        <div class="app-content" id="pageContent"></div>
      </div>
    </div>
  `;

  document.getElementById("collapseBtn").addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("collapsed");
  });
  document.getElementById("logoutBtn").addEventListener("click", logout);
  initThemeControls(root);

  return document.getElementById("pageContent");
}
