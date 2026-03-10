import { collection, query, where, getDocs, addDoc, Timestamp, doc, getDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../config/firebaseConfig';
import { addMinutes, startOfDay, endOfDay, isBefore, isAfter, isEqual, addDays, addWeeks, addMonths } from 'date-fns';

export interface Booking {
    id?: string;
    userId: string;
    startTime: Date;
    endTime: Date;
    type: 'gym' | 'pt' | 'group' | 'block';
    ptId?: string;
    groupId?: string;
    reason?: string; // For blocks
    status: 'confirmed' | 'cancelled';
    recurringTemplateId?: string; // Links this instance to a master recurring template
    isException?: boolean; // True if this instance was individually modified from the template
}

export interface RecurringSessionTemplate {
    id?: string;
    userId: string; // The client
    ptId: string;   // The PT providing the session
    type: 'pt';
    frequency: 'daily' | 'weekly' | 'bi-weekly' | 'monthly';
    startTime: Date; // Contains both the start date of the series and the time of day
    endTime: Date;   // Contains the end time of day
    endDate?: Date;  // Optional: When this recurring series ends
    status: 'active' | 'cancelled';
}

export interface UserProfile {
    id: string;
    name: string;
    email: string;
    role: 'client' | 'pt' | 'admin';
    assignedPtId: string | null;
}

export interface GroupSession {
    id?: string;
    title: string;
    startTime: Date;
    endTime: Date;
    maxCapacity: number;
    currentBookings: number;
}

const BOOKINGS_COLLECTION = 'bookings';
const USERS_COLLECTION = 'users';
const GROUP_SESSIONS_COLLECTION = 'group_sessions';
const RECURRING_TEMPLATES_COLLECTION = 'recurring_templates';

// Fetch user profile to get assigned PT
export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
    const userDoc = await getDoc(doc(db, USERS_COLLECTION, userId));
    if (userDoc.exists()) {
        return userDoc.data() as UserProfile;
    }
    return null;
};

// Fetch all bookings for a user
export const getUserBookings = async (userId: string): Promise<Booking[]> => {
    const q = query(
        collection(db, BOOKINGS_COLLECTION),
        where('userId', '==', userId),
        where('status', '==', 'confirmed')
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        startTime: doc.data().startTime.toDate(),
        endTime: doc.data().endTime.toDate(),
    })) as Booking[];
};

// Fetch all bookings for a user on a specific date (to check for conflicts)
export const getUserBookingsForDate = async (userId: string, date: Date): Promise<Booking[]> => {
    const start = startOfDay(date);
    const end = endOfDay(date);

    const q = query(
        collection(db, BOOKINGS_COLLECTION),
        where('userId', '==', userId),
        where('status', '==', 'confirmed'),
        where('startTime', '>=', start),
        where('startTime', '<=', end)
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        startTime: doc.data().startTime.toDate(),
        endTime: doc.data().endTime.toDate(),
    })) as Booking[];
};

// Fetch bookings where the PT is the instructor
export const getPTBookingsForInstructor = async (ptId: string): Promise<Booking[]> => {
    const q = query(
        collection(db, BOOKINGS_COLLECTION),
        where('ptId', '==', ptId),
        where('status', '==', 'confirmed')
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        startTime: doc.data().startTime.toDate(),
        endTime: doc.data().endTime.toDate(),
    })) as Booking[];
};

// Fetch gym bookings for a specific day to check capacity
export const getGymBookingsForDate = async (date: Date): Promise<Booking[]> => {
    const start = startOfDay(date);
    const end = endOfDay(date);

    const q = query(
        collection(db, BOOKINGS_COLLECTION),
        where('type', 'in', ['gym', 'pt', 'block']),
        where('status', '==', 'confirmed'),
        where('startTime', '>=', start),
        where('startTime', '<=', end)
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        startTime: doc.data().startTime.toDate(),
        endTime: doc.data().endTime.toDate(),
    })) as Booking[];
};

// Fetch PT bookings for a specific day and specific PT to check availability
export const getPTBookingsForDate = async (date: Date, ptId: string): Promise<Booking[]> => {
    const start = startOfDay(date);
    const end = endOfDay(date);

    const q1 = query(
        collection(db, BOOKINGS_COLLECTION),
        where('type', '==', 'pt'),
        where('ptId', '==', ptId),
        where('status', '==', 'confirmed'),
        where('startTime', '>=', start),
        where('startTime', '<=', end)
    );

    const q2 = query(
        collection(db, BOOKINGS_COLLECTION),
        where('type', '==', 'block'),
        where('status', '==', 'confirmed'),
        where('startTime', '>=', start),
        where('startTime', '<=', end)
    );

    const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);

    const docs = [...snap1.docs, ...snap2.docs];

    // De-duplicate in case of any overlap (shouldn't be, but good practice)
    const uniqueDocs = Array.from(new Map(docs.map(doc => [doc.id, doc])).values());

    return uniqueDocs.map(d => ({
        id: d.id,
        ...d.data(),
        startTime: d.data().startTime.toDate(),
        endTime: d.data().endTime.toDate(),
    })) as Booking[];
};

// Validation: Check if a 15-min slot is available (max 4 people)
export const checkSlotAvailability = (targetTime: Date, dayBookings: Booking[]): { available: boolean; count: number; blockReason?: string } => {
    // A gym booking is usually 1 hour, so we count any booking that overlaps the target 15-min slot.
    const targetEnd = addMinutes(targetTime, 15);

    const overlappingBookings = dayBookings.filter(b => {
        // Overlaps if booking starts before targetEnd AND booking ends after targetTime
        return b.startTime < targetEnd && b.endTime > targetTime;
    });

    // Count unique active people (Gym or PT type)
    // We de-duplicate by ID because the same session might be passed as both 'pt' and 'block' (for the PT/Client themselves)
    const uniqueBookings = Array.from(new Map(overlappingBookings.filter(b => b.id).map(b => [b.id, b])).values());
    const activeCount = uniqueBookings.filter(b => b.type === 'gym' || b.type === 'pt').length;

    // If there is ANY 'block' booking in this slot, it's instantly unavailable for the user
    const blockBooking = overlappingBookings.find(b => b.type === 'block');
    if (blockBooking) return { available: false, count: activeCount, blockReason: blockBooking.reason || 'Blocked' };

    return {
        available: activeCount < 4,
        count: activeCount
    };
};

// Create a new booking
export const createBooking = async (bookingData: Omit<Booking, 'id'>) => {
    const docRef = await addDoc(collection(db, BOOKINGS_COLLECTION), {
        ...bookingData,
        startTime: Timestamp.fromDate(bookingData.startTime),
        endTime: Timestamp.fromDate(bookingData.endTime),
    });
    return docRef.id;
};

// Fetch all available group sessions for the future
export const getUpcomingGroupSessions = async (): Promise<GroupSession[]> => {
    const q = query(
        collection(db, GROUP_SESSIONS_COLLECTION),
        where('startTime', '>=', new Date())
    );

    const querySnapshot = await getDocs(q);

    // Also fetch how many bookings exist for each group session
    const sessions = await Promise.all(querySnapshot.docs.map(async (docSnap) => {
        const data = docSnap.data();
        const sessionId = docSnap.id;

        const bookingsQuery = query(
            collection(db, BOOKINGS_COLLECTION),
            where('type', '==', 'group'),
            where('groupId', '==', sessionId),
            where('status', '==', 'confirmed')
        );
        const bookingsSnapshot = await getDocs(bookingsQuery);

        return {
            id: sessionId,
            title: data.title,
            startTime: data.startTime.toDate(),
            endTime: data.endTime.toDate(),
            maxCapacity: data.maxCapacity || 10,
            currentBookings: bookingsSnapshot.docs.length
        } as GroupSession;
    }));

    // Sort by start time manually to ensure it works correctly
    return sessions.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
};

// Create a group booking
export const createGroupBooking = async (userId: string, groupId: string, startTime: Date, endTime: Date) => {
    const docRef = await addDoc(collection(db, BOOKINGS_COLLECTION), {
        userId,
        startTime: Timestamp.fromDate(startTime),
        endTime: Timestamp.fromDate(endTime),
        type: 'group',
        groupId: groupId,
        status: 'confirmed'
    });
    return docRef.id;
};

// Cancel a single booking
export const cancelBooking = async (bookingId: string) => {
    const bookingRef = doc(db, BOOKINGS_COLLECTION, bookingId);
    await updateDoc(bookingRef, { status: 'cancelled' });
};

// Cancel a recurring template and all of its FUTURE materialized occurrences
export const cancelRecurringSeries = async (templateId: string, fromDate: Date) => {
    const batch = writeBatch(db);

    // 1. Mark the template as cancelled (or set an explicit endDate if we just want it to stop generating)
    const templateRef = doc(db, RECURRING_TEMPLATES_COLLECTION, templateId);
    batch.update(templateRef, { status: 'cancelled', endDate: Timestamp.fromDate(fromDate) });

    // 2. Query all future occurrences that have NOT happened yet and belong to this template
    const q = query(
        collection(db, BOOKINGS_COLLECTION),
        where('recurringTemplateId', '==', templateId),
        where('startTime', '>=', startOfDay(fromDate)),
        where('status', '==', 'confirmed')
    );
    const snapshot = await getDocs(q);

    // 3. Mark all future occurrences as cancelled
    snapshot.docs.forEach((docSnap) => {
        batch.update(docSnap.ref, { status: 'cancelled' });
    });

    await batch.commit();
};

// Fetch all clients (Admin/PT view)
export const getAllClients = async (): Promise<UserProfile[]> => {
    const q = query(
        collection(db, USERS_COLLECTION),
        where('role', '==', 'client')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as UserProfile));
};

// Fetch all PTs (Admin view)
export const getAllPTs = async (): Promise<UserProfile[]> => {
    const q = query(
        collection(db, USERS_COLLECTION),
        where('role', '==', 'pt')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as UserProfile));
};

// Assign a client to a PT
export const assignClientToPt = async (clientId: string, ptId: string | null) => {
    const userRef = doc(db, USERS_COLLECTION, clientId);
    await updateDoc(userRef, { assignedPtId: ptId });
};

// Fetch clients assigned to a specific PT
export const getClientsForPt = async (ptId: string): Promise<UserProfile[]> => {
    const q = query(
        collection(db, USERS_COLLECTION),
        where('assignedPtId', '==', ptId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as UserProfile));
};

// --- ADMIN FEATURES ---

// Fetch all bookings for a given date across the whole app
export const getAllBookingsForDate = async (date: Date): Promise<(Booking & { user?: UserProfile })[]> => {
    const start = startOfDay(date);
    const end = endOfDay(date);

    const q = query(
        collection(db, BOOKINGS_COLLECTION),
        where('status', '==', 'confirmed'),
        where('startTime', '>=', start),
        where('startTime', '<=', end)
    );

    const querySnapshot = await getDocs(q);
    const bookings = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        startTime: doc.data().startTime.toDate(),
        endTime: doc.data().endTime.toDate(),
    })) as Booking[];

    // Hydrate with user data
    const hydratedBookings = await Promise.all(bookings.map(async (booking) => {
        if (booking.type === 'block') {
            return booking;
        }
        const userProfile = await getUserProfile(booking.userId);
        return {
            ...booking,
            user: userProfile || undefined
        };
    }));

    return hydratedBookings;
};

// Block out a specific slot
export const blockOutSlot = async (adminId: string, startTime: Date, endTime: Date, reason: string) => {
    const docRef = await addDoc(collection(db, BOOKINGS_COLLECTION), {
        userId: adminId,
        startTime: Timestamp.fromDate(startTime),
        endTime: Timestamp.fromDate(endTime),
        type: 'block',
        reason: reason,
        status: 'confirmed'
    });
    return docRef.id;
};

// --- RECURRING SESSIONS ---

// Create a recurring session template and initial materialized instances
export const createRecurringSession = async (
    templateData: Omit<RecurringSessionTemplate, 'id'>, 
    monthsToGenerate = 3 // Generate 3 months in advance locally initially
) => {
    const batch = writeBatch(db);

    // 1. Create the master template document
    const templateRef = doc(collection(db, RECURRING_TEMPLATES_COLLECTION));
    batch.set(templateRef, {
        ...templateData,
        startTime: Timestamp.fromDate(templateData.startTime),
        endTime: Timestamp.fromDate(templateData.endTime),
        endDate: templateData.endDate ? Timestamp.fromDate(templateData.endDate) : null,
    });

    const templateId = templateRef.id;

    // 2. Generate initial materialized occurrences
    let currentStart = new Date(templateData.startTime);
    let currentEnd = new Date(templateData.endTime);
    
    // Stop generating if we hit the explicit end date, or the max forward generation time
    const maxGenerationDate = addMonths(new Date(), monthsToGenerate);
    const hardStopDate = templateData.endDate && isBefore(templateData.endDate, maxGenerationDate)
        ? templateData.endDate
        : maxGenerationDate;

    while (isBefore(currentStart, hardStopDate) || isEqual(currentStart, hardStopDate)) {
        const instanceRef = doc(collection(db, BOOKINGS_COLLECTION));
        batch.set(instanceRef, {
            userId: templateData.userId,
            ptId: templateData.ptId,
            type: templateData.type,
            status: 'confirmed',
            startTime: Timestamp.fromDate(currentStart),
            endTime: Timestamp.fromDate(currentEnd),
            recurringTemplateId: templateId,
            isException: false
        });

        // Increment time based on frequency
        if (templateData.frequency === 'daily') {
            currentStart = addDays(currentStart, 1);
            currentEnd = addDays(currentEnd, 1);
        } else if (templateData.frequency === 'weekly') {
            currentStart = addWeeks(currentStart, 1);
            currentEnd = addWeeks(currentEnd, 1);
        } else if (templateData.frequency === 'bi-weekly') {
            currentStart = addWeeks(currentStart, 2);
            currentEnd = addWeeks(currentEnd, 2);
        } else if (templateData.frequency === 'monthly') {
            currentStart = addMonths(currentStart, 1);
            currentEnd = addMonths(currentEnd, 1);
        }
    }

    // Commit the batch write (atomic creation of template and instances)
    await batch.commit();

    return templateId;
};

// Generate future instances for an existing template (e.g. called from a cron job)
// This is a stub for the logic that the background function will use, but can also
// be run manually if needed to extend existing windows.
export const generateFutureRecurringInstances = async (templateId: string, uptoDate: Date) => {
    const templateDoc = await getDoc(doc(db, RECURRING_TEMPLATES_COLLECTION, templateId));
    if (!templateDoc.exists()) return;

    const data = templateDoc.data();
    if (data.status !== 'active') return;
    
    // Look up the latest booking instance for this template to know where to resume
    const q = query(
        collection(db, BOOKINGS_COLLECTION),
        where('recurringTemplateId', '==', templateId),
        // Normally we'd order by startTime desc, limit 1. But Firestore requires index.
        // For simplicity, we can fetch all and sort in memory if the dataset is small, or require an index.
    );
    // ... complete implementation would require an index on recurringTemplateId + startTime
};

// --- ANALYTICS ---

export interface AnalyticsData {
    bookingsToday: number;
    bookingsThisWeek: number;
    ptSessionsToday: number;
    ptSessionsThisWeek: number;
    cancelledToday: number;
    cancelledThisWeek: number;
    ptBreakdown: {
        ptId: string;
        ptName: string;
        count: number;
    }[];
}

export const getAnalyticsData = async (): Promise<AnalyticsData> => {
    const now = new Date();
    const startOfToday = startOfDay(now);
    const endOfToday = endOfDay(now);
    const startOfWeek = addDays(startOfToday, -now.getDay()); // Sunday
    const endOfWeek = addDays(startOfWeek, 6);
    endOfWeek.setHours(23, 59, 59, 999);

    // Fetch all bookings for the week (to process in memory for efficiency vs multiple queries)
    const q = query(
        collection(db, BOOKINGS_COLLECTION),
        where('startTime', '>=', Timestamp.fromDate(startOfWeek)),
        where('startTime', '<=', Timestamp.fromDate(endOfWeek))
    );

    const snapshot = await getDocs(q);
    const allBookings = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        startTime: doc.data().startTime.toDate(),
        endTime: doc.data().endTime.toDate(),
    })) as Booking[];

    const pts = await getAllPTs();
    const ptMap = new Map(pts.map(p => [p.id, p.name]));

    const stats: AnalyticsData = {
        bookingsToday: 0,
        bookingsThisWeek: 0,
        ptSessionsToday: 0,
        ptSessionsThisWeek: 0,
        cancelledToday: 0,
        cancelledThisWeek: 0,
        ptBreakdown: pts.map(p => ({ ptId: p.id, ptName: p.name, count: 0 }))
    };

    allBookings.forEach(b => {
        const isToday = b.startTime >= startOfToday && b.startTime <= endOfToday;
        
        if (b.status === 'confirmed') {
            stats.bookingsThisWeek++;
            if (isToday) stats.bookingsToday++;

            if (b.type === 'pt') {
                stats.ptSessionsThisWeek++;
                if (isToday) stats.ptSessionsToday++;

                if (b.ptId) {
                    const ptStat = stats.ptBreakdown.find(p => p.ptId === b.ptId);
                    if (ptStat && isToday) {
                        ptStat.count++;
                    }
                }
            }
        } else if (b.status === 'cancelled') {
            stats.cancelledThisWeek++;
            if (isToday) stats.cancelledToday++;
        }
    });

    return stats;
};
