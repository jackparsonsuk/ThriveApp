import { collection, query, where, getDocs, addDoc, Timestamp, doc, getDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../config/firebaseConfig';
import { addMinutes, startOfDay, endOfDay, isBefore, isEqual, addDays, addWeeks, addMonths } from 'date-fns';

export interface Booking {
    id?: string;
    userId: string;
    startTime: Date;
    endTime: Date;
    type: 'gym' | 'pt' | 'group' | 'block';
    ptId?: string;
    groupId?: string;
    reason?: string; // For blocks
    status: 'confirmed' | 'cancelled' | 'pending';
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
    canBookGym?: boolean;
}


const BOOKINGS_COLLECTION = 'bookings';
const USERS_COLLECTION = 'users';
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

// Fetch upcoming sessions for a specific group
export const getGroupSessions = async (groupId: string): Promise<Booking[]> => {
    const q = query(
        collection(db, BOOKINGS_COLLECTION),
        where('type', '==', 'group'),
        where('groupId', '==', groupId),
        where('status', '==', 'confirmed'),
        where('startTime', '>=', new Date()) // Only fetch upcoming
    );

    const snapshot = await getDocs(q);
    
    const bookings = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        startTime: doc.data().startTime.toDate(),
        endTime: doc.data().endTime.toDate(),
    })) as Booking[];

    // Since each member gets a booking, there will be duplicates for the same time slot.
    // We only need one instance per unique start time for display purposes.
    const uniqueSessions = new Map<number, Booking>();
    bookings.forEach(b => {
        if (!uniqueSessions.has(b.startTime.getTime())) {
            uniqueSessions.set(b.startTime.getTime(), b);
        }
    });

    return Array.from(uniqueSessions.values()).sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
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

// Book a group session (blocks gym and creates bookings for members)
export const bookGroupSession = async (groupId: string, ptId: string, startTime: Date, endTime: Date) => {
    // 1. Fetch group to get member list and name
    const groupRef = doc(db, 'groups', groupId);
    const groupSnap = await getDoc(groupRef);
    if (!groupSnap.exists()) throw new Error('Group not found');
    const groupData = groupSnap.data();
    const memberIds: string[] = groupData.memberIds || [];

    const batch = writeBatch(db);

    // 2. Create the block for the gym (so no one else can book)
    const blockRef = doc(collection(db, BOOKINGS_COLLECTION));
    batch.set(blockRef, {
        userId: ptId,
        startTime: Timestamp.fromDate(startTime),
        endTime: Timestamp.fromDate(endTime),
        type: 'block',
        reason: `Group Session: ${groupData.name}`,
        status: 'confirmed'
    });

    // 3. Create individual bookings for the PT
    const ptBookingRef = doc(collection(db, BOOKINGS_COLLECTION));
    batch.set(ptBookingRef, {
        userId: ptId,
        ptId: ptId,
        startTime: Timestamp.fromDate(startTime),
        endTime: Timestamp.fromDate(endTime),
        type: 'group',
        groupId: groupId,
        status: 'confirmed'
    });

    // 4. Create individual bookings for each member
    for (const memberId of memberIds) {
        const memberBookingRef = doc(collection(db, BOOKINGS_COLLECTION));
        batch.set(memberBookingRef, {
            userId: memberId,
            ptId: ptId,
            startTime: Timestamp.fromDate(startTime),
            endTime: Timestamp.fromDate(endTime),
            type: 'group',
            groupId: groupId,
            status: 'confirmed'
        });
    }

    await batch.commit();
};


// Cancel a single booking (and related group/block bookings if applicable)
export const cancelBooking = async (bookingId: string) => {
    const bookingRef = doc(db, BOOKINGS_COLLECTION, bookingId);
    const bookingSnap = await getDoc(bookingRef);
    
    if (!bookingSnap.exists()) return;
    
    const data = bookingSnap.data() as Booking;
    
    const batch = writeBatch(db);
    batch.update(bookingRef, { status: 'cancelled' });

    // If it's a group booking, we must cancel all related member bookings and the block booking
    if (data.type === 'group' && data.groupId) {
        const start = data.startTime; // Timestamp
        
        // Find other group bookings for this exact group and time
        const groupBookingsQuery = query(
            collection(db, BOOKINGS_COLLECTION),
            where('type', '==', 'group'),
            where('groupId', '==', data.groupId),
            where('startTime', '==', start),
            where('status', '==', 'confirmed')
        );
        
        // Find the block booking for this group session
        // (Since block bookings don't store groupId, we match by time and type and user id)
        const blockBookingsQuery = query(
            collection(db, BOOKINGS_COLLECTION),
            where('type', '==', 'block'),
            where('startTime', '==', start),
            where('status', '==', 'confirmed')
        );
        
        const [groupSnap, blockSnap] = await Promise.all([
            getDocs(groupBookingsQuery),
            getDocs(blockBookingsQuery)
        ]);
        
        groupSnap.docs.forEach(docSnap => {
            if (docSnap.id !== bookingId) {
                batch.update(docSnap.ref, { status: 'cancelled' });
            }
        });
        
        blockSnap.docs.forEach(docSnap => {
            // Check if the reason starts with "Group Session" to be safe
            const blockData = docSnap.data();
            if (blockData.reason && blockData.reason.includes('Group Session')) {
                batch.update(docSnap.ref, { status: 'cancelled' });
            }
        });
    } else if (data.type === 'block' && data.reason && data.reason.includes('Group Session')) {
        // If they managed to click cancel on the block booking itself
        const start = data.startTime;
        const groupName = data.reason.replace('Group Session: ', '').trim();
        
        const groupBookingsQuery = query(
            collection(db, BOOKINGS_COLLECTION),
            where('type', '==', 'group'),
            where('startTime', '==', start),
            where('status', '==', 'confirmed')
        );
        
        const groupSnap = await getDocs(groupBookingsQuery);
        
        // As a fallback, we cancel group bookings at this time 
        groupSnap.docs.forEach(docSnap => {
            batch.update(docSnap.ref, { status: 'cancelled' });
        });
    }

    await batch.commit();
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

// Fetch all PTs (Admin view)
export const getAllPTs = async (): Promise<UserProfile[]> => {
    const q = query(
        collection(db, USERS_COLLECTION),
        where('role', 'in', ['pt', 'admin'])
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as UserProfile));
};

// Fetch all users (Admin view)
export const getAllUsers = async (): Promise<UserProfile[]> => {
    const q = query(collection(db, USERS_COLLECTION));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as UserProfile));
};

// Assign a client to a PT
export const assignClientToPt = async (clientId: string, ptId: string | null) => {
    const userRef = doc(db, USERS_COLLECTION, clientId);
    await updateDoc(userRef, { assignedPtId: ptId });
};

// Update arbitrary user profile fields (used by admin toggle)
export const updateUserProfile = async (userId: string, updates: Partial<Pick<UserProfile, 'canBookGym' | 'assignedPtId' | 'role'>>) => {
    await updateDoc(doc(db, USERS_COLLECTION, userId), updates);
};

// PT queries all pending requests assigned to them
export const getPendingPTRequestsForPT = async (ptId: string): Promise<Booking[]> => {
    const q = query(
        collection(db, BOOKINGS_COLLECTION),
        where('ptId', '==', ptId),
        where('status', '==', 'pending')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({
        id: d.id,
        ...d.data(),
        startTime: d.data().startTime.toDate(),
        endTime: d.data().endTime.toDate(),
    })) as Booking[];
};

// PT approves or declines a pending request
export const updateBookingStatus = async (bookingId: string, status: 'confirmed' | 'cancelled') => {
    await updateDoc(doc(db, BOOKINGS_COLLECTION, bookingId), { status });
};

// Client fetches their own pending bookings (all dates)
export const getUserPendingBookings = async (userId: string): Promise<Booking[]> => {
    const q = query(
        collection(db, BOOKINGS_COLLECTION),
        where('userId', '==', userId),
        where('status', '==', 'pending')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({
        id: d.id,
        ...d.data(),
        startTime: d.data().startTime.toDate(),
        endTime: d.data().endTime.toDate(),
    })) as Booking[];
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
