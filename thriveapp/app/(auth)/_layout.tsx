import { Stack } from 'expo-router';

export default function AuthLayout() {
    return (
        <Stack>
            <Stack.Screen name="login" options={{ headerShown: false, title: 'Sign In' }} />
            <Stack.Screen name="signup" options={{ headerShown: false, title: 'Create Account' }} />
            <Stack.Screen name="forgot-password" options={{ headerShown: false, title: 'Reset Password' }} />
            <Stack.Screen name="forgot-password-success" options={{ headerShown: false, title: 'Email Sent' }} />
        </Stack>
    );
}
