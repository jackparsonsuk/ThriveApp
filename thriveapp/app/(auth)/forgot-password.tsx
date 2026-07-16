import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Image } from 'react-native';
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../../config/firebaseConfig';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import { Button } from '@/components/ui';

export default function ForgotPasswordScreen() {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];

    const handleResetPassword = async () => {
        if (!email) {
            Alert.alert('Error', 'Please enter your email address');
            return;
        }

        try {
            setLoading(true);
            await sendPasswordResetEmail(auth, email);
            // Navigate to the success screen instead of showing an alert
            router.push('/(auth)/forgot-password-success');
        } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to send reset email');
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <Head>
                <title>Reset Password | Thrive Collective</title>
            </Head>
            <Image
                source={require('../../assets/images/TC_Monogram_White.png')}
                style={[styles.logo, colorScheme === 'light' && { tintColor: '#000' }]}
                resizeMode="contain"
            />
            <Text style={[styles.title, { color: theme.text }]}>Reset Password</Text>

            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                Enter your email address and we'll send you a link to reset your password.
            </Text>

            <View style={styles.form}>
                <TextInput
                    style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]}
                    placeholder="Email"
                    placeholderTextColor={theme.textTertiary}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                />

                <Button variant="primary" label="Send Reset Link" onPress={handleResetPassword} loading={loading} style={{ marginTop: Spacing.sm }} />

                <TouchableOpacity
                    style={styles.linkButton}
                    onPress={() => router.back()}
                >
                    <Text style={[styles.linkText, { color: theme.textSecondary }]}>Back to Log In</Text>
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
        marginBottom: Spacing.md,
        textAlign: 'center',
    },
    subtitle: {
        ...Typography.body,
        textAlign: 'center',
        marginBottom: Spacing.huge,
        paddingHorizontal: Spacing.xl,
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
});
