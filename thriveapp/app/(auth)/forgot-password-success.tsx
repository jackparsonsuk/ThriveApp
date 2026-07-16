import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import { Button } from '@/components/ui';

export default function ForgotPasswordSuccessScreen() {
    const router = useRouter();
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <Head>
                <title>Email Sent | Thrive Collective</title>
            </Head>
            <Image
                source={require('../../assets/images/TC_Monogram_White.png')}
                style={[styles.logo, colorScheme === 'light' && { tintColor: '#000' }]}
                resizeMode="contain"
            />
            <Text style={[styles.title, { color: theme.text }]}>Check your email</Text>

            <View style={styles.content}>
                <Text style={[styles.message, { color: theme.text }]}>
                    We've sent a password reset link to your email address.
                </Text>

                <View style={[styles.alertBox, { backgroundColor: theme.tintMuted, borderColor: theme.tint }]}>
                    <Text style={[styles.alertTitle, { color: theme.tint }]}>Didn't receive it?</Text>
                    <Text style={[styles.alertText, { color: theme.tint }]}>
                        Please check your spam folder or promotions tab. It may take a few minutes to arrive.
                    </Text>
                </View>

                <Button variant="primary" label="Return to Log In" onPress={() => router.push('/(auth)/login')} />
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
        marginBottom: Spacing.xxl + 6,
        textAlign: 'center',
    },
    content: {
        gap: Spacing.xl,
    },
    message: {
        ...Typography.body,
        textAlign: 'center',
        lineHeight: 24,
    },
    alertBox: {
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: Radii.lg,
        padding: Spacing.xl,
        marginTop: Spacing.sm,
        marginBottom: Spacing.sm,
    },
    alertTitle: {
        ...Typography.bodyMedium,
        fontWeight: '700',
        marginBottom: Spacing.sm,
    },
    alertText: {
        ...Typography.footnote,
        lineHeight: 20,
        opacity: 0.9,
    },
});
