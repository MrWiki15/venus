import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Venus · Escáner 3D del edificio',
  description: 'Recorrido 3D realista de un edificio ecléctico: escaneo, fachada, planta baja, pisos y azotea.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false, // el pellizco es para el 3D, no para hacer zoom a la página
  viewportFit: 'cover', // ocupa la pantalla completa en móviles con notch
  themeColor: '#0b0f12',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
