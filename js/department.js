// -----------------------------------------------------------------------
// department.js
// Reads and writes a department's configuration: theatres, staff,
// list-type options, and bank holidays. This is what replaces hand-
// editing config.js for each department — it's all in Firestore now,
// editable from the Administration screen.
// -----------------------------------------------------------------------

import { db, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, orderBy, limit } from "./firebase-init.js";

export async function getDepartment(deptId) {
  const snap = await getDoc(doc(db, "departments", deptId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function updateDepartment(deptId, fields) {
  await updateDoc(doc(db, "departments", deptId), fields);
}

// ---- Theatres -----------------------------------------------------------
export async function listTheatres(deptId) {
  const q = query(collection(db, "departments", deptId, "theatres"), orderBy("order"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function saveTheatre(deptId, theatreId, data) {
  await setDoc(doc(db, "departments", deptId, "theatres", theatreId), data, { merge: true });
}

export async function deleteTheatre(deptId, theatreId) {
  await deleteDoc(doc(db, "departments", deptId, "theatres", theatreId));
}

// ---- Staff (ODPs + anaesthetists) ---------------------------------------
export async function listStaff(deptId) {
  const snap = await getDocs(collection(db, "departments", deptId, "staff"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function saveStaff(deptId, staffId, data) {
  await setDoc(doc(db, "departments", deptId, "staff", staffId), data, { merge: true });
}

export async function deleteStaff(deptId, staffId) {
  await deleteDoc(doc(db, "departments", deptId, "staff", staffId));
}

// Convenience splits used by the rota grid
export function splitStaff(staffList) {
  return {
    odps: staffList.filter(s => s.type === "odp").map(s => s.name),
    anaesthetists: staffList.filter(s => s.type === "anaesthetist").map(s => s.name)
  };
}

// ---- Audit log ------------------------------------------------------------
export async function listRecentAuditLog(deptId, count = 20) {
  const q = query(collection(db, "departments", deptId, "auditLog"), orderBy("timestamp", "desc"), limit(count));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
