import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Image } from 'react-native';
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../config/firebaseConfig';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radii } from '@/constants/theme';

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
                    placeholderTextColor={theme.icon}
                    value={email}
                    onChangeText={(v) => { setEmail(v); setErrorMessage(null); }}
                    autoCapitalize="none"
                    keyboardType="email-address"
                />

                <TextInput
                    style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]}
                    placeholder="Password"
                    placeholderTextColor={theme.icon}
                    value={password}
                    onChangeText={(v) => { setPassword(v); setErrorMessage(null); }}
                    secureTextEntry
                />

                {errorMessage ? (
                    <View style={styles.errorBox}>
                        <Text style={styles.errorText}>{errorMessage}</Text>
                    </View>
                ) : null}

                <TouchableOpacity
                    style={[styles.button, { backgroundColor: theme.tint }]}
                    onPress={handleLogin}
                    disabled={loading}
                >
                    {loading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.buttonText}>Log In</Text>
                    )}
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.linkButton}
                    onPress={() => router.push('/signup')}
                >
                    <Text style={[styles.linkText, { color: theme.icon }]}>Don't have an account? Sign Up</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.linkButton, { marginTop: 5 }]}
                    onPress={() => router.push('/forgot-password')}
                >
                    <Text style={[styles.linkText, { color: theme.icon }]}>Forgot your password?</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        padding: 20,
    },
    logo: {
        width: 80,
        height: 80,
        alignSelf: 'center',
        marginBottom: 20,
    },
    title: {
        fontSize: 34,
        fontWeight: '700', // matches website typography
        marginBottom: 40,
        textAlign: 'center',
        letterSpacing: -0.5,
    },
    form: {
        gap: 15,
    },
    input: {
        borderWidth: StyleSheet.hairlineWidth,
        padding: 16,
        borderRadius: Radii.md,
        fontSize: 16,
    },
    button: {
        padding: 16,
        borderRadius: Radii.pill,
        alignItems: 'center',
        marginTop: 10,
    },
    buttonText: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '600',
    },
    linkButton: {
        marginTop: 15,
        alignItems: 'center',
    },
    linkText: {
        fontSize: 14,
        fontWeight: '500',
    },
    errorBox: {
        backgroundColor: 'rgba(220, 38, 38, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(220, 38, 38, 0.4)',
        borderRadius: Radii.md,
        padding: 12,
    },
    errorText: {
        color: '#dc2626',
        fontSize: 14,
        textAlign: 'center',
    },
});
