import { setHours, setMilliseconds, setMinutes, setSeconds } from 'date-fns';

/**
 * Pure working-hours logic. Deliberately free of Firebase imports so it can be
 * reasoned about (and tested) on its own.
 */

/** A PT's bookable window on a given weekday, as 'HH:mm' strings. */
export interface WorkingHoursDay {
    start: string;
    end: string;
}

/**
 * Keyed by JS day-of-week index ('0' = Sunday … '6' = Saturday).
 * A missing key means the PT does not work that day.
 */
export type WorkingHours = Partial<Record<'0' | '1' | '2' | '3' | '4' | '5' | '6', WorkingHoursDay>>;

export type DayKey = '0' | '1' | '2' | '3' | '4' | '5' | '6';

/** A PT session is always a single hour. */
export const PT_SESSION_MINUTES = 60;

/** Candidate start times are offered every 15 minutes. */
export const SLOT_STEP_MINUTES = 15;

/**
 * Applied when a PT has never set their hours. Matches the window the app used
 * before working hours existed, so existing PTs stay bookable exactly as before.
 */
export const LEGACY_WORKING_DAY: WorkingHoursDay = { start: '07:00', end: '20:00' };

export const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAY_LABELS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Monday-first ordering for display; the keys themselves are JS day indices. */
export const DAY_ORDER: DayKey[] = ['1', '2', '3', '4', '5', '6', '0'];

/** Selectable times in the working-hours editor: 05:00 to 22:00, every 15 minutes. */
export const TIME_OPTIONS = Array.from({ length: (22 - 5) * (60 / SLOT_STEP_MINUTES) + 1 }, (_, i) => {
    const minutes = 5 * 60 + i * SLOT_STEP_MINUTES;
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
});

export const parseTimeOfDay = (value: string): { hours: number; minutes: number } => {
    const [h, m] = value.split(':');
    return { hours: Number(h) || 0, minutes: Number(m) || 0 };
};

const applyTimeOfDay = (date: Date, value: string): Date => {
    const { hours, minutes } = parseTimeOfDay(value);
    return setMilliseconds(setSeconds(setMinutes(setHours(date, hours), minutes), 0), 0);
};

/** What a PT's hours actually resolve to today, including the legacy fallback. */
export const effectiveWorkingHours = (workingHours?: WorkingHours): WorkingHours =>
    workingHours ?? {
        '0': LEGACY_WORKING_DAY,
        '1': LEGACY_WORKING_DAY,
        '2': LEGACY_WORKING_DAY,
        '3': LEGACY_WORKING_DAY,
        '4': LEGACY_WORKING_DAY,
        '5': LEGACY_WORKING_DAY,
        '6': LEGACY_WORKING_DAY,
    };

/**
 * The PT's bookable window on a specific date, or null if they don't work that
 * day. An undefined `workingHours` falls back to the legacy all-week window.
 */
export const getWorkingWindowForDate = (
    date: Date,
    workingHours?: WorkingHours
): { start: Date; end: Date } | null => {
    const day = String(date.getDay()) as DayKey;
    const hours = workingHours ? workingHours[day] : LEGACY_WORKING_DAY;
    if (!hours) return null;

    const start = applyTimeOfDay(date, hours.start);
    const end = applyTimeOfDay(date, hours.end);
    if (end <= start) return null;

    return { start, end };
};

export const formatWorkingDay = (hours?: WorkingHoursDay) =>
    hours ? `${hours.start} – ${hours.end}` : 'Not working';
