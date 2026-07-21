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

export function renderAdmin(container, deptId, dept) {
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
        <h4 class="admin-h">Theatres</h4>
        <form id="theatreForm" class="inline-form">
          <input type="text" id="theatreName" placeholder="Theatre name, e.g. Theatre 3" required>
          <button class="btn btn-primary btn-sm" type="submit">Add theatre</button>
        </form>
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
        <div id="bhList" class="admin-list"></div>
      </section>
    </div>
  `;

  const theatreListEl = container.querySelector("#theatreList");
  const staffListEl = container.querySelector("#staffList");

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

  refreshTheatres();
  refreshStaff();
  refreshListOptions();
  refreshBankHolidays();
}
