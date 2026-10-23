import { getWorkingWindowForDate, parseTimeOfDay, TIME_OPTIONS, formatWorkingDay } from '@/services/workingHours';
import { MONDAY, at } from './helpers';

describe('working hours', () => {
  it('falls back to 07:00–20:00 every day when a PT has no hours set', () => {
    expect(getWorkingWindowForDate(MONDAY)).toEqual({ start: at('07:00'), end: at('20:00') });
  });

  it("uses the PT's hours for that weekday", () => {
    const hours = { '1': { start: '09:30', end: '17:00' } }; // Monday
    expect(getWorkingWindowForDate(MONDAY, hours)).toEqual({ start: at('09:30'), end: at('17:00') });
  });

  it("returns null on a day the PT doesn't work", () => {
    expect(getWorkingWindowForDate(MONDAY, { '2': { start: '09:00', end: '17:00' } })).toBeNull();
  });

  it('returns null when the end is not after the start', () => {
    expect(getWorkingWindowForDate(MONDAY, { '1': { start: '17:00', end: '09:00' } })).toBeNull();
  });

  it('parses times of day, treating junk as zero', () => {
    expect(parseTimeOfDay('07:45')).toEqual({ hours: 7, minutes: 45 });
    expect(parseTimeOfDay('nonsense')).toEqual({ hours: 0, minutes: 0 });
  });

  it('offers editor times from 05:00 to 22:00 in 15-minute steps', () => {
    expect(TIME_OPTIONS[0]).toBe('05:00');
    expect(TIME_OPTIONS[1]).toBe('05:15');
    expect(TIME_OPTIONS[TIME_OPTIONS.length - 1]).toBe('22:00');
  });

  it('describes a working day', () => {
    expect(formatWorkingDay({ start: '09:00', end: '17:00' })).toBe('09:00 – 17:00');
    expect(formatWorkingDay(undefined)).toBe('Not working');
  });
});
