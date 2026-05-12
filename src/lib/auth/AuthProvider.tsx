"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { auth } from "@/lib/firebase/client";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  /** true dopo che il session cookie server è stato creato/aggiornato */
  sessionReady: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);

  // Crea/distrugge il session cookie ad ogni cambio di auth state
  useEffect(() => {
    // Guard: se Firebase non è configurato (env vars mancanti), skip silenzioso in dev
    if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
      setLoading(false);
      return;
    }

    let unsubscribe: () => void;
    try {
      unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        setUser(firebaseUser);
        setSessionReady(false);
        if (firebaseUser) {
          // forceRefresh=true garantisce che i nuovi custom claim (es. role=admin)
          // impostati lato server vengano subito inclusi nel session cookie.
          const idToken = await firebaseUser.getIdToken(true);
          await fetch("/api/auth/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken }),
          });
          setSessionReady(true);
        }
        setLoading(false);
      });
    } catch {
      // Firebase non inizializzato (env vars mancanti) — skip in dev
      setLoading(false);
      return;
    }
    return () => unsubscribe?.();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
      throw new Error("Firebase non configurato. Copia .env.local.example in .env.local e compila le variabili.");
    }
    const credential = await signInWithEmailAndPassword(auth, email, password);
    // Crea il session cookie subito, prima che il chiamante faccia il redirect.
    // Se lo delegassimo solo a onAuthStateChanged, ci sarebbe una race condition
    // per cui il middleware non trova ancora il cookie e rimanda al login.
    const idToken = await credential.user.getIdToken();
    await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
  }, []);

  const signOut = useCallback(async () => {
    if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY) return;
    await firebaseSignOut(auth);
    // Revoca il session cookie
    await fetch("/api/auth/session", { method: "DELETE" });
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, sessionReady, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve essere usato dentro <AuthProvider>");
  return ctx;
}
