import { collection, query, where, getDocs, addDoc, Timestamp, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebaseConfig';
import { addMinutes, startOfDay, endOfDay, isBefore, isAfter, isEqual } from 'date-fns';

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

// Fetch gym bookings for a specific day to check capacity
export const getGymBookingsForDate = async (date: Date): Promise<Booking[]> => {
    const start = startOfDay(date);
    const end = endOfDay(date);

    const q = query(
        collection(db, BOOKINGS_COLLECTION),
        where('type', 'in', ['gym', 'block']),
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

// Validation: Check if a 30-min slot is available (max 4 people)
export const checkSlotAvailability = (targetTime: Date, dayBookings: Booking[]): { available: boolean; count: number } => {
    // A gym booking is usually 1 hour, so we count any booking that overlaps the target 30-min slot.
    // Bookings are like 10:00 to 11:00. If target is 10:30, it overlaps.
    const targetEnd = addMinutes(targetTime, 30);

    const overlappingBookings = dayBookings.filter(b => {
        // Overlaps if booking starts before targetEnd AND booking ends after targetTime
        return b.startTime < targetEnd && b.endTime > targetTime;
    });

    // If there is ANY 'block' booking in this slot, it's instantly unavailable
    const hasBlock = overlappingBookings.some(b => b.type === 'block');
    if (hasBlock) return { available: false, count: 0 };

    // Filter to only normal gym bookings to check capacity
    const gymBookings = overlappingBookings.filter(b => b.type === 'gym');

    return {
        available: gymBookings.length < 4,
        count: gymBookings.length
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

// Cancel a booking
export const cancelBooking = async (bookingId: string) => {
    const bookingRef = doc(db, BOOKINGS_COLLECTION, bookingId);
    await updateDoc(bookingRef, { status: 'cancelled' });
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
