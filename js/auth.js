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
export function requireSession() {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.href = "index.html";
        return;
      }
      const snap = await getDoc(doc(db, "users", user.uid));
      if (!snap.exists()) {
        alert("Your account isn't set up in this department yet. Ask your admin to add you.");
        await signOut(auth);
        window.location.href = "index.html";
        return;
      }
      resolve({ user, profile: snap.data() });
    });
  });
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
