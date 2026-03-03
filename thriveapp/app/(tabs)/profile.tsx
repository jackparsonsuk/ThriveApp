import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../../config/firebaseConfig';
import { signOut } from 'firebase/auth';
import { useAuth } from '../../context/auth';
import { getUserProfile, UserProfile } from '../../services/bookingService';
import { Ionicons } from '@expo/vector-icons';
import CustomAlert from '../../components/CustomAlert';

export default function ProfileScreen() {
    const { user } = useAuth();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    // Custom Alert State
    const [alertConfig, setAlertConfig] = useState<{
        visible: boolean;
        title: string;
        message: string;
        isError?: boolean;
        isSuccess?: boolean;
        onConfirm?: () => void;
    }>({ visible: false, title: '', message: '' });

    const closeAlert = () => setAlertConfig(prev => ({ ...prev, visible: false }));

    const fetchProfileAndData = async () => {
        if (!user) return;
        try {
            const p = await getUserProfile(user.uid);
            setProfile(p);
        } catch (error) {
            console.error('Error fetching profile data:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProfileAndData();
    }, [user]);

    const handleLogout = async () => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error('Error signing out:', error);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Profile</Text>
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                {loading ? (
                    <ActivityIndicator size="large" color="#F26122" />
                ) : (
                    <>
                        <View style={styles.infoCard}>
                            <View style={styles.avatarCircle}>
                                <Ionicons name="person" size={40} color="#fff" />
                            </View>
                            <Text style={styles.nameText}>{profile?.name}</Text>
                            <Text style={styles.emailText}>{profile?.email}</Text>
                            <View style={styles.badge}>
                                <Text style={styles.badgeText}>{profile?.role?.toUpperCase()}</Text>
                            </View>
                        </View>

                        <View style={{ flex: 1, justifyContent: 'flex-end', marginTop: 40 }}>
                            <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                                <Ionicons name="log-out-outline" size={20} color="#f44336" style={{ marginRight: 10 }} />
                                <Text style={styles.logoutButtonText}>Log Out</Text>
                            </TouchableOpacity>
                            <Text style={styles.versionText}>Version 1.2.0</Text>
                        </View>
                    </>
                )}
            </ScrollView>

            <CustomAlert
                visible={alertConfig.visible}
                title={alertConfig.title}
                message={alertConfig.message}
                onClose={() => closeAlert()}
                onConfirm={alertConfig.onConfirm}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    header: {
        padding: 20,
        backgroundColor: '#333',
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#fff',
    },
    content: {
        flexGrow: 1,
        padding: 20,
    },
    infoCard: {
        alignItems: 'center',
        padding: 20,
        backgroundColor: '#f9f9f9',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#eee',
        marginBottom: 30,
    },
    avatarCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#F26122',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 15,
    },
    nameText: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 5,
    },
    emailText: {
        fontSize: 16,
        color: '#666',
        marginBottom: 10,
    },
    badge: {
        backgroundColor: '#333',
        paddingHorizontal: 15,
        paddingVertical: 5,
        borderRadius: 20,
    },
    badgeText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: 'bold',
    },
    logoutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 15,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#f44336',
        backgroundColor: '#ffebee',
    },
    logoutButtonText: {
        color: '#f44336',
        fontWeight: 'bold',
        fontSize: 16,
    },
    versionText: {
        textAlign: 'center',
        color: '#a3a3a3',
        fontSize: 12,
        marginTop: 20,
        fontWeight: '500',
    },
});
