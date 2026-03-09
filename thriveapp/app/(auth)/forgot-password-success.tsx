import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radii } from '@/constants/theme';

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

                <View style={[styles.alertBox, { backgroundColor: 'rgba(242, 97, 34, 0.1)', borderColor: 'rgba(242, 97, 34, 0.3)' }]}>
                    <Text style={[styles.alertTitle, { color: theme.tint }]}>Didn't receive it?</Text>
                    <Text style={[styles.alertText, { color: theme.tint }]}>
                        Please check your spam folder or promotions tab. It may take a few minutes to arrive.
                    </Text>
                </View>

                <TouchableOpacity
                    style={[styles.button, { backgroundColor: theme.tint }]}
                    onPress={() => router.push('/(auth)/login')}
                >
                    <Text style={styles.buttonText}>Return to Log In</Text>
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
        fontWeight: '700',
        marginBottom: 30,
        textAlign: 'center',
        letterSpacing: -0.5,
    },
    content: {
        gap: 20,
    },
    message: {
        fontSize: 16,
        textAlign: 'center',
        lineHeight: 24,
    },
    alertBox: {
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: Radii.lg,
        padding: 20,
        marginTop: 10,
        marginBottom: 10,
    },
    alertTitle: {
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 8,
    },
    alertText: {
        fontSize: 14,
        lineHeight: 20,
        opacity: 0.9,
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
});
