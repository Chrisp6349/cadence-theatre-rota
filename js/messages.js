// -----------------------------------------------------------------------
// messages.js
// The Team Board: a shared, informal message board on the Dashboard that
// anyone in the department can post to.
//
// "Disappears at the end of the day but goes into an archive" needs no
// scheduled job at all — every message is tagged with the local date it
// was posted on (dateKey, e.g. "2026-07-23"). "Today's board" is just a
// live query for dateKey == today; the moment it becomes tomorrow, that
// same message stops matching and it's already sitting in the archive
// with everything else. Nothing to move, nothing to clean up.
// -----------------------------------------------------------------------

import { db, collection, addDoc, deleteDoc, doc, getDocs, query, where, orderBy, limit, onSnapshot, serverTimestamp } from "./firebase-init.js";

export function postMessage(deptId, uid, displayName, text, dateKey) {
  return addDoc(collection(db, "departments", deptId, "messages"), {
    text, uid, displayName, dateKey,
    createdAt: serverTimestamp(),
    // A brand-new message has createdAt === null locally until the
    // server round-trip resolves it a moment later — and Firestore
    // silently excludes a document from live query results while the
    // field you're ordering by is null. That's exactly what "have to
    // refresh before my own message shows up" looks like. clientTime is
    // a plain number, available the instant the write happens, so it's
    // what watchTodayMessages actually orders by below.
    clientTime: Date.now()
  });
}

export function deleteMessage(deptId, messageId) {
  return deleteDoc(doc(db, "departments", deptId, "messages", messageId));
}

// Live subscription to today's messages — callback fires immediately with
// the current state, then again whenever anyone posts or deletes, so the
// board updates for everyone without a refresh. Returns an unsubscribe
// function (not that this app currently bothers calling it, since every
// navigation is a full page load that tears the listener down anyway).
export function watchTodayMessages(deptId, dateKey, callback) {
  const q = query(
    collection(db, "departments", deptId, "messages"),
    where("dateKey", "==", dateKey),
    orderBy("clientTime", "asc")
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

// One-off load of everything before today, most recent day first. Only
// orders by dateKey (matching the inequality filter) rather than adding a
// second orderBy on createdAt — that combination would need a manual
// Firestore composite index; sorting each day's messages by time is done
// client-side instead, in buildArchiveGroups below.
export async function loadArchive(deptId, todayDateKey, cap = 300) {
  const q = query(
    collection(db, "departments", deptId, "messages"),
    where("dateKey", "<", todayDateKey),
    orderBy("dateKey", "desc"),
    limit(cap)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Groups a flat message list by dateKey (most recent day first, messages
// within a day oldest-first) — the shape the archive view actually wants.
export function buildArchiveGroups(messages) {
  const byDate = {};
  messages.forEach(m => {
    if (!byDate[m.dateKey]) byDate[m.dateKey] = [];
    byDate[m.dateKey].push(m);
  });
  return Object.keys(byDate).sort().reverse().map(dateKey => ({
    dateKey,
    messages: byDate[dateKey].sort((a, b) => (a.clientTime || 0) - (b.clientTime || 0))
  }));
}
