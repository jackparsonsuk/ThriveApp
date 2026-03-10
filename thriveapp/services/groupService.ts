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

// Delete a group (clean up invites)
export const deleteGroup = async (groupId: string) => {
    const batch = writeBatch(db);
    
    // Delete the group itself
    batch.delete(doc(db, GROUPS_COLLECTION, groupId));
    
    // Delete all invites associated with this group
    const invitesQuery = query(collection(db, GROUP_INVITES_COLLECTION), where('groupId', '==', groupId));
    const invitesSnap = await getDocs(invitesQuery);
    
    invitesSnap.docs.forEach(inviteDoc => {
        batch.delete(inviteDoc.ref);
    });
    
    await batch.commit();
};

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
