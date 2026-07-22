// -----------------------------------------------------------------------
// admin.js
// Renders the add/edit/delete UI for a department's theatres and staff,
// replacing hand-editing Firestore documents. Only ever loaded for
// admins (admin.html checks the role before importing anything here).
// -----------------------------------------------------------------------

import {
  listTheatres, saveTheatre, deleteTheatre,
  listStaff, saveStaff, deleteStaff,
  updateDepartment, listRecentAuditLog
} from "./department.js";
import { listUsers, createUserAccount, updateUserRole, revokeUserAccess } from "./users.js";

const DEFAULT_LIST_OPTIONS = ["ROUTINE", "EMERGENCY", "URGENT"];

function slugId(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
    || ("id-" + Date.now());
}

function suffix(n) {
  if (n % 100 >= 11 && n % 100 <= 13) return n + "th";
  switch (n % 10) { case 1: return n + "st"; case 2: return n + "nd"; case 3: return n + "rd"; default: return n + "th"; }
}
function formatDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return `${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()]} ${suffix(d.getDate())} ${d.toLocaleString("en-GB",{month:"long"})} ${d.getFullYear()}`;
}

function generateTempPassword() {
  const words = ["harbor","cedar","meadow","copper","willow","quartz","ember","falcon","granite","maple"];
  const word = words[Math.floor(Math.random() * words.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${word.charAt(0).toUpperCase()}${word.slice(1)}-${num}`;
}

const EMPTY_ICONS = {
  theatre: `<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 3v18M14 11.5v1"/>`,
  staff: `<circle cx="12" cy="8" r="3.2"/><path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7"/>`,
  tag: `<path d="M4 4h8l8 8-8 8-8-8V4z"/><circle cx="8.5" cy="8.5" r="1.2"/>`,
  calendar: `<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>`,
  key: `<circle cx="8" cy="15" r="4"/><path d="M10.5 12.5L20 3M17 6l3 3M14 9l2.5 2.5"/>`,
  clock: `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>`
};

function emptyState(icon, title, sub) {
  return `<div class="empty-state">
    <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${EMPTY_ICONS[icon]}</svg>
    <div class="es-title">${title}</div>
    <div class="es-sub">${sub}</div>
  </div>`;
}

// Lists longer than this default to collapsed (just a count + "Show"
// link) so the page reads as a set of settings, not a wall of names.
// State persists for the rest of this visit to the page, so toggling
// a list open survives adding/removing an item from it.
const COLLAPSE_THRESHOLD = 6;
const collapseState = {};

function applyListCollapse(key, listEl, toggleBtn, countEl, count, noun) {
  countEl.textContent = `${count} ${noun}${count === 1 ? "" : "s"}`;
  if (count <= COLLAPSE_THRESHOLD) {
    listEl.classList.remove("collapsed");
    toggleBtn.style.display = "none";
    return;
  }
  toggleBtn.style.display = "";
  if (!(key in collapseState)) collapseState[key] = true; // long lists start collapsed
  const collapsed = collapseState[key];
  listEl.classList.toggle("collapsed", collapsed);
  toggleBtn.textContent = collapsed ? "Show" : "Hide";
  toggleBtn.onclick = () => {
    collapseState[key] = !collapseState[key];
    listEl.classList.toggle("collapsed", collapseState[key]);
    toggleBtn.textContent = collapseState[key] ? "Show" : "Hide";
  };
}

export function renderAdmin(container, deptId, dept, myUid) {
  // Local working copies — saved back to the department doc as a whole
  // array/object each time something changes, same pattern as the rest
  // of this screen.
  let listOptions = (dept.listOptions && dept.listOptions.length) ? [...dept.listOptions] : [...DEFAULT_LIST_OPTIONS];
  let bankHolidays = { ...(dept.bankHolidays || {}) };
  // If the department has never had list types set, seed the defaults
  // into Firestore now so the rota page (which reads dept.listOptions
  // directly) shows ROUTINE/EMERGENCY/URGENT from the start.
  if (!dept.listOptions || !dept.listOptions.length) {
    updateDepartment(deptId, { listOptions }).catch(() => {});
  }

  container.innerHTML = `
    <div class="admin-grid">
      <section>
        <h4 class="admin-h">Department details</h4>
        <p class="empty-note" style="margin:-6px 0 10px;">Shown on the printed rota.</p>
        <form id="detailsForm" class="inline-form">
          <input type="text" id="hospitalName" placeholder="Hospital / Trust name" value="${dept.hospitalName || ""}">
          <input type="text" id="deptName" placeholder="Department name" value="${dept.name || ""}">
          <button class="btn btn-primary btn-sm" type="submit">Save details</button>
        </form>
      </section>

      <section>
        <h4 class="admin-h">Theatres</h4>
        <form id="theatreForm" class="inline-form">
          <input type="text" id="theatreName" placeholder="Theatre name, e.g. Theatre 3" required>
          <button class="btn btn-primary btn-sm" type="submit">Add theatre</button>
        </form>
        <div class="section-list-head">
          <span class="count" id="theatreCount"></span>
          <input type="text" class="list-filter" id="theatreFilter" placeholder="Filter…">
          <button class="list-toggle-btn" id="theatreToggleBtn" style="display:none;">Show</button>
        </div>
        <div id="theatreList" class="admin-list"></div>
      </section>

      <section>
        <h4 class="admin-h">Staff</h4>
        <form id="staffForm" class="inline-form">
          <input type="text" id="staffName" placeholder="Full name" required>
          <select id="staffType">
            <option value="odp">ODP</option>
            <option value="anaesthetist">Anaesthetist</option>
          </select>
          <button class="btn btn-primary btn-sm" type="submit">Add staff</button>
        </form>
        <div class="section-list-head">
          <span class="count" id="staffCount"></span>
          <input type="text" class="list-filter" id="staffFilter" placeholder="Filter…">
          <button class="list-toggle-btn" id="staffToggleBtn" style="display:none;">Show</button>
        </div>
        <div id="staffList" class="admin-list"></div>
      </section>

      <section>
        <h4 class="admin-h">List types</h4>
        <p class="empty-note" style="margin:-6px 0 10px;">Shown as options in each theatre and support box on the rota — e.g. ROUTINE, EMERGENCY, URGENT, or your own.</p>
        <form id="listForm" class="inline-form">
          <input type="text" id="listValue" placeholder="e.g. NO LIST, THORACIC" required>
          <button class="btn btn-primary btn-sm" type="submit">Add value</button>
        </form>
        <div id="listOptionsList" class="admin-list"></div>
      </section>

      <section>
        <h4 class="admin-h">Bank holidays</h4>
        <p class="empty-note" style="margin:-6px 0 10px;">Marked on the rota for the week they fall in.</p>
        <form id="bhForm" class="inline-form">
          <input type="date" id="bhDate" required>
          <button class="btn btn-primary btn-sm" type="submit">Add date</button>
        </form>
        <div class="section-list-head">
          <span class="count" id="bhCount"></span>
          <button class="list-toggle-btn" id="bhToggleBtn" style="display:none;">Show</button>
        </div>
        <div id="bhList" class="admin-list"></div>
      </section>

      <section>
        <h4 class="admin-h">User accounts</h4>
        <p class="empty-note" style="margin:-6px 0 10px;">Logins for this app — separate from the Staff list above,
          which is just names shown on the rota. Give the new person their email and temporary password directly.</p>
        <form id="userForm" class="inline-form">
          <input type="text" id="userName" placeholder="Full name" required>
          <input type="email" id="userEmail" placeholder="Email address" required>
          <input type="text" id="userPassword" placeholder="Temporary password" required>
          <button class="btn btn-ghost btn-sm" type="button" id="genPasswordBtn">Generate</button>
          <select id="userRole">
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
            <option value="admin">Admin</option>
          </select>
          <button class="btn btn-primary btn-sm" type="submit">Create account</button>
        </form>
        <div id="userFormError" class="empty-note" style="display:none;color:var(--status-oncall);"></div>
        <div class="section-list-head">
          <span class="count" id="userCount"></span>
          <input type="text" class="list-filter" id="userFilter" placeholder="Filter…">
          <button class="list-toggle-btn" id="userToggleBtn" style="display:none;">Show</button>
        </div>
        <div id="userList" class="admin-list"></div>
      </section>

      <section>
        <h4 class="admin-h">Change log</h4>
        <p class="empty-note" style="margin:-6px 0 10px;">The most recent rota changes, for auditing — who changed what, and when.</p>
        <div id="auditLogList" class="admin-list"></div>
      </section>
    </div>
  `;

  const theatreListEl = container.querySelector("#theatreList");
  const staffListEl = container.querySelector("#staffList");
  const theatreCountEl = container.querySelector("#theatreCount");
  const theatreToggleBtn = container.querySelector("#theatreToggleBtn");
  const theatreFilterEl = container.querySelector("#theatreFilter");
  const staffCountEl = container.querySelector("#staffCount");
  const staffToggleBtn = container.querySelector("#staffToggleBtn");
  const staffFilterEl = container.querySelector("#staffFilter");

  // Filters an already-rendered list by plain text match. Called once on
  // every keystroke, and again after any refresh*() rebuild so a typed
  // query survives adding/removing an item. Typing anything also forces
  // the list open, since a collapsed-but-matching result would be
  // confusing.
  function applyFilter(inputEl, listEl) {
    const q = inputEl.value.trim().toLowerCase();
    [...listEl.children].forEach(row => {
      if (!row.classList || !row.classList.contains("admin-row")) return;
      row.classList.toggle("filtered-out", !(!q || row.textContent.toLowerCase().includes(q)));
    });
    if (q) listEl.classList.remove("collapsed");
  }
  theatreFilterEl.addEventListener("input", () => applyFilter(theatreFilterEl, theatreListEl));
  staffFilterEl.addEventListener("input", () => applyFilter(staffFilterEl, staffListEl));

  async function refreshTheatres() {
    const theatres = await listTheatres(deptId);
    theatreListEl.innerHTML = theatres.length ? "" :
      emptyState("theatre", "No theatres yet", "Add your first theatre above to start building the rota.");
    theatres.forEach(t => {
      const row = document.createElement("div");
      row.className = "admin-row";
      row.innerHTML = `<span>${t.name}</span><button class="btn btn-ghost btn-sm" data-id="${t.id}">Remove</button>`;
      row.querySelector("button").addEventListener("click", async () => {
        if (!confirm(`Remove ${t.name}? This won't delete past rota data.`)) return;
        await deleteTheatre(deptId, t.id);
        refreshTheatres();
      });
      theatreListEl.appendChild(row);
    });
    applyListCollapse("theatres", theatreListEl, theatreToggleBtn, theatreCountEl, theatres.length, "theatre");
    applyFilter(theatreFilterEl, theatreListEl);
  }

  async function refreshStaff() {
    const staff = await listStaff(deptId);
    staffListEl.innerHTML = staff.length ? "" :
      emptyState("staff", "No staff yet", "Add ODPs and anaesthetists above — they'll appear as options throughout the rota.");
    staff.sort((a, b) => a.name.localeCompare(b.name)).forEach(s => {
      const row = document.createElement("div");
      row.className = "admin-row";
      row.innerHTML = `<span>${s.name} <span class="tag-mini">${s.type === "odp" ? "ODP" : "Anaesthetist"}</span></span>
        <button class="btn btn-ghost btn-sm" data-id="${s.id}">Remove</button>`;
      row.querySelector("button").addEventListener("click", async () => {
        if (!confirm(`Remove ${s.name}?`)) return;
        await deleteStaff(deptId, s.id);
        refreshStaff();
      });
      staffListEl.appendChild(row);
    });
    applyListCollapse("staff", staffListEl, staffToggleBtn, staffCountEl, staff.length, "staff member");
    applyFilter(staffFilterEl, staffListEl);
  }

  container.querySelector("#theatreForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = container.querySelector("#theatreName");
    const name = input.value.trim();
    if (!name) return;
    const existing = await listTheatres(deptId);
    await saveTheatre(deptId, slugId(name), { name, order: existing.length });
    input.value = "";
    refreshTheatres();
  });

  container.querySelector("#staffForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nameInput = container.querySelector("#staffName");
    const typeSelect = container.querySelector("#staffType");
    const name = nameInput.value.trim();
    if (!name) return;
    await saveStaff(deptId, slugId(name), { name, type: typeSelect.value });
    nameInput.value = "";
    refreshStaff();
  });

  // ---- List types -----------------------------------------------------
  const listOptionsEl = container.querySelector("#listOptionsList");
  function refreshListOptions() {
    listOptionsEl.innerHTML = listOptions.length ? "" :
      emptyState("tag", "No list types yet", "Add ROUTINE, EMERGENCY, or your own values above.");
    listOptions.forEach(val => {
      const row = document.createElement("div");
      row.className = "admin-row";
      row.innerHTML = `<span>${val}</span><button class="btn btn-ghost btn-sm">Remove</button>`;
      row.querySelector("button").addEventListener("click", async () => {
        listOptions = listOptions.filter(v => v !== val);
        await updateDepartment(deptId, { listOptions });
        refreshListOptions();
      });
      listOptionsEl.appendChild(row);
    });
  }

  container.querySelector("#listForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = container.querySelector("#listValue");
    const val = input.value.trim().toUpperCase();
    if (!val || listOptions.includes(val)) return;
    listOptions = [...listOptions, val];
    await updateDepartment(deptId, { listOptions });
    input.value = "";
    refreshListOptions();
  });

  // ---- Bank holidays ----------------------------------------------------
  const bhListEl = container.querySelector("#bhList");
  const bhCountEl = container.querySelector("#bhCount");
  const bhToggleBtn = container.querySelector("#bhToggleBtn");
  function refreshBankHolidays() {
    const dates = Object.keys(bankHolidays).sort();
    bhListEl.innerHTML = dates.length ? "" :
      emptyState("calendar", "No bank holidays added yet", "Add a date above and it'll show automatically on the rota and calendar.");
    dates.forEach(iso => {
      const row = document.createElement("div");
      row.className = "admin-row";
      row.innerHTML = `<span>${formatDate(iso)}</span><button class="btn btn-ghost btn-sm">Remove</button>`;
      row.querySelector("button").addEventListener("click", async () => {
        delete bankHolidays[iso];
        await updateDepartment(deptId, { bankHolidays });
        refreshBankHolidays();
      });
      bhListEl.appendChild(row);
    });
    applyListCollapse("bankHolidays", bhListEl, bhToggleBtn, bhCountEl, dates.length, "bank holiday");
  }

  container.querySelector("#bhForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = container.querySelector("#bhDate");
    if (!input.value) return;
    bankHolidays[input.value] = true;
    await updateDepartment(deptId, { bankHolidays });
    input.value = "";
    refreshBankHolidays();
  });

  container.querySelector("#detailsForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const hospitalName = container.querySelector("#hospitalName").value.trim();
    const deptName = container.querySelector("#deptName").value.trim();
    await updateDepartment(deptId, { hospitalName, name: deptName });
    dept.hospitalName = hospitalName;
    dept.name = deptName;
  });

  // ---- User accounts -----------------------------------------------------
  const userListEl = container.querySelector("#userList");
  const userFormError = container.querySelector("#userFormError");
  const userCountEl = container.querySelector("#userCount");
  const userToggleBtn = container.querySelector("#userToggleBtn");
  const userFilterEl = container.querySelector("#userFilter");
  userFilterEl.addEventListener("input", () => applyFilter(userFilterEl, userListEl));
  const ROLE_LABELS = { viewer: "Viewer", editor: "Editor", admin: "Admin" };

  async function refreshUsers() {
    const users = (await listUsers(deptId)).sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));
    userListEl.innerHTML = users.length ? "" :
      emptyState("key", "No accounts yet", "Create the first login above.");
    users.forEach(u => {
      const isMe = u.uid === myUid;
      const row = document.createElement("div");
      row.className = "admin-row";
      row.innerHTML = `
        <span>${u.displayName || u.email || "(unnamed)"}${isMe ? ` <span class="tag-mini">you</span>` : ""}
          ${u.email ? `<span class="tag-mini">${u.email}</span>` : ""}
        </span>
        <span style="display:flex;align-items:center;gap:8px;">
          <select data-role-for="${u.uid}" ${isMe ? "disabled title=\"You can't change your own role here\"" : ""}>
            ${Object.entries(ROLE_LABELS).map(([val, label]) =>
              `<option value="${val}" ${u.role === val ? "selected" : ""}>${label}</option>`).join("")}
          </select>
          <button class="btn btn-ghost btn-sm" data-revoke-for="${u.uid}" ${isMe ? "disabled title=\"You can't revoke your own access\"" : ""}>Revoke access</button>
        </span>`;
      row.querySelector("select").addEventListener("change", async (e) => {
        await updateUserRole(u.uid, e.target.value);
      });
      const revokeBtn = row.querySelector("button[data-revoke-for]");
      revokeBtn.addEventListener("click", async () => {
        if (!confirm(`Revoke ${u.displayName || u.email}'s access to this department? Their login will no longer work here.`)) return;
        await revokeUserAccess(u.uid);
        refreshUsers();
      });
      userListEl.appendChild(row);
    });
    applyListCollapse("users", userListEl, userToggleBtn, userCountEl, users.length, "account");
    applyFilter(userFilterEl, userListEl);
  }

  container.querySelector("#genPasswordBtn").addEventListener("click", () => {
    container.querySelector("#userPassword").value = generateTempPassword();
  });

  container.querySelector("#userForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    userFormError.style.display = "none";
    const displayName = container.querySelector("#userName").value.trim();
    const email = container.querySelector("#userEmail").value.trim();
    const password = container.querySelector("#userPassword").value;
    const role = container.querySelector("#userRole").value;
    if (!displayName || !email || !password) return;

    const submitBtn = e.target.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    try {
      await createUserAccount({ email, password, displayName, role, departmentId: deptId });
      e.target.reset();
      container.querySelector("#userRole").value = "viewer";
      refreshUsers();
    } catch (err) {
      const messages = {
        "auth/email-already-in-use": "That email already has an account.",
        "auth/invalid-email": "That doesn't look like a valid email address.",
        "auth/weak-password": "Password needs to be at least 6 characters."
      };
      userFormError.textContent = messages[err.code] || "Couldn't create the account — please try again.";
      userFormError.style.display = "block";
    } finally {
      submitBtn.disabled = false;
    }
  });

  // ---- Change log -----------------------------------------------------
  const auditLogEl = container.querySelector("#auditLogList");

  function formatTimestamp(ts) {
    if (!ts?.toDate) return "";
    return ts.toDate().toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  async function refreshAuditLog() {
    const entries = await listRecentAuditLog(deptId, 20);
    auditLogEl.innerHTML = entries.length ? "" :
      emptyState("clock", "No changes recorded yet", "Every rota save and publish will show up here.");
    entries.forEach(e => {
      const row = document.createElement("div");
      row.className = "audit-entry";
      const changesPreview = (e.changes || []).slice(0, 3)
        .map(c => `<div>${c.field}: ${c.from || "(empty)"} → ${c.to || "(empty)"}</div>`).join("");
      const moreCount = (e.changeCount || 0) - Math.min(3, (e.changes || []).length);
      row.innerHTML = `
        <span class="audit-time">${formatTimestamp(e.timestamp)}</span>
        <div class="audit-headline"><strong>${e.displayName || "Someone"}</strong> ${e.action || "updated"} week commencing ${e.weekStart} — ${e.changeCount || 0} change${e.changeCount === 1 ? "" : "s"}</div>
        <div class="audit-changes">${changesPreview}${moreCount > 0 ? `<div>+${moreCount} more</div>` : ""}</div>
      `;
      auditLogEl.appendChild(row);
    });
  }

  refreshTheatres();
  refreshStaff();
  refreshListOptions();
  refreshBankHolidays();
  refreshUsers();
  refreshAuditLog();
}
