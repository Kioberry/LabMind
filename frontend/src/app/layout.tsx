import type { Metadata } from 'next';
import { Changa } from 'next/font/google';
import './globals.css';

const changa = Changa({
  subsets: ['latin'],
  weight: ['300', '400', '500', '700'],
});

export const metadata: Metadata = {
  title: 'LabMind',
  description: 'Autonomous experiment optimization',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={changa.className}>{children}</body>
    </html>
  );
}
