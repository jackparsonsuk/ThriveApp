import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Image } from 'react-native';
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { setDoc, doc } from 'firebase/firestore';
import { auth, db } from '../../config/firebaseConfig';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import { getGlobalSettings } from '../../services/settingsService';
import { getAllPTs, assignClientToPt } from '../../services/bookingService';
import { Button } from '@/components/ui';

const getSignUpErrorMessage = (code?: string, fallback?: string): string => {
    switch (code) {
        case 'auth/email-already-in-use':
            return 'An account with that email already exists. Try logging in instead.';
        case 'auth/invalid-email':
            return "That email address doesn't look right.";
        case 'auth/weak-password':
            return 'Please choose a password with at least 6 characters.';
        case 'auth/network-request-failed':
            return 'Network error. Please check your connection and try again.';
        default:
            return fallback || 'Could not create your account. Please try again.';
    }
};

export default function SignUpScreen() {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [signupCode, setSignupCode] = useState('');
    const [codeError, setCodeError] = useState('');
    // Shown inline: Alert.alert is a no-op on web, so errors used to vanish there
    const [formError, setFormError] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];

    const handleSignUp = async () => {
        if (!name || !email || !password || !signupCode) {
            setFormError('Please fill in every field, including the sign-up code.');
            return;
        }

        try {
            setLoading(true);
            setCodeError('');
            setFormError('');

            const trimmedCode = signupCode.trim();

            // Validate code before creating account — settings and PT profiles are publicly readable
            const settings = await getGlobalSettings();
            const isGlobalCode = !settings?.signupCode || settings.signupCode === trimmedCode;

            let matchedPtId: string | null = null;
            if (!isGlobalCode) {
                const pts = await getAllPTs();
                const matchedPt = pts.find(
                    pt => pt.id.substring(0, 6).toUpperCase() === trimmedCode.toUpperCase()
                );
                if (matchedPt) {
                    matchedPtId = matchedPt.id;
                } else {
                    setCodeError('The signup code you entered is incorrect.');
                    setLoading(false);
                    return;
                }
            }

            const userCredential = await createUserWithEmailAndPassword(auth, email, password);

            await setDoc(doc(db, 'users', userCredential.user.uid), {
                id: userCredential.user.uid,
                name: name,
                email: email,
                role: 'client',
                assignedPtId: matchedPtId,
                canBookGym: true,
            });

            if (matchedPtId) {
                await assignClientToPt(userCredential.user.uid, matchedPtId);
            }

            // The context will automatically redirect upon successful login
        } catch (error: any) {
            setFormError(getSignUpErrorMessage(error?.code, error?.message));
        } finally {
            setLoading(false);
        }
    };

    return (
        <ScrollView contentContainerStyle={[styles.container, { backgroundColor: theme.background }]}>
            <Head>
                <title>Create Account | Thrive Collective</title>
            </Head>
            <Image
                source={require('../../assets/images/TC_Monogram_White.png')}
                style={[styles.logo, colorScheme === 'light' && { tintColor: '#000' }]}
                resizeMode="contain"
            />
            <Text style={[styles.title, { color: theme.text }]}>Create Account</Text>

            <View style={styles.form}>
                <TextInput
                    style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]}
                    placeholder="Full Name"
                    placeholderTextColor={theme.textTertiary}
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                />

                <TextInput
                    style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]}
                    placeholder="Email"
                    placeholderTextColor={theme.textTertiary}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                />

                <TextInput
                    style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]}
                    placeholder="Password"
                    placeholderTextColor={theme.textTertiary}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                />

                <View>
                    <TextInput
                        style={[
                            styles.input,
                            { backgroundColor: theme.card, borderColor: codeError ? theme.danger : theme.border, color: theme.text }
                        ]}
                        placeholder="Signup Code"
                        placeholderTextColor={theme.textTertiary}
                        value={signupCode}
                        onChangeText={(text) => {
                            setSignupCode(text);
                            setCodeError('');
                        }}
                        autoCapitalize="none"
                    />
                    {codeError ? (
                        <Text style={[styles.errorText, { color: theme.danger }]}>{codeError}</Text>
                    ) : null}
                </View>

                {formError ? (
                    <View style={[styles.errorBox, { backgroundColor: theme.dangerMuted, borderColor: theme.danger }]} accessibilityRole="alert">
                        <Text style={[styles.errorBoxText, { color: theme.danger }]}>{formError}</Text>
                    </View>
                ) : null}

                <Button variant="primary" label="Sign Up" onPress={handleSignUp} loading={loading} style={{ marginTop: Spacing.sm }} />

                <TouchableOpacity
                    style={styles.linkButton}
                    onPress={() => router.back()}
                >
                    <Text style={[styles.linkText, { color: theme.textSecondary }]}>Already have an account? Log In</Text>
                </TouchableOpacity>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    errorBox: {
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: Radii.md,
        padding: Spacing.md,
    },
    errorBoxText: {
        ...Typography.footnote,
        textAlign: 'center',
    },
    container: {
        flexGrow: 1,
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
        width: '100%',
        maxWidth: 420,
        alignSelf: 'center',
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
    errorText: {
        fontSize: 12,
        marginTop: 5,
        marginLeft: 4,
        fontWeight: '500',
    },
});
