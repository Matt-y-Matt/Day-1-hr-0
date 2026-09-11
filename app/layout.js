import './globals.css';

export const metadata = {
  title: 'Matt Training',
  manifest: '/manifest.json',
};

export const viewport = {
  themeColor: '#07070a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
