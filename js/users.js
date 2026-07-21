// -----------------------------------------------------------------------
// users.js
// Admin-only account management: create login accounts for ODPs/editors/
// admins, change someone's role, or revoke their access.
//
// IMPORTANT: Firebase's client SDK signs you in as whichever account you
// just created with createUserWithEmailAndPassword — there's no way to
// create another user's login from the client without that happening on
// the *default* app instance, which would kick the admin out of their own
// session. The fix is to run account creation on a second, separate
// Firebase app instance (same project, just a second connection) so it
// gets its own signed-in user, completely independent of the admin's
// session in the main app./auth instance used everywhere else.
// -----------------------------------------------------------------------

import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signOut as secondarySignOut
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

import { firebaseConfig } from "./firebase-config.js";
import { db, doc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where } from "./firebase-init.js";

export async function listUsers(departmentId) {
  const q = query(collection(db, "users"), where("departmentId", "==", departmentId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

// Creates a brand-new login (Firebase Auth) plus their /users/{uid}
// profile doc. Runs the Auth creation on a throwaway secondary app
// instance so the admin stays signed in as themselves throughout.
export async function createUserAccount({ email, password, displayName, role, departmentId }) {
  const secondaryApp = initializeApp(firebaseConfig, `create-user-${Date.now()}`);
  try {
    const secondaryAuth = getAuth(secondaryApp);
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const uid = cred.user.uid;
    await secondarySignOut(secondaryAuth); // tidy up the secondary session, doesn't touch the admin's
    await setDoc(doc(db, "users", uid), { departmentId, role, displayName, email });
    return uid;
  } finally {
    await deleteApp(secondaryApp);
  }
}

export async function updateUserRole(uid, role) {
  await updateDoc(doc(db, "users", uid), { role });
}

// Revokes access to this department by removing their /users/{uid}
// profile doc. Their Firebase Auth login itself still exists (deleting
// another person's Auth account isn't possible from the client SDK —
// that needs a backend/Admin SDK) but requireSession() bounces anyone
// without a profile doc straight back to the sign-in screen, so in
// practice they can no longer get into this department's data.
export async function revokeUserAccess(uid) {
  await deleteDoc(doc(db, "users", uid));
}
