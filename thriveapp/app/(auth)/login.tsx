import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../config/firebaseConfig';
import { useAuth } from '../../context/auth';

export default function LoginScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleLogin = async () => {
        if (!email || !password) {
            Alert.alert('Error', 'Please fill in all fields');
            return;
        }

        try {
            setLoading(true);
            await signInWithEmailAndPassword(auth, email, password);
            // The context will automatically redirect upon successful login
        } catch (error: any) {
            Alert.alert('Login Error', error.message || 'Failed to sign in');
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <Image source={require('../../assets/images/TC_Monogram_White.png')} style={styles.logo} />
            <Text style={styles.title}>Welcome back</Text>

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

                <TextInput
                    style={styles.input}
                    placeholder="Password"
                    placeholderTextColor="#737373"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                />

                <TouchableOpacity
                    style={styles.button}
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
                    <Text style={styles.linkText}>Don't have an account? Sign Up</Text>
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
        fontWeight: '800', // matches website typography
        marginBottom: 40,
        textAlign: 'center',
        color: '#ffffff',
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
        backgroundColor: '#FF5A00', // Premium Thrive Orange
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
