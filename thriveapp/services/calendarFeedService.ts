import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebaseConfig';

// The PT's private calendar feed URL. Pass reset to replace it, so the old link stops working.
export const getCalendarFeedUrl = async (reset = false): Promise<string> => {
    const call = httpsCallable<{ reset: boolean }, { url: string }>(functions, 'getCalendarFeedUrl');
    const result = await call({ reset });
    return result.data.url;
};

// webcal:// makes iOS/macOS open the "Subscribe to calendar" prompt
export const toWebcalUrl = (url: string) => url.replace(/^https?:\/\//, 'webcal://');

// Google Calendar's add-by-URL page, with the feed filled in
export const toGoogleCalendarUrl = (url: string) =>
    `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(toWebcalUrl(url))}`;
