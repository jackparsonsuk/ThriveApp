import { db, auth } from '../config/firebaseConfig';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Platform } from 'react-native';

export interface ErrorLog {
    id: string;
    timestamp: any;
    userId: string | null;
    userEmail: string | null;
    message: string;
    stack: string | undefined;
}

/**
 * Logs an error to Firestore and returns a unique error ID.
 */
export async function logErrorToFirestore(error: Error | any): Promise<string> {
    const errorId = Math.random().toString(36).substring(2, 10).toUpperCase();
    const currentUser = auth.currentUser;

    const errorLog = {
        errorId,
        timestamp: serverTimestamp(),
        userId: currentUser?.uid || 'anonymous',
        userEmail: currentUser?.email || 'anonymous',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace available',
        platform: 'mobile/web', // You could expand this with actual platform info if needed
    };

    try {
        await addDoc(collection(db, 'error_logs'), errorLog);
        console.log(`Error logged with ID: ${errorId}`);
    } catch (err) {
        // Fallback if logging fails (e.g., no internet or Firestore rules)
        console.error('Failed to log error to Firestore:', err);
    }

    return errorId;
}

/**
 * Sets up global eye-catching for errors that occur outside of the React render cycle
 * (e.g., in event handlers, async code, etc.)
 */
export function setupGlobalErrorHandling() {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.onerror = (message, source, lineno, colno, error) => {
            logErrorToFirestore(error || new Error(String(message)));
        };
        window.onunhandledrejection = (event) => {
            logErrorToFirestore(new Error(`Unhandled Rejection: ${event.reason}`));
        };
    } else {
        // For React Native
        const globalHandler = (error: any, isFatal?: boolean) => {
            logErrorToFirestore(error);
            // Optionally: if (isFatal) { ... }
        };
        
        // This is the standard RN way to catch global errors
        if (typeof ErrorUtils !== 'undefined') {
            const previousHandler = ErrorUtils.getGlobalHandler();
            ErrorUtils.setGlobalHandler((error, isFatal) => {
                globalHandler(error, isFatal);
                if (previousHandler) {
                    previousHandler(error, isFatal);
                }
            });
        }
    }
}
