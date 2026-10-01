import type { ReactNode } from "react";
import "./globals.css";
import { ProtoBanner } from "./proto-banner";

export const metadata = { title: "Agentic Commerce — Engineering Console" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ProtoBanner />
        {children}
      </body>
    </html>
  );
}
