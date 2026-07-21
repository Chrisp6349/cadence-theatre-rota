// -----------------------------------------------------------------------
// admin.js
// Renders the add/edit/delete UI for a department's theatres and staff,
// replacing hand-editing Firestore documents. Only ever loaded for
// admins (admin.html checks the role before importing anything here).
// -----------------------------------------------------------------------

import {
  listTheatres, saveTheatre, deleteTheatre,
  listStaff, saveStaff, deleteStaff
} from "./department.js";

function slugId(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
    || ("id-" + Date.now());
}

export function renderAdmin(container, deptId) {
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

  refreshTheatres();
  refreshStaff();
}
