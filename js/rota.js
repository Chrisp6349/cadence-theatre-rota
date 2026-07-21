// -----------------------------------------------------------------------
// rota.js
// The merged core: one grid, driven by the department's own theatre
// list, that renders editable (dropdowns) for editors/admins and
// read-only (plain text) for viewers. This replaces the separate
// Rota Manager (edit) and Rota Viewer (read-only) apps.
//
// Allocation keys keep the old flat-key shape so the data model stays
// familiar: "<Day>_<theatreId>_odp1", "<Day>_support1", "<Day>_oncall_odp"
// etc. — but theatreId now comes from the department's own configurable
// theatre list instead of being hardcoded (t1/t2/t4/t5/cath).
// -----------------------------------------------------------------------

import { db, doc, getDoc, setDoc } from "./firebase-init.js";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const WEEKENDS = ["Saturday", "Sunday"];

export function mondayOfCurrentWeek() {
  let d = new Date();
  let day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d.toISOString().split("T")[0];
}

function suffix(n) {
  if (n % 100 >= 11 && n % 100 <= 13) return n + "th";
  switch (n % 10) { case 1: return n + "st"; case 2: return n + "nd"; case 3: return n + "rd"; default: return n + "th"; }
}

function isoPlusDays(mondayIso, i) {
  let d = new Date(mondayIso);
  d.setDate(d.getDate() + i);
  return d.toISOString().split("T")[0];
}

// ---- Firestore read/write ------------------------------------------------
export async function loadWeek(deptId, weekStart) {
  const snap = await getDoc(doc(db, "departments", deptId, "weeks", weekStart));
  return snap.exists() ? snap.data() : { data: {}, published: false };
}

export async function saveWeek(deptId, weekStart, data, publish, uid) {
  await setDoc(doc(db, "departments", deptId, "weeks", weekStart), {
    data,
    published: !!publish,
    updatedAt: new Date().toISOString(),
    updatedBy: uid
  }, { merge: true });
}

// ---- Grid rendering --------------------------------------------------------
// `dept`   = department doc (listOptions, extraOnCall, bankHolidays)
// `theatres` = [{id, name}, ...] in display order
// `staff`  = { odps: [...], anaesthetists: [...] }
// `rota`   = the flat key/value object for the week
// `editable` = true for editor/admin, false for viewer
export function renderGrid({ weekStart, dept, theatres, staff, rota, editable, onChange }) {
  function used(day) {
    let o = [], a = [];
    Object.entries(rota).forEach(([k, v]) => {
      if (!k.startsWith(day + "_") || !v || k.includes("oncall") || k.includes("_list")) return;
      k.includes("_anaes") ? a.push(v) : o.push(v);
    });
    return { o, a };
  }

  function field(day, key, list, type, restricted = true) {
    const fkey = `${day}_${key}`;
    const current = rota[fkey] || "";
    if (!editable) {
      return `<span class="ro-field">${current || "—"}</span>`;
    }
    const u = used(day);
    let h = `<select data-key="${fkey}"><option value=""></option>`;
    [...list].sort().forEach(n => {
      let hide = false;
      if (restricted) {
        if (type === "odp") hide = u.o.includes(n) && n !== current;
        if (type === "anaes") hide = u.a.includes(n) && n !== current;
      }
      if (!hide) h += `<option ${current === n ? "selected" : ""}>${n}</option>`;
    });
    h += "</select>";
    return h;
  }

  function dayLabel(i) {
    const ds = isoPlusDays(weekStart, i);
    const d = new Date(ds);
    let txt = `${["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"][i]} ${suffix(d.getDate())}`;
    if (dept.bankHolidays && dept.bankHolidays[ds]) txt += `<br><span class="bh">BANK HOLIDAY</span>`;
    return txt;
  }

  function isToday(i) {
    return isoPlusDays(weekStart, i) === new Date().toISOString().split("T")[0];
  }

  function theatreCell(day, theatreId) {
    return field(day, `${theatreId}_odp1`, staff.odps, "odp")
      + field(day, `${theatreId}_odp2`, staff.odps, "odp")
      + field(day, `${theatreId}_anaes`, staff.anaesthetists, "anaes")
      + field(day, `${theatreId}_list`, dept.listOptions || [], "list", false);
  }

  const theatreCols = theatres.map(t => `<th class="theatre-col">${t.name}</th>`).join("");

  let h = `<table class="rota-table"><tr><th>Day</th>${theatreCols}<th class="support-col">Support</th><th class="oncall-col">On Call</th></tr>`;
  WEEKDAYS.forEach((d, i) => {
    const cells = theatres.map(t => `<td>${theatreCell(d, t.id)}</td>`).join("");
    h += `<tr${isToday(i) ? " class='today'" : ""}><td class="daycell">${dayLabel(i)}</td>${cells}<td>
        ${field(d, "support1", staff.odps, "odp")}
        ${field(d, "support2", staff.odps, "odp")}
        ${field(d, "support3", staff.odps, "odp")}
        <br>${field(d, "support_list", dept.listOptions || [], "list", false)}
      </td><td>
        ${field(d, "oncall_odp", staff.odps, "odp", false)}
        ${field(d, "oncall_extra", dept.extraOnCall || ["", "EXTRA O/C"], "list", false)}
        ${field(d, "oncall_anaes", staff.anaesthetists, "anaes", false)}
      </td></tr>`;
  });
  h += "</table>";

  let w = `<table class="rota-table weekend-table"><tr><th>Day</th><th>On Call ODP</th><th>On Call Anaesthetist</th><th>Waiting List</th></tr>`;
  WEEKENDS.forEach((d, i) => {
    w += `<tr${isToday(i + 5) ? " class='today'" : ""}><td class="daycell">${dayLabel(i + 5)}</td>
      <td>${field(d, "oncall_odp1", staff.odps, "odp", false)}${field(d, "oncall_session1", ["ALL DAY","AM","PM"], "list", false)}<br>
          ${field(d, "oncall_odp2", staff.odps, "odp", false)}${field(d, "oncall_session2", ["ALL DAY","AM","PM"], "list", false)}</td>
      <td>${field(d, "oncall_anaes", staff.anaesthetists, "anaes", false)}</td>
      <td>${field(d, "wl_odp", staff.odps, "odp", false)}${field(d, "wl_anaes", staff.anaesthetists, "anaes", false)}</td>
    </tr>`;
  });
  w += "</table>";

  return { weekdayHtml: h, weekendHtml: w };
}

export function attachChangeHandlers(container, rota, onChange) {
  if (!container) return;
  container.querySelectorAll("select[data-key]").forEach(sel => {
    sel.addEventListener("change", () => {
      rota[sel.dataset.key] = sel.value;
      onChange && onChange();
    });
  });
}

export { WEEKDAYS, WEEKENDS };
