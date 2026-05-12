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
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

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
        if (firebaseUser) {
          const idToken = await firebaseUser.getIdToken();
          await fetch("/api/auth/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken }),
          });
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
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged gestirà il session cookie
  }, []);

  const signOut = useCallback(async () => {
    if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY) return;
    await firebaseSignOut(auth);
    // Revoca il session cookie
    await fetch("/api/auth/session", { method: "DELETE" });
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve essere usato dentro <AuthProvider>");
  return ctx;
}
