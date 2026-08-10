import { addMinutes, isBefore } from 'date-fns';
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
 */
export const getPtDayAvailability = async ({
    ptId,
    clientId,
    date,
    workingHours,
    ptFirstName = 'Your PT',
}: {
    ptId: string;
    clientId: string;
    date: Date;
    workingHours?: WorkingHours;
    ptFirstName?: string;
}): Promise<PtDayAvailability> => {
    const window = getWorkingWindowForDate(date, workingHours);
    if (!window) return { slots: [], window: null };

    const [ptSchedule, ptPersonal, clientBookings, gymBookings] = await Promise.all([
        getPTBookingsForDate(date, ptId),
        getPersonAllBookingsForDate(ptId, date),
        getPersonAllBookingsForDate(clientId, date),
        getGymBookingsForDate(date),
    ]);

    const slots: PtSlot[] = [];
    const now = new Date();
    let currentTime = window.start;

    while (addMinutes(currentTime, PT_SESSION_MINUTES) <= window.end) {
        const slotStart = currentTime;
        const slotEnd = addMinutes(slotStart, PT_SESSION_MINUTES);
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

        if (ptOwnBlock) {
            available = false;
            reason = `${ptFirstName} is unavailable`;
            conflictBookingId = ptOwnBlock.id;
            conflictBookingType = 'pt_block';
        } else if (ptSession) {
            available = false;
            // The clash may be the client's own request — say so from their side,
            // rather than making it sound like someone else took the slot.
            if (ptSession.userId === clientId) {
                reason = ptSession.status === 'pending' ? 'You already requested this time' : 'You have a session booked';
            } else {
                reason = ptSession.status === 'pending' ? `${ptFirstName} has a pending request` : `${ptFirstName} is booked`;
            }
            conflictBookingId = ptSession.id;
            conflictBookingType = 'pt';
        } else if (ptOtherBooking) {
            available = false;
            reason = ptOtherBooking.type === 'group' ? `${ptFirstName} has a class` : `${ptFirstName} is training`;
            conflictBookingId = ptOtherBooking.id;
            conflictBookingType = ptOtherBooking.type;
        } else if (gymWideBlock) {
            available = false;
            reason = gymWideBlock.reason || 'Gym closed';
            conflictBookingId = gymWideBlock.id ?? 'admin-block';
            conflictBookingType = 'block';
        } else if (clientConflict) {
            available = false;
            if (clientConflict.type === 'pt' && clientConflict.status === 'pending') reason = 'You already requested this time';
            else if (clientConflict.type === 'pt') reason = 'You have a PT session';
            else if (clientConflict.type === 'gym') reason = 'You have a gym session';
            else if (clientConflict.type === 'group') reason = 'You have a class';
            else reason = 'You are busy';
            conflictBookingId = clientConflict.id;
            conflictBookingType = clientConflict.type;
        }

        // The session occupies a gym place for its whole hour, so every
        // 15-minute step within it needs room.
        let gymAttendees = 0;
        for (let offset = 0; offset < PT_SESSION_MINUTES; offset += SLOT_STEP_MINUTES) {
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
