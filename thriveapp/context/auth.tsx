import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../config/firebaseConfig';
import type { UserProfile } from '../services/bookingService';
import { useRouter, useSegments } from 'expo-router';

interface AuthContextType {
    user: User | null;
    isLoading: boolean;
    /** The signed-in user's Firestore profile, kept live so every screen shares one read. */
    profile: UserProfile | null;
    /** True until the first copy of the profile has arrived for the signed-in user. */
    profileLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    isLoading: true,
    profile: null,
    profileLoading: true,
});

export function useAuth() {
    return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [profileUid, setProfileUid] = useState<string | null>(null);
    const segments = useSegments();
    const router = useRouter();

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
            setUser(firebaseUser);
            setIsLoading(false);
        });
        return unsubscribe;
    }, []);

    useEffect(() => {
        if (!user) {
            setProfile(null);
            setProfileUid(null);
            return;
        }
        const uid = user.uid;
        return onSnapshot(
            doc(db, 'users', uid),
            snap => {
                setProfile(snap.exists() ? (snap.data() as UserProfile) : null);
                setProfileUid(uid);
            },
            error => {
                console.error('Error watching user profile:', error);
                setProfile(null);
                setProfileUid(uid);
            }
        );
    }, [user]);

    // Loading until the profile we hold belongs to the user who is signed in now
    const profileLoading = isLoading || (!!user && profileUid !== user.uid);

    useEffect(() => {
        if (isLoading) return;

        const inAuthGroup = segments[0] === '(auth)';

        if (!user && !inAuthGroup) {
            // Redirect to login if user is not authenticated and trying to access an app route
            router.replace('/(auth)/login');
        } else if (user && inAuthGroup) {
            // Redirect to dashboard if user is authenticated and trying to access auth screens
            router.replace('/(tabs)');
        }
    }, [user, isLoading, segments]);

    return (
        <AuthContext.Provider value={{ user, isLoading, profile: profileLoading ? null : profile, profileLoading }}>
            {children}
        </AuthContext.Provider>
    );
}
