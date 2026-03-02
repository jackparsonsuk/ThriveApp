import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '../config/firebaseConfig';
import { useRouter, useSegments } from 'expo-router';

interface AuthContextType {
    user: User | null;
    isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    isLoading: true,
});

export function useAuth() {
    return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
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
        <AuthContext.Provider value={{ user, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
}
