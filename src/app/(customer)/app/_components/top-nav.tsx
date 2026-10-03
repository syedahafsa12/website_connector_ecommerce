"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  async function onLogout() {
    await logout();
    router.push("/login");
  }

  return (
    <header className="am-topnav">
      <div className="am-container am-topnav-inner">
        <Link href="/app" className="am-brand">
          <span className="am-brand-dot" />
          Agent Mall
        </Link>
        <nav className="am-nav-links">
          <Link href="/app" className={`am-nav-link ${pathname === "/app" ? "active" : ""}`}>
            Home
          </Link>
          <Link href="/app/search" className={`am-nav-link ${pathname?.startsWith("/app/search") ? "active" : ""}`}>
            Search
          </Link>
          <Link href="/app/auctions" className={`am-nav-link ${pathname?.startsWith("/app/auctions") ? "active" : ""}`}>
            Auctions
          </Link>
        </nav>
        <div style={{ position: "relative" }}>
          <button className="am-btn am-btn-ghost" onClick={() => setMenuOpen((v) => !v)} aria-haspopup="true" aria-expanded={menuOpen}>
            {user?.email ?? "Account"}
          </button>
          {menuOpen && (
            <div
              className="am-card"
              style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", minWidth: 180, padding: 8, zIndex: 30 }}
              onMouseLeave={() => setMenuOpen(false)}
            >
              <button className="am-btn am-btn-ghost am-btn-block" style={{ justifyContent: "flex-start" }} onClick={onLogout}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
