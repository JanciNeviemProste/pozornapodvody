import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Strážca Podvodov",
  description:
    "Pomocník pre účastníkov kurzu digitálnych seniorov na rozpoznávanie online podvodov."
};

type RootLayoutProps = {
  children: React.ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="sk">
      <body>{children}</body>
    </html>
  );
}
