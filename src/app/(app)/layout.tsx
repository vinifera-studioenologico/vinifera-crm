"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/lib/auth/AuthProvider";
import { useSidebar } from "@/hooks/use-sidebar";
import { Sidebar } from "@/components/app-shell/Sidebar";
import { Topbar } from "@/components/app-shell/Topbar";
import { MobileNav } from "@/components/app-shell/MobileNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { collapsed, toggle } = useSidebar();

  const devBypass = process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === "true";

  useEffect(() => {
    if (devBypass) return; // in dev bypass non serve redirect
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router, devBypass]);

  if (!devBypass && (loading || !user)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar — visibile da md in su */}
      <Sidebar collapsed={collapsed} onToggle={toggle} />

      {/* Area principale */}
      <div className="flex flex-1 flex-col min-h-0">
        <Topbar />
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-screen-2xl mx-auto px-6 py-6 pb-20 md:pb-6">
            {children}
          </div>
        </main>
      </div>

      {/* Bottom nav — visibile solo su mobile */}
      <MobileNav />
    </div>
  );
}
