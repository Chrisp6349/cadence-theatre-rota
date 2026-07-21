// -----------------------------------------------------------------------
// insights.js
// "Theatre Intelligence" — a handful of fun, true facts pulled from the
// department's own published rota history (session counts, busiest
// theatre/day, on-call and support tallies, ODP–anaesthetist pairings).
//
// Rules that matter for accuracy:
// - Only PUBLISHED weeks count — drafts are excluded entirely.
// - Weeks after the currently-selected week are excluded (no counting
//   the future even if something got published early).
// - Within the current week itself, only days up to and including today
//   count — a Friday on-call allocation isn't "worked" yet on Tuesday.
// -----------------------------------------------------------------------

import { db, collection, getDocs, query, where } from "./firebase-init.js";

const ALL_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function localIso(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function isoPlusDays(mondayIso, i) {
  const d = new Date(mondayIso + "T00:00:00");
  d.setDate(d.getDate() + i);
  return localIso(d);
}

async function listPublishedWeeks(deptId) {
  const q = query(collection(db, "departments", deptId, "weeks"), where("published", "==", true));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ weekStart: d.id, data: d.data().data || {} }));
}

// Same key-shape knowledge as rota.js/dashboard.html — turns a
// "<theatreId>_odp1" / "_anaes" / "support1" / "oncall_odp" etc. suffix
// into a structured type instead of a display label.
function classify(suffix, theatres) {
  if (/_odp[12]$/.test(suffix)) {
    const theatreId = suffix.replace(/_odp[12]$/, "");
    const t = theatres.find(x => x.id === theatreId);
    if (t) return { kind: "theatre_odp", theatreId, theatreName: t.name };
    return null;
  }
  if (suffix.endsWith("_anaes")) {
    const theatreId = suffix.replace(/_anaes$/, "");
    if (theatreId === "oncall" || theatreId === "wl") return null; // on-call/waiting-list anaesthetist — not counted here
    const t = theatres.find(x => x.id === theatreId);
    if (t) return { kind: "theatre_anaes", theatreId, theatreName: t.name };
    return null;
  }
  if (/^support[123]$/.test(suffix)) return { kind: "support" };
  if (suffix === "oncall_odp" || suffix === "oncall_odp1" || suffix === "oncall_odp2") return { kind: "oncall_odp" };
  return null;
}

// Flattens every eligible week's rota object into (weekStart, day, suffix,
// value) tuples, applying the future-exclusion rules described above.
function collectEntries(weeksData, currentWeekStart, todayIso) {
  const entries = [];
  weeksData.forEach(({ weekStart, data }) => {
    if (weekStart > currentWeekStart) return;
    ALL_DAYS.forEach((day, i) => {
      if (weekStart === currentWeekStart && isoPlusDays(weekStart, i) > todayIso) return;
      Object.entries(data).forEach(([k, v]) => {
        if (!v || !k.startsWith(day + "_")) return;
        entries.push({ weekStart, day, suffix: k.slice(day.length + 1), value: v });
      });
    });
  });
  return entries;
}

function buildStats(entries, theatres) {
  // Group theatre_odp/theatre_anaes entries by (week, day, theatre) so we
  // can tell "a session happened here" apart from "two separate fields
  // happened to both be filled in", and so pairings are only counted
  // within the same session.
  const groups = {};
  const onCallCounts = {};
  const supportCounts = {};

  entries.forEach(({ weekStart, day, suffix, value }) => {
    const c = classify(suffix, theatres);
    if (!c) return;
    if (c.kind === "theatre_odp" || c.kind === "theatre_anaes") {
      const gk = `${weekStart}|${day}|${c.theatreId}`;
      if (!groups[gk]) groups[gk] = { day, theatreName: c.theatreName, odps: [], anaes: null };
      if (c.kind === "theatre_odp") groups[gk].odps.push(value);
      else groups[gk].anaes = value;
    } else if (c.kind === "oncall_odp") {
      onCallCounts[value] = (onCallCounts[value] || 0) + 1;
    } else if (c.kind === "support") {
      supportCounts[value] = (supportCounts[value] || 0) + 1;
    }
  });

  const theatreCounts = {};
  const dayCounts = {};
  const pairingCounts = {};
  let totalSessions = 0;

  Object.values(groups).forEach(g => {
    totalSessions++;
    theatreCounts[g.theatreName] = (theatreCounts[g.theatreName] || 0) + 1;
    dayCounts[g.day] = (dayCounts[g.day] || 0) + 1;
    if (g.anaes) {
      g.odps.forEach(odp => {
        const key = `${odp}|||${g.anaes}`;
        pairingCounts[key] = (pairingCounts[key] || 0) + 1;
      });
    }
  });

  return { totalSessions, theatreCounts, dayCounts, onCallCounts, supportCounts, pairingCounts };
}

function topPick(map, minCount = 2) {
  const arr = Object.entries(map).sort((a, b) => b[1] - a[1]);
  if (!arr.length || arr[0][1] < minCount) return null;
  return { name: arr[0][0], count: arr[0][1] };
}

function buildFactPool(stats, weeksUsed) {
  const facts = [];

  if (stats.totalSessions > 0) {
    facts.push(`${stats.totalSessions} theatre session${stats.totalSessions === 1 ? "" : "s"} recorded across ${weeksUsed} published week${weeksUsed === 1 ? "" : "s"}.`);
  }
  const busiestTheatre = topPick(stats.theatreCounts);
  if (busiestTheatre) facts.push(`${busiestTheatre.name} has been the busiest theatre, with ${busiestTheatre.count} sessions.`);

  const busiestDay = topPick(stats.dayCounts);
  if (busiestDay) facts.push(`${busiestDay.name}s have been the busiest day of the week.`);

  const topOnCall = topPick(stats.onCallCounts);
  if (topOnCall) facts.push(`${topOnCall.name} has covered on-call more than anyone else — ${topOnCall.count} times.`);

  const topSupport = topPick(stats.supportCounts);
  if (topSupport) facts.push(`${topSupport.name} has covered Support duty ${topSupport.count} times, more than anyone else.`);

  const topPairing = topPick(stats.pairingCounts);
  if (topPairing) {
    const [odp, anaes] = topPairing.name.split("|||");
    facts.push(`${odp} and ${anaes} have worked together ${topPairing.count} times.`);
  }

  return facts;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Fetches history once and returns both a ready-made set of facts and a
// `pickAgain()` function that re-shuffles the SAME data for a "Shuffle"
// button — no need to hit Firestore again just to see different facts.
export async function loadTheatreIntelligence(deptId, theatres, currentWeekStart, todayIso) {
  const weeksData = await listPublishedWeeks(deptId);
  const eligibleWeeks = weeksData.filter(w => w.weekStart <= currentWeekStart);
  const entries = collectEntries(eligibleWeeks, currentWeekStart, todayIso);
  const stats = buildStats(entries, theatres);
  const pool = buildFactPool(stats, eligibleWeeks.length);

  return {
    hasData: pool.length > 0,
    pickFacts(count = 4) {
      return shuffle(pool).slice(0, count);
    }
  };
}
