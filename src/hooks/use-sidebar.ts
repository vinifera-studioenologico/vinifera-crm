"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "vinifera_sidebar_collapsed";

function getSnapshot(): boolean {
  return localStorage.getItem(STORAGE_KEY) === "true";
}

function getServerSnapshot(): boolean {
  return false;
}

function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function persist(value: boolean): void {
  localStorage.setItem(STORAGE_KEY, String(value));
  // Notifica i subscriber nello stesso tab (storage event è cross-tab)
  window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
}

export function useSidebar() {
  const collapsed = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const toggle = useCallback(() => {
    persist(!getSnapshot());
  }, []);

  const setCollapsed = useCallback((value: boolean) => {
    persist(value);
  }, []);

  return { collapsed, toggle, setCollapsed };
}
