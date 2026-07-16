import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../config/firebaseConfig';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import { Button } from '@/components/ui';

export default function LoginScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const router = useRouter();
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];

    const getLoginErrorMessage = (code: string): string => {
        switch (code) {
            case 'auth/user-not-found':
            case 'auth/invalid-email':
                return 'No account found with that email address.';
            case 'auth/wrong-password':
            case 'auth/invalid-credential':
                return 'Incorrect password. Please try again.';
            case 'auth/too-many-requests':
                return 'Too many failed attempts. Your account has been temporarily locked. Please reset your password or try again later.';
            case 'auth/user-disabled':
                return 'This account has been disabled. Please contact support.';
            case 'auth/network-request-failed':
                return 'Network error. Please check your connection and try again.';
            default:
                return 'Sign in failed. Please check your details and try again.';
        }
    };

    const handleLogin = async () => {
        if (!email || !password) {
            setErrorMessage('Please fill in all fields.');
            return;
        }

        setErrorMessage(null);

        try {
            setLoading(true);
            await signInWithEmailAndPassword(auth, email, password);
            // The context will automatically redirect upon successful login
        } catch (error: any) {
            setErrorMessage(getLoginErrorMessage(error.code));
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <Head>
                <title>Sign In | Thrive Collective</title>
            </Head>
            <Image
                source={require('../../assets/images/TC_Monogram_White.png')}
                style={[styles.logo, colorScheme === 'light' && { tintColor: '#000' }]}
                resizeMode="contain"
            />
            <Text style={[styles.title, { color: theme.text }]}>Welcome back</Text>

            <View style={styles.form}>
                <TextInput
                    style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]}
                    placeholder="Email"
                    placeholderTextColor={theme.textTertiary}
                    value={email}
                    onChangeText={(v) => { setEmail(v); setErrorMessage(null); }}
                    autoCapitalize="none"
                    keyboardType="email-address"
                />

                <TextInput
                    style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]}
                    placeholder="Password"
                    placeholderTextColor={theme.textTertiary}
                    value={password}
                    onChangeText={(v) => { setPassword(v); setErrorMessage(null); }}
                    secureTextEntry
                />

                {errorMessage ? (
                    <View style={[styles.errorBox, { backgroundColor: theme.dangerMuted, borderColor: theme.danger }]}>
                        <Text style={[styles.errorText, { color: theme.danger }]}>{errorMessage}</Text>
                    </View>
                ) : null}

                <Button variant="primary" label="Log In" onPress={handleLogin} loading={loading} style={{ marginTop: Spacing.sm }} />

                <TouchableOpacity
                    style={styles.linkButton}
                    onPress={() => router.push('/signup')}
                >
                    <Text style={[styles.linkText, { color: theme.textSecondary }]}>Don't have an account? Sign Up</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.linkButton, { marginTop: 5 }]}
                    onPress={() => router.push('/forgot-password')}
                >
                    <Text style={[styles.linkText, { color: theme.textSecondary }]}>Forgot your password?</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        padding: Spacing.xl,
    },
    logo: {
        width: 80,
        height: 80,
        alignSelf: 'center',
        marginBottom: Spacing.xl,
    },
    title: {
        ...Typography.largeTitle,
        marginBottom: Spacing.huge,
        textAlign: 'center',
    },
    form: {
        gap: 15,
    },
    input: {
        borderWidth: StyleSheet.hairlineWidth,
        padding: Spacing.lg,
        borderRadius: Radii.md,
        fontSize: 16,
    },
    linkButton: {
        marginTop: Spacing.lg,
        alignItems: 'center',
    },
    linkText: {
        ...Typography.footnote,
    },
    errorBox: {
        borderWidth: 1,
        borderRadius: Radii.md,
        padding: Spacing.md,
    },
    errorText: {
        ...Typography.footnote,
        textAlign: 'center',
    },
});
