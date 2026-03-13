import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView, Image } from 'react-native';
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { setDoc, doc } from 'firebase/firestore';
import { auth, db } from '../../config/firebaseConfig';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radii } from '@/constants/theme';
import { getGlobalSettings } from '../../services/settingsService';
import { getAllPTs, assignClientToPt } from '../../services/bookingService';

export default function SignUpScreen() {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [signupCode, setSignupCode] = useState('');
    const [codeError, setCodeError] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];

    const handleSignUp = async () => {
        if (!name || !email || !password || !signupCode) {
            Alert.alert('Error', 'Please fill in all fields (including the signup code)');
            return;
        }

        try {
            setLoading(true);
            setCodeError('');
            
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
                canBookGym: false,
            });

            if (matchedPtId) {
                await assignClientToPt(userCredential.user.uid, matchedPtId);
            }

            // The context will automatically redirect upon successful login
        } catch (error: any) {
            Alert.alert('Sign Up Error', error.message || 'Failed to create account');
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
                    placeholderTextColor={theme.icon}
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                />

                <TextInput
                    style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]}
                    placeholder="Email"
                    placeholderTextColor={theme.icon}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                />

                <TextInput
                    style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]}
                    placeholder="Password"
                    placeholderTextColor={theme.icon}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                />

                <View>
                    <TextInput
                        style={[
                            styles.input, 
                            { backgroundColor: theme.card, borderColor: codeError ? '#ef4444' : theme.border, color: theme.text }
                        ]}
                        placeholder="Signup Code"
                        placeholderTextColor={theme.icon}
                        value={signupCode}
                        onChangeText={(text) => {
                            setSignupCode(text);
                            setCodeError('');
                        }}
                        autoCapitalize="none"
                    />
                    {codeError ? (
                        <Text style={styles.errorText}>{codeError}</Text>
                    ) : null}
                </View>

                <TouchableOpacity
                    style={[styles.button, { backgroundColor: theme.tint }]}
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
                    <Text style={[styles.linkText, { color: theme.icon }]}>Already have an account? Log In</Text>
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
    errorText: {
        color: '#ef4444',
        fontSize: 12,
        marginTop: 5,
        marginLeft: 4,
        fontWeight: '500',
    },
});
