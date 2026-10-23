import type { Booking } from '@/services/bookingService';
import { getPtDayAvailability, PtSlot } from '@/services/availabilityService';
import { MONDAY, at, booking } from './helpers';

jest.mock('@/config/firebaseConfig', () => ({ db: {}, auth: {} }));
jest.mock('firebase/firestore', () => ({}));

// Stand-in for Firestore: each test says what's in the diary, and the queries read from it
const diary = {
  ptSchedule: {} as Record<string, Booking[]>, // getPTBookingsForDate, by PT
  personal: {} as Record<string, Booking[]>, // getPersonAllBookingsForDate, by person
  gym: [] as Booking[], // getGymBookingsForDate
};

jest.mock('@/services/bookingService', () => ({
  ...jest.requireActual('@/services/bookingService'),
  getPTBookingsForDate: jest.fn(async (_date: Date, ptId: string) => diary.ptSchedule[ptId] ?? []),
  getPersonAllBookingsForDate: jest.fn(async (personId: string) => diary.personal[personId] ?? []),
  getGymBookingsForDate: jest.fn(async () => diary.gym),
}));

const PT = 'pt-1';
const CLIENT = 'client-1';

const availability = (options: Partial<Parameters<typeof getPtDayAvailability>[0]> = {}) =>
  getPtDayAvailability({ ptId: PT, clientId: CLIENT, date: MONDAY, ptFirstName: 'Sam', ...options });

const slotAt = (slots: PtSlot[], time: string) => slots.find(s => s.time.getTime() === at(time).getTime());

beforeEach(() => {
  diary.ptSchedule = {};
  diary.personal = {};
  diary.gym = [];
  jest.useFakeTimers().setSystemTime(new Date(2030, 0, 1));
});

afterEach(() => {
  jest.useRealTimers();
});

describe('getPtDayAvailability', () => {
  it('offers every hour-long slot in the working day, every 15 minutes', async () => {
    const { slots, window } = await availability();
    expect(window).toEqual({ start: at('07:00'), end: at('20:00') });
    expect(slots).toHaveLength(49); // 07:00 to 19:00
    expect(slots[0].time).toEqual(at('07:00'));
    expect(slots[slots.length - 1].endTime).toEqual(at('20:00'));
    expect(slots.every(s => s.available)).toBe(true);
  });

  it("offers nothing on a day the PT doesn't work", async () => {
    expect(await availability({ workingHours: { '2': { start: '09:00', end: '17:00' } } })).toEqual({ slots: [], window: null });
  });

  it("doesn't offer slots that have already started", async () => {
    jest.setSystemTime(at('12:05'));
    const { slots } = await availability();
    expect(slots[0].time).toEqual(at('12:15'));
  });

  it("explains a PT session with another client, including the run-up slots", async () => {
    diary.ptSchedule[PT] = [booking('10:00', '11:00', { type: 'pt', ptId: PT, userId: 'other-client' })];
    const { slots } = await availability();
    expect(slotAt(slots, '09:00')).toMatchObject({ available: true });
    expect(slotAt(slots, '09:15')).toMatchObject({ available: false, reason: 'Sam has less than one hour available' });
    expect(slotAt(slots, '10:00')).toMatchObject({ available: false, reason: 'Sam is booked', conflictBookingType: 'pt' });
    expect(slotAt(slots, '10:45')).toMatchObject({ available: false, reason: 'Sam is booked' });
    expect(slotAt(slots, '11:00')).toMatchObject({ available: true });
  });

  it("phrases the client's own pending request from their side", async () => {
    diary.ptSchedule[PT] = [booking('10:00', '11:00', { type: 'pt', ptId: PT, userId: CLIENT, status: 'pending' })];
    const { slots } = await availability();
    expect(slotAt(slots, '09:30')?.reason).toBe('Runs into your 10:00 request');
    expect(slotAt(slots, '10:00')?.reason).toBe('You already requested this time');
    expect(slotAt(slots, '10:30')?.reason).toBe('Overlaps your 10:00 request');
  });

  it('says "You" when the PT is the one looking', async () => {
    diary.ptSchedule[PT] = [booking('10:00', '11:00', { type: 'pt', ptId: PT, userId: 'other-client' })];
    const { slots } = await availability({ ptIsViewer: true, clientFirstName: 'Alex' });
    expect(slotAt(slots, '10:00')?.reason).toBe('You are booked');
  });

  it('blocks slots when the client is already at the gym', async () => {
    diary.personal[CLIENT] = [booking('14:00', '15:00', { userId: CLIENT })];
    const { slots } = await availability();
    expect(slotAt(slots, '14:00')).toMatchObject({ available: false, reason: 'You have a gym session' });
  });

  it('blocks slots when the gym is full for any part of the hour', async () => {
    diary.gym = [1, 2, 3, 4].map(() => booking('12:30', '13:30'));
    const { slots } = await availability();
    expect(slotAt(slots, '11:30')).toMatchObject({ available: true });
    expect(slotAt(slots, '12:00')).toMatchObject({ available: false, reason: 'Gym full', gymAttendees: 4 });
  });

  it('shows the reason for a gym-wide block', async () => {
    diary.gym = [booking('16:00', '18:00', { type: 'block', reason: 'Gym closed for an event' })];
    const { slots } = await availability();
    expect(slotAt(slots, '16:30')).toMatchObject({ available: false, reason: 'Gym closed for an event' });
  });

  it("ignores the bookings being moved, so a session doesn't clash with itself", async () => {
    const session = booking('10:00', '11:00', { type: 'pt', ptId: PT, userId: CLIENT });
    diary.ptSchedule[PT] = [session];
    diary.personal[CLIENT] = [session];
    const { slots } = await availability({ ignoreBookingIds: [session.id!] });
    expect(slotAt(slots, '10:00')).toMatchObject({ available: true });
  });
});
