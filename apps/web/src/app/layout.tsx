import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RideSync — Real-Time Bus Tracker",
  description: "Track your college bus in real-time. Know exactly when your bus arrives — no more waiting in the rain.",
  keywords: ["bus tracker", "college bus", "real-time", "student transport"],
  openGraph: {
    title: "RideSync — Real-Time Bus Tracker",
    description: "Track your college bus in real-time. Know exactly when your bus arrives.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
