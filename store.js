/* ═══════════════════════════════════════════════════════════════
   Foco — camada de dados
   Mesma interface para Firebase (conta Google) e modo local (demo).
   S.add(col,data) · S.update(col,id,data) · S.remove(col,id)
   S.watch(col,uid,cb(lista)) → unsubscribe · S.onAuth(cb) · S.login() · S.logout()
   ═══════════════════════════════════════════════════════════════ */

export const firebaseConfig = {
  apiKey: "AIzaSyCbwn940rzZ6M6A5TvxH8t_RWZ36W07ST4",
  authDomain: "agenda-7bf03.firebaseapp.com",
  projectId: "agenda-7bf03",
  storageBucket: "agenda-7bf03.firebasestorage.app",
  messagingSenderId: "668828742062",
  appId: "1:668828742062:web:1b0ab5f72324a02b2a983f"
};

const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
const DEMO_FLAG = 'foco_demo';

export const isDemo = () => {
  try { return localStorage.getItem(DEMO_FLAG) === '1'; } catch { return false; }
};
export const setDemo = on => {
  try { on ? localStorage.setItem(DEMO_FLAG, '1') : localStorage.removeItem(DEMO_FLAG); } catch {}
};

/* ───────── Modo local (sem conta) ───────── */
function createLocalStore() {
  const KEY = c => `foco_local_${c}`;
  const listeners = {};
  const read = c => { try { return JSON.parse(localStorage.getItem(KEY(c)) || '[]'); } catch { return []; } };
  const write = (c, arr) => {
    try { localStorage.setItem(KEY(c), JSON.stringify(arr)); }
    catch (e) { throw new Error('Armazenamento local cheio. Remove imagens grandes das notas.'); }
    (listeners[c] || []).forEach(cb => queueMicrotask(() => cb(read(c))));
  };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)).replace(/-/g, '').slice(0, 20);
  const user = { uid: 'local', displayName: 'Convidado', photoURL: '', email: '' };

  // sincronizar entre separadores
  addEventListener('storage', e => {
    if (!e.key || !e.key.startsWith('foco_local_')) return;
    const c = e.key.slice('foco_local_'.length);
    (listeners[c] || []).forEach(cb => cb(read(c)));
  });

  return {
    mode: 'local',
    async add(c, data) { const id = newId(); const arr = read(c); arr.push({ ...data, id }); write(c, arr); return { id }; },
    async update(c, id, data) { const arr = read(c); const i = arr.findIndex(x => x.id === id); if (i >= 0) { arr[i] = { ...arr[i], ...data }; write(c, arr); } },
    async remove(c, id) { write(c, read(c).filter(x => x.id !== id)); },
    watch(c, _uid, cb) {
      (listeners[c] ||= []).push(cb);
      queueMicrotask(() => cb(read(c)));
      return () => { listeners[c] = (listeners[c] || []).filter(f => f !== cb); };
    },
    onAuth(cb) { queueMicrotask(() => cb(user)); return () => {}; },
    async login() {},
    async logout() { setDemo(false); location.reload(); },
    wipeAll() { Object.keys(localStorage).filter(k => k.startsWith('foco_local_')).forEach(k => localStorage.removeItem(k)); }
  };
}

/* ───────── Firebase ───────── */
async function createFirebaseStore() {
  const [{ initializeApp }, fs, au] = await Promise.all([
    import(FB + 'firebase-app.js'),
    import(FB + 'firebase-firestore.js'),
    import(FB + 'firebase-auth.js')
  ]);
  const app = initializeApp(firebaseConfig);
  let db;
  try {
    db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) });
  } catch {
    db = fs.getFirestore(app);
  }
  const auth = au.getAuth(app);
  const provider = new au.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  au.getRedirectResult(auth).catch(() => {});

  return {
    mode: 'firebase',
    async add(c, data) { const r = await fs.addDoc(fs.collection(db, c), data); return { id: r.id }; },
    async update(c, id, data) { await fs.updateDoc(fs.doc(db, c, id), data); },
    async remove(c, id) { await fs.deleteDoc(fs.doc(db, c, id)); },
    watch(c, uid, cb, onErr) {
      return fs.onSnapshot(
        fs.query(fs.collection(db, c), fs.where('uid', '==', uid)),
        s => cb(s.docs.map(d => ({ ...d.data(), id: d.id }))),
        err => { console.error(`[${c}]`, err); onErr && onErr(err); }
      );
    },
    onAuth(cb) { return au.onAuthStateChanged(auth, cb); },
    async login() {
      try { await au.signInWithPopup(auth, provider); }
      catch (e) {
        const redirectCodes = ['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/cancelled-popup-request'];
        if (redirectCodes.includes(e.code)) return au.signInWithRedirect(auth, provider);
        if (e.code === 'auth/popup-closed-by-user') return;
        throw e;
      }
    },
    async logout() { await au.signOut(auth); }
  };
}

export async function initStore() {
  if (isDemo()) return createLocalStore();
  return createFirebaseStore();
}
