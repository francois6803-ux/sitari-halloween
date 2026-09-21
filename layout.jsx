import './globals.css';

export const metadata = {
  title: 'Sitari Halloween 2026 🎃',
  description: 'Find the glowing pumpkins. Trick-or-treat map for Sitari Country Estate.'
};
export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#0a0620' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Creepster&family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
