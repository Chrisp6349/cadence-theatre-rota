// -----------------------------------------------------------------------
// admin.js
// Renders the add/edit/delete UI for a department's theatres and staff,
// replacing hand-editing Firestore documents. Only ever loaded for
// admins (admin.html checks the role before importing anything here).
// -----------------------------------------------------------------------

import {
  listTheatres, saveTheatre, deleteTheatre,
  listStaff, saveStaff, deleteStaff,
  updateDepartment
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
          <button class="list-toggle-btn" id="userToggleBtn" style="display:none;">Show</button>
        </div>
        <div id="userList" class="admin-list"></div>
      </section>
    </div>
  `;

  const theatreListEl = container.querySelector("#theatreList");
  const staffListEl = container.querySelector("#staffList");
  const theatreCountEl = container.querySelector("#theatreCount");
  const theatreToggleBtn = container.querySelector("#theatreToggleBtn");
  const staffCountEl = container.querySelector("#staffCount");
  const staffToggleBtn = container.querySelector("#staffToggleBtn");

  async function refreshTheatres() {
    const theatres = await listTheatres(deptId);
    theatreListEl.innerHTML = theatres.length ? "" : `<p class="empty-note">No theatres yet.</p>`;
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
  }

  async function refreshStaff() {
    const staff = await listStaff(deptId);
    staffListEl.innerHTML = staff.length ? "" : `<p class="empty-note">No staff yet.</p>`;
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
    listOptionsEl.innerHTML = listOptions.length ? "" : `<p class="empty-note">No list types yet.</p>`;
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
    bhListEl.innerHTML = dates.length ? "" : `<p class="empty-note">No bank holidays added yet.</p>`;
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
  const ROLE_LABELS = { viewer: "Viewer", editor: "Editor", admin: "Admin" };

  async function refreshUsers() {
    const users = (await listUsers(deptId)).sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));
    userListEl.innerHTML = users.length ? "" : `<p class="empty-note">No accounts yet.</p>`;
    users.forEach(u => {
      const isMe = u.uid === myUid;
      const row = document.createElement("div");
      row.className = "admin-row";
      row.innerHTML = `
        <span>${u.displayName || u.email}${isMe ? ` <span class="tag-mini">you</span>` : ""}
          <span class="tag-mini">${u.email}</span>
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

  refreshTheatres();
  refreshStaff();
  refreshListOptions();
  refreshBankHolidays();
  refreshUsers();
}
