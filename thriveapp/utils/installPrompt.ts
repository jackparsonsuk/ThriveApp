import { Platform } from 'react-native';

/**
 * Helpers for adding the web app to a phone's home screen.
 *
 * Chrome (Android and desktop) fires `beforeinstallprompt` once, early in page load, when the
 * site can be installed. This module is imported by the root layout so it's listening by then;
 * the Profile screen's install guide can then offer a one-tap "Install app" button.
 * Safari has no such event, so iPhone users get written steps instead.
 */

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const isBrowser = Platform.OS === 'web' && typeof window !== 'undefined';

let deferredPrompt: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());

if (isBrowser) {
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); // we offer our own button rather than Chrome's mini-infobar
    deferredPrompt = event as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
}

export const canPromptInstall = () => deferredPrompt !== null;

/** Shows the browser's install dialog. Resolves true if the member installed the app. */
export const promptInstall = async (): Promise<boolean> => {
  const event = deferredPrompt;
  if (!event) return false;
  deferredPrompt = null; // each event can only be used once
  await event.prompt();
  const { outcome } = await event.userChoice;
  notify();
  return outcome === 'accepted';
};

export const onInstallPromptChange = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** True when the site is already open as an installed home-screen app. */
export const isRunningAsInstalledApp = () =>
  isBrowser &&
  (window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true);

/** iPhone or iPad, including iPads that report themselves as a Mac. */
export const isAppleMobile = () =>
  isBrowser &&
  (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1));
