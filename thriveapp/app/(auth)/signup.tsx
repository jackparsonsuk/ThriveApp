import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView, Image } from 'react-native';
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { setDoc, doc } from 'firebase/firestore';
import { auth, db } from '../../config/firebaseConfig';

export default function SignUpScreen() {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleSignUp = async () => {
        if (!name || !email || !password) {
            Alert.alert('Error', 'Please fill in all fields');
            return;
        }

        try {
            setLoading(true);
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);

            // Store additional user formatting in Firestore
            await setDoc(doc(db, 'users', userCredential.user.uid), {
                id: userCredential.user.uid,
                name: name,
                email: email,
                role: 'client', // Default role
                assignedPtId: null,
            });

            // The context will automatically redirect upon successful login
        } catch (error: any) {
            Alert.alert('Sign Up Error', error.message || 'Failed to create account');
        } finally {
            setLoading(false);
        }
    };

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Head>
                <title>Create Account | Thrive Collective</title>
            </Head>
            <Image source={require('../../assets/images/TC_Monogram_White.png')} style={styles.logo} />
            <Text style={styles.title}>Create Account</Text>

            <View style={styles.form}>
                <TextInput
                    style={styles.input}
                    placeholder="Full Name"
                    placeholderTextColor="#737373"
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                />

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
                    onPress={handleSignUp}
                    disabled={loading}
                >
                    {loading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.buttonText}>Sign Up</Text>
                    )}
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.linkButton}
                    onPress={() => router.back()}
                >
                    <Text style={styles.linkText}>Already have an account? Log In</Text>
                </TouchableOpacity>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flexGrow: 1,
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
