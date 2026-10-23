/**
 * Seasonal theme modes. A season adds a little decoration (an emoji by screen titles,
 * a greeting on the Dashboard); colours stay Thrive Orange.
 */

export type Season = 'halloween' | 'christmas';

/** What admins pick in Firestore `settings/global.seasonalTheme`. `auto` follows the calendar. */
export type SeasonalThemeSetting = 'auto' | 'off' | Season;

interface SeasonDefinition {
  label: string;
  emoji: string;
  greeting: string;
  /** Slipped into Dashboard copy, e.g. "your next spooky session". */
  adjective: string;
}

export const SEASONS: Record<Season, SeasonDefinition> = {
  halloween: {
    label: 'Halloween',
    emoji: '🎃',
    greeting: 'Happy Halloween',
    adjective: 'spooky',
  },
  christmas: {
    label: 'Christmas',
    emoji: '🎄',
    greeting: 'Merry Christmas',
    adjective: 'festive',
  },
};

/** The season the calendar says it is: Halloween 17–31 Oct, Christmas throughout December. */
export const seasonForDate = (date: Date): Season | null => {
  const month = date.getMonth();
  if (month === 9 && date.getDate() >= 17) return 'halloween';
  if (month === 11) return 'christmas';
  return null;
};

/** Resolves the admin setting to the season that should show, before any per-user opt-out. */
export const resolveSeason = (setting: SeasonalThemeSetting | undefined, date: Date = new Date()): Season | null => {
  if (setting === 'off') return null;
  if (setting === 'halloween' || setting === 'christmas') return setting;
  return seasonForDate(date);
};
