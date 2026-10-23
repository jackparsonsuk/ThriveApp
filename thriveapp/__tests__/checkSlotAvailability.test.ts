import { checkSlotAvailability } from '@/services/bookingService';
import { at, booking } from './helpers';

jest.mock('@/config/firebaseConfig', () => ({ db: {}, auth: {} }));
jest.mock('firebase/firestore', () => ({}));

describe('checkSlotAvailability (gym capacity)', () => {
  it('is available when the gym is empty', () => {
    expect(checkSlotAvailability(at('10:00'), [])).toEqual({ available: true, count: 0 });
  });

  it('counts gym and PT sessions overlapping the 15-minute slot', () => {
    const bookings = [
      booking('09:30', '10:30'),
      booking('10:00', '11:00', { type: 'pt' }),
      booking('11:00', '12:00'), // starts after the slot
      booking('09:00', '10:00'), // ends exactly as the slot starts
    ];
    expect(checkSlotAvailability(at('10:00'), bookings)).toEqual({ available: true, count: 2 });
  });

  it('is full at four people', () => {
    const bookings = [1, 2, 3, 4].map(() => booking('10:00', '11:00'));
    expect(checkSlotAvailability(at('10:15'), bookings)).toEqual({ available: false, count: 4 });
  });

  it('counts the same booking only once', () => {
    // A PT's own session can arrive from more than one query
    const shared = booking('10:00', '11:00', { type: 'pt' });
    expect(checkSlotAvailability(at('10:00'), [shared, { ...shared }])).toEqual({ available: true, count: 1 });
  });

  it('is unavailable during a gym block, with its reason', () => {
    const bookings = [booking('10:00', '12:00', { type: 'block', reason: 'Deep clean' })];
    expect(checkSlotAvailability(at('11:00'), bookings)).toEqual({ available: false, count: 0, blockReason: 'Deep clean' });
  });
});
