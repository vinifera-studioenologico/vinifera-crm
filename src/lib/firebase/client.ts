import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, connectAuthEmulator, type Auth } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, type Firestore } from "firebase/firestore";
import { getStorage, connectStorageEmulator, type FirebaseStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const USE_EMULATORS = process.env.NEXT_PUBLIC_USE_EMULATORS === "true";

// Lazy init — avoids crashing during Next.js build when env vars are absent.
// At runtime (browser or Vercel), env vars are always present.
let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;
let _storage: FirebaseStorage | null = null;
let _emuAuth = false;
let _emuDb = false;
let _emuStorage = false;

function getClientApp(): FirebaseApp {
  if (!_app) {
    _app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  }
  return _app;
}

export const auth: Auth = new Proxy({} as Auth, {
  get(_t, prop, receiver) {
    if (!_auth) _auth = getAuth(getClientApp());
    if (USE_EMULATORS && !_emuAuth) {
      _emuAuth = true;
      connectAuthEmulator(_auth, "http://localhost:9099", { disableWarnings: true });
    }
    return Reflect.get(_auth, prop, receiver);
  },
});

export const db: Firestore = new Proxy({} as Firestore, {
  get(_t, prop, receiver) {
    if (!_db) _db = getFirestore(getClientApp());
    if (USE_EMULATORS && !_emuDb) {
      _emuDb = true;
      connectFirestoreEmulator(_db, "localhost", 8080);
    }
    return Reflect.get(_db, prop, receiver);
  },
});

export const storage: FirebaseStorage = new Proxy({} as FirebaseStorage, {
  get(_t, prop, receiver) {
    if (!_storage) _storage = getStorage(getClientApp());
    if (USE_EMULATORS && !_emuStorage) {
      _emuStorage = true;
      connectStorageEmulator(_storage, "localhost", 9199);
    }
    return Reflect.get(_storage, prop, receiver);
  },
});

export default getClientApp;
