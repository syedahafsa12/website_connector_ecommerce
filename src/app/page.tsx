"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { loadSession } from "@/lib/auth-storage";

/** The Agent Mall is the default experience now: `/` just routes to /login or /app depending on session state. */
export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    const session = loadSession();
    if (!session) {
      router.replace("/login");
      return;
    }
    apiFetch("/api/auth/me")
      .then(() => router.replace("/app"))
      .catch(() => router.replace("/login"));
  }, [router]);

  return null;
}
