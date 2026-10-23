import type { Booking } from '@/services/bookingService';

/** Monday 7 January 2030, well in the future so no slot is skipped as "in the past". */
export const MONDAY = new Date(2030, 0, 7);

/** A time on `MONDAY`, e.g. at('10:30'). */
export const at = (time: string, day: Date = MONDAY) => {
  const [h, m] = time.split(':').map(Number);
  const d = new Date(day);
  d.setHours(h, m, 0, 0);
  return d;
};

let nextId = 1;

/** A booking from `start` to `end` on `MONDAY`, defaulting to a confirmed gym session. */
export const booking = (start: string, end: string, fields: Partial<Booking> = {}): Booking => ({
  id: `b${nextId++}`,
  userId: 'someone',
  type: 'gym',
  status: 'confirmed',
  startTime: at(start),
  endTime: at(end),
  ...fields,
});
