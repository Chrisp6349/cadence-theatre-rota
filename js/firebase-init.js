// -----------------------------------------------------------------------
// firebase-init.js
// One place that boots Firebase and exports the pieces every other file
// needs. Uses the hosted modular SDK (no build step / npm required —
// works straight from GitHub Pages the same way the old apps did).
// -----------------------------------------------------------------------

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  updatePassword, reauthenticateWithCredential, EmailAuthProvider, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, getDocs, addDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp,
  enableIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Lets already-loaded documents stay readable with no signal, and queues
// writes locally to sync automatically once back online — the actual
// substance of "offline-capable" for the data side of the app (sw.js
// handles the app-shell/installability side separately). Silently
// no-ops rather than breaking the app if it can't enable: multiple tabs
// open in the same browser is the realistic failure case (only one tab
// can hold the persistence lock), and older/unusual browsers are the
// other — both leave the app working exactly as it does today, just
// without the offline read/write cache.
enableIndexedDbPersistence(db).catch(() => {});

export {
  onAuthStateChanged, signInWithEmailAndPassword, signOut,
  updatePassword, reauthenticateWithCredential, EmailAuthProvider, sendPasswordResetEmail,
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, getDocs, addDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp
};
