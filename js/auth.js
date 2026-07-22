// -----------------------------------------------------------------------
// auth.js
// Handles login/logout and loads the signed-in user's profile
// (departmentId + role) from Firestore. Every protected page calls
// requireSession() on load to get the current user + profile, or gets
// redirected back to the login screen if there isn't one.
// -----------------------------------------------------------------------

import {
  auth, db, onAuthStateChanged, signInWithEmailAndPassword, signOut, doc, getDoc,
  updatePassword, reauthenticateWithCredential, EmailAuthProvider, sendPasswordResetEmail
} from "./firebase-init.js";

// Resolves once with { user, profile } or redirects to index.html (login)
// if nobody is signed in. profile = { departmentId, role, displayName }.
//
// Has a timeout: if the Firestore read never comes back — which is what
// a stuck/corrupted local cache on a particular device looks like, not
// just a slow network — this shows a real error with a one-tap recovery
// option instead of leaving the page blank forever.
export function requireSession() {
  return new Promise((resolve) => {
    let settled = false;

    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      showLoadTimeoutError();
    }, 10000);

    onAuthStateChanged(auth, async (user) => {
      if (settled) return;
      if (!user) {
        settled = true;
        clearTimeout(timeoutId);
        window.location.href = "index.html";
        return;
      }
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        if (!snap.exists()) {
          alert("Your account isn't set up in this department yet. Ask your admin to add you.");
          await signOut(auth);
          window.location.href = "index.html";
          return;
        }
        resolve({ user, profile: snap.data() });
      } catch (err) {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        showLoadTimeoutError();
      }
    });
  });
}

// Deletes every local trace of the app on this device — service worker,
// caches, IndexedDB (Firestore's offline cache lives here), and
// localStorage (theme/text-size/My Week preferences) — then reloads.
// This is the actual fix for "stuck on a hung local cache", one tap
// instead of five taps through Settings.
async function hardResetAndReload() {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.map(n => caches.delete(n)));
    }
    if ("indexedDB" in window && indexedDB.databases) {
      const dbs = await indexedDB.databases();
      await Promise.all(dbs.map(d => new Promise((res) => {
        const req = indexedDB.deleteDatabase(d.name);
        req.onsuccess = req.onerror = req.onblocked = () => res();
      })));
    }
    localStorage.clear();
  } catch (e) {
    // Best-effort — reload regardless, since even a partial clear helps.
  }
  window.location.href = "index.html";
}

function showLoadTimeoutError() {
  document.body.innerHTML = `
    <div style="max-width:420px;margin:15vh auto 0;padding:32px;font-family:-apple-system,sans-serif;text-align:center;">
      <h2 style="margin:0 0 12px;font-size:20px;">Taking longer than expected</h2>
      <p style="color:#666;font-size:14px;line-height:1.5;margin:0 0 24px;">
        This usually means some local data on this device got stuck. Resetting clears it and takes you back to sign in — you won't lose anything, since your rota data all lives online.
      </p>
      <button id="hardResetBtn" style="padding:12px 24px;background:#0B6E64;color:#fff;border:none;
        border-radius:8px;font-weight:600;font-size:14px;cursor:pointer;">Reset and try again</button>
    </div>
  `;
  document.getElementById("hardResetBtn").addEventListener("click", hardResetAndReload);
}

export async function login(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

// Sends a password reset link to the given email via Firebase's built-in
// flow — the person clicks it, lands on a Firebase-hosted page, sets a
// new password, then comes back and signs in normally. Firebase resolves
// this the same way whether or not the email is actually registered (so
// as not to reveal who has an account), so the caller can't tell those
// two cases apart either — the UI should give the same message either way.
export async function sendPasswordReset(email) {
  return sendPasswordResetEmail(auth, email);
}

export async function logout() {
  await signOut(auth);
  window.location.href = "index.html";
}

// Changes the signed-in user's own password. Firebase refuses a bare
// updatePassword() call unless the sign-in is "recent" — reauthenticating
// with their current password first satisfies that every time, so this
// works whether they signed in 30 seconds or 3 weeks ago.
export async function changeOwnPassword(currentPassword, newPassword) {
  const user = auth.currentUser;
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
}

// Simple role-gate helper: pass the profile and the roles allowed to
// view/act on the current page. Returns true/false — pages decide what
// to do (usually: hide edit controls, or bounce read-only users away).
export function hasRole(profile, ...allowed) {
  return allowed.includes(profile.role);
}
