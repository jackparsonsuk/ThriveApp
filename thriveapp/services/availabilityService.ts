import { addMinutes, format, isBefore } from 'date-fns';
import {
    Booking,
    checkSlotAvailability,
    getGymBookingsForDate,
    getPTBookingsForDate,
    getPersonAllBookingsForDate,
} from './bookingService';
import { PT_SESSION_MINUTES, SLOT_STEP_MINUTES, WorkingHours, getWorkingWindowForDate } from './workingHours';

export * from './workingHours';

export interface PtSlot {
    time: Date;
    endTime: Date;
    available: boolean;
    /** Why this slot can't be requested — shown in place of the duration label. */
    reason?: string;
    /** How many of the gym's four places are taken during this slot. */
    gymAttendees: number;
    /** Groups consecutive slots belonging to the same booking, for outline styling. */
    conflictBookingId?: string;
    conflictBookingType?: string;
}

export interface PtDayAvailability {
    slots: PtSlot[];
    /** Null when the PT doesn't work this day at all. */
    window: { start: Date; end: Date } | null;
}

/** A second client sharing the session (a paired PT session), who must be free too. */
export interface SessionPartner {
    id: string;
    firstName: string;
}

/**
 * Every hour a client could request with their PT on a given date.
 *
 * A slot is requestable when all of these hold for the full hour:
 *  - it falls inside the PT's working window
 *  - the PT has nothing else on (sessions, their own training, availability blocks)
 *  - the gym isn't closed or at capacity
 *  - the client isn't already booked or awaiting approval elsewhere
 *
 * Unavailable slots are returned too, with a reason, so the client can see why
 * rather than facing an unexplained gap.
 *
 * The same checks power rescheduling: pass the bookings being moved in
 * `ignoreBookingIds` so they don't clash with themselves, and set `ptIsViewer` /
 * `clientFirstName` so the reasons read from the PT's side instead of the client's.
 */
export const getPtDayAvailability = async ({
    ptId,
    clientId,
    date,
    workingHours,
    ptFirstName = 'Your PT',
    ptIsViewer = false,
    clientFirstName,
    partner,
    durationMinutes = PT_SESSION_MINUTES,
    ignoreBookingIds = [],
}: {
    ptId: string;
    clientId: string;
    date: Date;
    workingHours?: WorkingHours;
    ptFirstName?: string;
    /** The PT is the one looking, so PT-side reasons say "You". */
    ptIsViewer?: boolean;
    /** Set when someone other than the client is looking, so client-side reasons name them. */
    clientFirstName?: string;
    partner?: SessionPartner;
    durationMinutes?: number;
    /** Bookings to leave out of every check, e.g. the session being moved. */
    ignoreBookingIds?: string[];
}): Promise<PtDayAvailability> => {
    const window = getWorkingWindowForDate(date, workingHours);
    if (!window) return { slots: [], window: null };

    const [ptSchedule, ptPersonal, clientBookings, clientSchedule, gymBookings, partnerBookings] = (await Promise.all([
        getPTBookingsForDate(date, ptId),
        getPersonAllBookingsForDate(ptId, date),
        getPersonAllBookingsForDate(clientId, date),
        // The requester may be a PT themselves. Sessions they *lead* are stored
        // under the attending client's userId, so they don't show up above.
        getPTBookingsForDate(date, clientId),
        getGymBookingsForDate(date),
        partner ? getPersonAllBookingsForDate(partner.id, date) : Promise.resolve([] as Booking[]),
    ])).map(list => list.filter(b => !b.id || !ignoreBookingIds.includes(b.id)));

    // Reasons are phrased for whoever is looking: "You" for them, a first name for anyone else
    const ptIs = ptIsViewer ? 'You are' : `${ptFirstName} is`;
    const ptHas = ptIsViewer ? 'You have' : `${ptFirstName} has`;
    const clientIs = clientFirstName ? `${clientFirstName} is` : 'You are';
    const clientHas = clientFirstName ? `${clientFirstName} has` : 'You have';
    const clientYour = clientFirstName ? `${clientFirstName}'s` : 'your';
    // An hour-long request also blocks the slots either side of it. Only the
    // slot it actually starts at is "this time" — the others say which request
    // they clash with, so one request doesn't read as several.
    const clientRequested = (b: Booking, slotStart: Date) => {
        if (b.startTime.getTime() === slotStart.getTime()) {
            return clientFirstName ? `${clientFirstName} already requested this time` : 'You already requested this time';
        }
        const at = format(b.startTime, 'HH:mm');
        return b.startTime > slotStart
            ? `Runs into ${clientYour} ${at} request`
            : `Overlaps ${clientYour} ${at} request`;
    };
    const personBusyReason = (b: Booking, has: string, is: string) => {
        if (b.type === 'pt' && b.status === 'pending') return `${has} a pending request`;
        if (b.type === 'pt') return `${has} a PT session`;
        if (b.type === 'gym') return `${has} a gym session`;
        if (b.type === 'group') return `${has} a class`;
        return `${is} busy`;
    };

    const clientLedSessions = clientSchedule.filter(b => b.type === 'pt' && b.ptId === clientId);

    const slots: PtSlot[] = [];
    const now = new Date();
    let currentTime = window.start;

    while (addMinutes(currentTime, durationMinutes) <= window.end) {
        const slotStart = currentTime;
        const slotEnd = addMinutes(slotStart, durationMinutes);
        currentTime = addMinutes(currentTime, SLOT_STEP_MINUTES);

        // A session can't start in the past
        if (isBefore(slotStart, now)) continue;

        const overlaps = (b: Booking) => b.startTime < slotEnd && b.endTime > slotStart;

        let available = true;
        let reason: string | undefined;
        let conflictBookingId: string | undefined;
        let conflictBookingType: string | undefined;

        const ptOwnBlock = ptSchedule.find(b => b.type === 'pt_block' && overlaps(b));
        const ptSession = ptSchedule.find(b => b.type === 'pt' && overlaps(b));
        const gymWideBlock = gymBookings.find(b => b.type === 'block' && overlaps(b));
        const ptOtherBooking = ptPersonal.find(b => b.type !== 'pt_block' && overlaps(b));
        const clientConflict = clientBookings.find(overlaps);
        const clientLeading = clientLedSessions.find(overlaps);
        const partnerConflict = partnerBookings.find(overlaps);

        // The PT is free when this slot starts — the hour just runs into
        // whatever they have next. Saying they're "booked" reads as if the time
        // itself is taken, so clients skip the run-up slots without realising
        // it's only the length of the session that doesn't fit.
        const runsIntoNext = (b: Booking) => b.startTime > slotStart;
        const shortWindow = durationMinutes === 60
            ? `${ptHas} less than one hour available`
            : `${ptHas} less than ${durationMinutes} minutes available`;

        if (ptOwnBlock) {
            available = false;
            reason = runsIntoNext(ptOwnBlock) ? shortWindow : `${ptIs} unavailable`;
            conflictBookingId = ptOwnBlock.id;
            conflictBookingType = 'pt_block';
        } else if (ptSession) {
            available = false;
            // The clash may be the client's own request — say so from their side,
            // rather than making it sound like someone else took the slot.
            if (ptSession.userId === clientId) {
                reason = ptSession.status === 'pending' ? clientRequested(ptSession, slotStart) : `${clientHas} a session booked`;
            } else if (runsIntoNext(ptSession)) {
                reason = shortWindow;
            } else {
                reason = ptSession.status === 'pending' ? `${ptHas} a pending request` : `${ptIs} booked`;
            }
            conflictBookingId = ptSession.id;
            conflictBookingType = 'pt';
        } else if (ptOtherBooking) {
            available = false;
            if (runsIntoNext(ptOtherBooking)) reason = shortWindow;
            else reason = ptOtherBooking.type === 'group' ? `${ptHas} a class` : `${ptIs} training`;
            conflictBookingId = ptOtherBooking.id;
            conflictBookingType = ptOtherBooking.type;
        } else if (gymWideBlock) {
            available = false;
            reason = gymWideBlock.reason || 'Gym closed';
            conflictBookingId = gymWideBlock.id ?? 'admin-block';
            conflictBookingType = 'block';
        } else if (clientConflict) {
            available = false;
            reason = clientConflict.type === 'pt' && clientConflict.status === 'pending'
                ? clientRequested(clientConflict, slotStart)
                : personBusyReason(clientConflict, clientHas, clientIs);
            conflictBookingId = clientConflict.id;
            conflictBookingType = clientConflict.type;
        } else if (clientLeading) {
            available = false;
            reason = `${clientIs} leading a session`;
            conflictBookingId = clientLeading.id;
            conflictBookingType = 'pt';
        } else if (partner && partnerConflict) {
            available = false;
            reason = personBusyReason(partnerConflict, `${partner.firstName} has`, `${partner.firstName} is`);
            conflictBookingId = partnerConflict.id;
            conflictBookingType = partnerConflict.type;
        }

        // The session occupies a gym place for its whole hour, so every
        // 15-minute step within it needs room.
        let gymAttendees = 0;
        for (let offset = 0; offset < durationMinutes; offset += SLOT_STEP_MINUTES) {
            const step = checkSlotAvailability(addMinutes(slotStart, offset), gymBookings);
            gymAttendees = Math.max(gymAttendees, step.count);
            if (available && !step.available) {
                available = false;
                reason = step.blockReason || 'Gym full';
            }
        }

        slots.push({
            time: slotStart,
            endTime: slotEnd,
            available,
            reason,
            gymAttendees,
            conflictBookingId,
            conflictBookingType,
        });
    }

    return { slots, window };
};
