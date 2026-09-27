import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Atkinson_Hyperlegible, Bricolage_Grotesque } from 'next/font/google';
import './globals.css';

const display = Bricolage_Grotesque({ subsets: ['latin'], weight: ['700', '800'], variable: '--font-bricolage', display: 'swap' });
const body = Atkinson_Hyperlegible({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-atkinson', display: 'swap' });

export const metadata: Metadata = {
  title: 'Mercado Inteligente — compara tu lista de mercado',
  description: 'Compara los precios de tu lista de mercado en supermercados de Colombia, con datos verificados y sin precios inventados.',
  applicationName: 'Mercado Inteligente',
  appleWebApp: { capable: true, title: 'Mercado', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1d6a44',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-CO" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
