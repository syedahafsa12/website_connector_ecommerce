"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { TopNav } from "./_components/top-nav";

export default function AppLayout({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "anonymous") router.replace("/login");
  }, [status, router]);

  if (status !== "authenticated") {
    return (
      <div className="am-empty" style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <span className="am-spinner" style={{ color: "var(--am-text-faint)" }} />
      </div>
    );
  }

  return (
    <>
      <TopNav />
      <main className="am-container am-page">{children}</main>
    </>
  );
}
