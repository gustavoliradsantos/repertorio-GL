// Conexão da página com o Firebase (banco Firestore + login Google).
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
         doc, collection, query, limit, onSnapshot, setDoc, deleteDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
let fs;
try { fs = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); }
catch (e) { fs = initializeFirestore(app, {}); }
const auth = getAuth(app);

// Traduz erros do Firebase para os códigos que a página já entende.
const mapErr = (e) => ({ code: e && e.code === "permission-denied" ? "invalid_argument" : "unavailable", message: String((e && e.message) || e) });
const wrapDoc = (s) => ({ id: s.id, exists: s.exists(), data: () => s.data(), metadata: s.metadata });

const db = {
  doc(path) {
    const r = doc(fs, path);
    return {
      set: (d) => setDoc(r, d).catch((e) => { throw mapErr(e); }),
      delete: () => deleteDoc(r).catch((e) => { throw mapErr(e); }),
      onSnapshot: (next, err) => onSnapshot(r, (s) => next(wrapDoc(s)), (e) => err && err(mapErr(e))),
    };
  },
  collection(path) {
    let n = 1000;
    const api = {
      limit(k) { n = k; return api; },
      onSnapshot(next, err) {
        return onSnapshot(query(collection(fs, path), limit(n)),
          (s) => next({ docs: s.docs.map(wrapDoc), size: s.size, empty: s.empty, metadata: s.metadata }),
          (e) => err && err(mapErr(e)));
      },
    };
    return api;
  },
};

async function importAll(data) {
  const writes = [];
  for (const col of ["cats", "edits", "custom", "shows"]) {
    for (const [id, body] of Object.entries(data[col] || {})) writes.push([col + "/" + id, body]);
  }
  for (let i = 0; i < writes.length; i += 400) {
    const b = writeBatch(fs);
    writes.slice(i, i + 400).forEach(([p, body]) => b.set(doc(fs, p), body));
    try { await b.commit(); } catch (e) { throw mapErr(e); }
  }
}

async function login() {
  const provider = new GoogleAuthProvider();
  try { await signInWithPopup(auth, provider); }
  catch (e) {
    if (e && (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment")) return signInWithRedirect(auth, provider);
    throw e;
  }
}

const backend = {
  db, importAll, login,
  logout: () => signOut(auth),
  currentUser: () => auth.currentUser,
  onAuth: (fn) => onAuthStateChanged(auth, fn),
};
window.__repertorioBackend = backend;
window.dispatchEvent(new CustomEvent("backend-ready", { detail: backend }));
