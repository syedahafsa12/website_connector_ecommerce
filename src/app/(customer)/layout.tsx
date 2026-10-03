import type { ReactNode } from "react";
import "./agent-mall.css";
import { AuthProvider } from "@/lib/auth-context";

export default function CustomerLayout({ children }: { children: ReactNode }) {
  return (
    <div className="am-root">
      <AuthProvider>{children}</AuthProvider>
    </div>
  );
}
