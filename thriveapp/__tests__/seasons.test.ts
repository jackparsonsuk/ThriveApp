import { resolveSeason, seasonForDate } from '@/constants/seasons';
import { bookingTypeColor, Colors } from '@/constants/theme';

describe('seasonal themes', () => {
  it('shows Halloween from 17 to 31 October', () => {
    expect(seasonForDate(new Date(2026, 9, 16))).toBeNull();
    expect(seasonForDate(new Date(2026, 9, 17))).toBe('halloween');
    expect(seasonForDate(new Date(2026, 9, 31))).toBe('halloween');
    expect(seasonForDate(new Date(2026, 10, 1))).toBeNull();
  });

  it('shows Christmas throughout December', () => {
    expect(seasonForDate(new Date(2026, 11, 1))).toBe('christmas');
    expect(seasonForDate(new Date(2026, 11, 31))).toBe('christmas');
    expect(seasonForDate(new Date(2027, 0, 1))).toBeNull();
  });

  it('lets admins switch it off or force a season', () => {
    const halloween = new Date(2026, 9, 23);
    expect(resolveSeason('auto', halloween)).toBe('halloween');
    expect(resolveSeason(undefined, halloween)).toBe('halloween');
    expect(resolveSeason('off', halloween)).toBeNull();
    expect(resolveSeason('christmas', halloween)).toBe('christmas');
    expect(resolveSeason('halloween', new Date(2026, 5, 1))).toBe('halloween');
  });
});

describe('bookingTypeColor', () => {
  it('gives each booking type its own colour, the same in every screen', () => {
    const theme = Colors.light;
    expect(bookingTypeColor(theme, 'gym')).toBe(theme.info);
    expect(bookingTypeColor(theme, 'pt')).toBe(theme.tint);
    expect(bookingTypeColor(theme, 'group')).toBe(theme.purple);
    expect(bookingTypeColor(theme, 'block')).toBe(theme.textTertiary);
    expect(bookingTypeColor(theme, 'unknown')).toBe(theme.textTertiary);
  });
});
