import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * The HTML shell around every web page (web only; native apps never see this).
 * It's where the tags live that let members add Thrive to their home screen.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />

        {/* Home-screen app */}
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Thrive" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="theme-color" content="#F2F2F7" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)" />

        {/* Link previews when the site is shared */}
        <meta property="og:title" content="Thrive Collective" />
        <meta property="og:description" content="Book the gym, PT sessions and classes at Thrive Collective." />
        <meta property="og:url" content="https://booking.thrivecollectiveexeter.co.uk/" />
        <meta property="og:image" content="https://booking.thrivecollectiveexeter.co.uk/icons/icon-512.png" />
        <meta property="og:type" content="website" />

        {/* Disable body scrolling on web so ScrollView behaves like it does on native */}
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: backgroundStyle }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

// Matches the app background, so there's no white flash before it renders in dark mode
const backgroundStyle = `
body { background-color: #F2F2F7; }
@media (prefers-color-scheme: dark) {
  body { background-color: #000000; }
}`;
