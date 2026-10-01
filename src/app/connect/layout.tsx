import type { ReactNode } from "react";
import "./connect.css";

export const metadata = { title: "Connect your website" };

export default function ConnectLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
