import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Image } from 'react-native';
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../../config/firebaseConfig';

export default function ForgotPasswordScreen() {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();

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
        <View style={styles.container}>
            <Head>
                <title>Reset Password | Thrive Collective</title>
            </Head>
            <Image source={require('../../assets/images/TC_Monogram_White.png')} style={styles.logo} />
            <Text style={styles.title}>Reset Password</Text>

            <Text style={styles.subtitle}>
                Enter your email address and we&apos;ll send you a link to reset your password.
            </Text>

            <View style={styles.form}>
                <TextInput
                    style={styles.input}
                    placeholder="Email"
                    placeholderTextColor="#737373"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                />

                <TouchableOpacity
                    style={styles.button}
                    onPress={handleResetPassword}
                    disabled={loading}
                >
                    {loading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.buttonText}>Send Reset Link</Text>
                    )}
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.linkButton}
                    onPress={() => router.back()}
                >
                    <Text style={styles.linkText}>Back to Log In</Text>
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
        marginBottom: 10,
        textAlign: 'center',
        color: '#ffffff',
    },
    subtitle: {
        fontSize: 16,
        color: '#a3a3a3',
        textAlign: 'center',
        marginBottom: 40,
        paddingHorizontal: 20,
    },
    form: {
        gap: 15,
    },
    input: {
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        backgroundColor: '#121212',
        padding: 15,
        borderRadius: 16,
        fontSize: 16,
        color: '#ffffff',
    },
    button: {
        backgroundColor: '#FF5A00',
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
    linkButton: {
        marginTop: 15,
        alignItems: 'center',
    },
    linkText: {
        color: '#a3a3a3',
        fontSize: 14,
        fontWeight: '500',
    },
});
