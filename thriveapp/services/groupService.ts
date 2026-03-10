import { collection, query, where, getDocs, addDoc, doc, getDoc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '../config/firebaseConfig';
import { UserProfile, getUserProfile } from './bookingService';

export interface Group {
    id?: string;
    ptId: string;
    name: string;
    memberIds: string[]; // List of user IDs who have accepted the invite
    createdAt: Date;
}

export interface GroupInvite {
    id?: string;
    groupId: string;
    email: string; // The email the invite was sent to
    status: 'pending' | 'accepted' | 'declined';
    createdAt: Date;
    groupName?: string; // Hydrated for UI convenience
    ptName?: string;    // Hydrated for UI convenience
}

const GROUPS_COLLECTION = 'groups';
const GROUP_INVITES_COLLECTION = 'group_invites';

// -- GROUPS --

// Create a new group
export const createGroup = async (ptId: string, name: string): Promise<string> => {
    const groupData: Omit<Group, 'id'> = {
        ptId,
        name,
        memberIds: [],
        createdAt: new Date()
    };
    
    const docRef = await addDoc(collection(db, GROUPS_COLLECTION), groupData);
    return docRef.id;
};

// Fetch groups owned by a PT
export const getPTGroups = async (ptId: string): Promise<Group[]> => {
    const q = query(
        collection(db, GROUPS_COLLECTION),
        where('ptId', '==', ptId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date()
    })) as Group[];
};

// Fetch groups a client is a member of
export const getClientGroups = async (userId: string): Promise<Group[]> => {
    const q = query(
        collection(db, GROUPS_COLLECTION),
        where('memberIds', 'array-contains', userId)
    );
    const snapshot = await getDocs(q);
    
    const clientGroups = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date()
    })) as Group[];

    // Hydrate the ptName for the UI
    const hydratedGroups = await Promise.all(clientGroups.map(async (group) => {
        let ptName = 'A Trainer';
        if (group.ptId) {
            const ptProfile = await getUserProfile(group.ptId);
            if (ptProfile) {
                ptName = ptProfile.name;
            }
        }
        return {
            ...group,
            ptName // Storing it dynamically on the object for display
        };
    }));

    return hydratedGroups;
};

// Fetch a single group by ID
export const getGroupById = async (groupId: string): Promise<Group | null> => {
    const docRef = doc(db, GROUPS_COLLECTION, groupId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        const data = docSnap.data();
        return {
            id: docSnap.id,
            ...data,
            createdAt: data.createdAt?.toDate() || new Date()
        } as Group;
    }
    return null;
};

// --- INVITES ---

// Invite a user to a group by email
export const inviteToGroup = async (groupId: string, email: string) => {
    // Basic check if invite already exists
    const q = query(
        collection(db, GROUP_INVITES_COLLECTION),
        where('groupId', '==', groupId),
        where('email', '==', email.toLowerCase())
    );
    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
        throw new Error('User has already been invited to this group.');
    }

    const inviteData: Omit<GroupInvite, 'id'> = {
        groupId,
        email: email.toLowerCase(),
        status: 'pending',
        createdAt: new Date(),
    };
    
    await addDoc(collection(db, GROUP_INVITES_COLLECTION), inviteData);
};

// Get pending invites for an email address
export const getPendingInvitesForEmail = async (email: string): Promise<GroupInvite[]> => {
    const q = query(
        collection(db, GROUP_INVITES_COLLECTION),
        where('email', '==', email.toLowerCase()),
        where('status', '==', 'pending')
    );
    const snapshot = await getDocs(q);
    
    const invites = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.() || new Date()
    } as GroupInvite));
    
    // Hydrate group name and PT name for the UI
    const hydratedInvites = await Promise.all(invites.map(async (invite) => {
        const group = await getGroupById(invite.groupId);
        let ptName = 'A Trainer';
        if (group?.ptId) {
            const ptProfile = await getUserProfile(group.ptId);
            if (ptProfile) {
                ptName = ptProfile.name;
            }
        }
        return {
            ...invite,
            groupName: group?.name || 'Unknown Group',
            ptName
        };
    }));
    
    return hydratedInvites;
};

// Accept an invite
export const acceptGroupInvite = async (inviteId: string, userId: string, groupId: string) => {
    const batch = writeBatch(db);
    
    // 1. Mark invite as accepted
    const inviteRef = doc(db, GROUP_INVITES_COLLECTION, inviteId);
    batch.update(inviteRef, { status: 'accepted' });
    
    // 2. Add user to group memberIds
    const groupRef = doc(db, GROUPS_COLLECTION, groupId);
    const groupSnap = await getDoc(groupRef);
    if (groupSnap.exists()) {
        const currentMembers = groupSnap.data().memberIds || [];
        if (!currentMembers.includes(userId)) {
            batch.update(groupRef, { memberIds: [...currentMembers, userId] });
        }
    }
    
    await batch.commit();
};

// Decline an invite
export const declineGroupInvite = async (inviteId: string) => {
    const inviteRef = doc(db, GROUP_INVITES_COLLECTION, inviteId);
    await updateDoc(inviteRef, { status: 'declined' });
};

// Get pending invites for an email address (omitted deleteGroup from here)
// Fetch members of a group
export const getGroupMembers = async (groupId: string): Promise<UserProfile[]> => {
    const group = await getGroupById(groupId);
    if (!group || !group.memberIds || group.memberIds.length === 0) return [];
    
    const members: UserProfile[] = [];
    for (const memberId of group.memberIds) {
        const profile = await getUserProfile(memberId);
        if (profile) {
            members.push(profile);
        }
    }
    return members;
};

// Fetch invites for a group (for PT view)
export const getGroupInvites = async (groupId: string): Promise<GroupInvite[]> => {
    const q = query(
        collection(db, GROUP_INVITES_COLLECTION),
        where('groupId', '==', groupId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.() || new Date()
    } as GroupInvite));
};

// Remove a member from a group and cancel their upcoming sessions
export const removeGroupMember = async (groupId: string, memberId: string) => {
    const batch = writeBatch(db);

    // 1. Remove member from group
    const groupRef = doc(db, GROUPS_COLLECTION, groupId);
    const groupSnap = await getDoc(groupRef);
    if (groupSnap.exists()) {
        const currentMembers = groupSnap.data().memberIds || [];
        const newMembers = currentMembers.filter((id: string) => id !== memberId);
        batch.update(groupRef, { memberIds: newMembers });
    }

    // 2. Find and cancel upcoming sessions for this member in this group
    const bookingsQuery = query(
        collection(db, 'bookings'), // BOOKINGS_COLLECTION isn't exported in this file, so hardcoded 'bookings'
        where('type', '==', 'group'),
        where('groupId', '==', groupId),
        where('userId', '==', memberId),
        where('status', '==', 'confirmed'),
        where('startTime', '>=', new Date())
    );

    const snapshot = await getDocs(bookingsQuery);
    snapshot.docs.forEach((docSnap) => {
        batch.update(docSnap.ref, { status: 'cancelled' });
    });

    await batch.commit();
};

// Delete a group completely and cascade cancel all its upcoming sessions
export const deleteGroup = async (groupId: string, groupName: string) => {
    const batch = writeBatch(db);

    // 1. Delete the group document
    const groupRef = doc(db, GROUPS_COLLECTION, groupId);
    batch.delete(groupRef);

    // 2. Cancel all upcoming sessions for this group (both group and block bookings)
    const bookingsQuery = query(
        collection(db, 'bookings'), 
        where('type', '==', 'group'),
        where('groupId', '==', groupId),
        where('status', '==', 'confirmed'),
        where('startTime', '>=', new Date())
    );

    const groupBookingsSnap = await getDocs(bookingsQuery);
    
    // Store unique startTimes to locate associated block bookings
    const startTimes = new Set<string>(); // Use stringified timestamp or object reference

    groupBookingsSnap.docs.forEach((docSnap) => {
        batch.update(docSnap.ref, { status: 'cancelled' });
        const start = docSnap.data().startTime;
        if (start && start.seconds) {
            startTimes.add(start.seconds.toString());
        }
    });

    // Process associated block bookings
    for (const secondsStr of startTimes) {
        const seconds = parseInt(secondsStr, 10);
        // Note: we can reconstruct a timestamp or just query
        // Since we don't have the exact Timestamp object handy easily in a Set,
        // we can query block bookings that are in the future and filter manually,
        // or just rely on the fact that `cancelBooking` already handles this nicely on the client
        // but since we're deleting the group, let's just do it.
        const startTimeObj = new Date(seconds * 1000);
        
        const blockQuery = query(
            collection(db, 'bookings'),
            where('type', '==', 'block'),
            where('startTime', '==', startTimeObj), // This might fail if Firestore expects Timestamp 
            // So we'll use a broader query or trust the UI.
            where('status', '==', 'confirmed')
        );
        const blockSnap = await getDocs(blockQuery);
        blockSnap.docs.forEach((bDoc) => {
            const bData = bDoc.data();
            if (bData.reason && bData.reason.includes(groupName)) {
                batch.update(bDoc.ref, { status: 'cancelled' });
            }
        });
    }

    // 3. Delete pending invites
    const invitesQuery = query(
        collection(db, GROUP_INVITES_COLLECTION),
        where('groupId', '==', groupId)
    );
    const invitesSnap = await getDocs(invitesQuery);
    invitesSnap.docs.forEach((docSnap) => {
        batch.delete(docSnap.ref);
    });

    await batch.commit();
};
