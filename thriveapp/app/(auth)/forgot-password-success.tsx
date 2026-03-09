import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';

export default function ForgotPasswordSuccessScreen() {
    const router = useRouter();

    return (
        <View style={styles.container}>
            <Head>
                <title>Email Sent | Thrive Collective</title>
            </Head>
            <Image source={require('../../assets/images/TC_Monogram_White.png')} style={styles.logo} />
            <Text style={styles.title}>Check your email</Text>

            <View style={styles.content}>
                <Text style={styles.message}>
                    We've sent a password reset link to your email address.
                </Text>

                <View style={styles.alertBox}>
                    <Text style={styles.alertTitle}>Didn't receive it?</Text>
                    <Text style={styles.alertText}>
                        Please check your spam folder or promotions tab. It may take a few minutes to arrive.
                    </Text>
                </View>

                <TouchableOpacity
                    style={styles.button}
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
        backgroundColor: '#0a0a0a',
    },
    logo: {
        width: 80,
        height: 80,
        alignSelf: 'center',
        marginBottom: 20,
    },
    title: {
        fontSize: 28,
        fontWeight: '800',
        marginBottom: 30,
        textAlign: 'center',
        color: '#ffffff',
    },
    content: {
        gap: 20,
    },
    message: {
        fontSize: 16,
        color: '#e5e5e5',
        textAlign: 'center',
        lineHeight: 24,
    },
    alertBox: {
        backgroundColor: 'rgba(255, 90, 0, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(255, 90, 0, 0.3)',
        borderRadius: 16,
        padding: 20,
        marginTop: 10,
        marginBottom: 10,
    },
    alertTitle: {
        color: '#FF5A00',
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 8,
    },
    alertText: {
        color: '#FF5A00',
        fontSize: 14,
        lineHeight: 20,
        opacity: 0.9,
    },
    button: {
        backgroundColor: '#121212',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
        padding: 15,
        borderRadius: 9999,
        alignItems: 'center',
        marginTop: 10,
    },
    buttonText: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '700',
        textTransform: 'uppercase',
    },
});
