import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../../config/firebaseConfig';
import { signOut } from 'firebase/auth';
import { useAuth } from '../../context/auth';
import { getUserProfile, getAllClients, getAllPTs, assignClientToPt, UserProfile } from '../../services/bookingService';
import { Ionicons } from '@expo/vector-icons';
import { confirmAlert, successAlert, errorAlert, infoAlert } from '../../utils/alert';

export default function ProfileScreen() {
    const { user } = useAuth();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [clients, setClients] = useState<UserProfile[]>([]);
    const [pts, setPts] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    const fetchProfileAndData = async () => {
        if (!user) return;
        try {
            const p = await getUserProfile(user.uid);
            setProfile(p);

            if (p?.role === 'admin' || p?.role === 'pt') {
                const [allClients, allPts] = await Promise.all([
                    getAllClients(),
                    getAllPTs()
                ]);
                setClients(allClients);
                setPts(allPts);
            }
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

    const handleAssign = (clientId: string, clientName: string) => {
        // Basic assignment flow for admin/pt
        if (profile?.role === 'pt') {
            // PTs assign themselves
            confirmAlert(
                'Assign Client',
                `Take on ${clientName} as your client?`,
                () => confirmAssignment(clientId, profile.id)
            );
        } else if (profile?.role === 'admin') {
            // Admins just see unassigned and we could build a picker, but for simplicity:
            // In this basic version, admins might just view or need a complex picker.
            // We'll just show them the list and say "PT assignment must be done by PT" for simplicity
            infoAlert('Admin Info', `Client: ${clientName}`);
        }
    };

    const confirmAssignment = async (clientId: string, ptId: string) => {
        setActionLoading(clientId);
        try {
            await assignClientToPt(clientId, ptId);
            successAlert('Success', 'Client assigned.');
            fetchProfileAndData();
        } catch (error) {
            errorAlert('Error', 'Failed to assign client.');
        } finally {
            setActionLoading(null);
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

                        {(profile?.role === 'admin' || profile?.role === 'pt') && (
                            <View style={styles.adminSection}>
                                <Text style={styles.sectionTitle}>Client Management</Text>

                                {clients.length === 0 ? (
                                    <Text style={styles.noClientsText}>No clients found.</Text>
                                ) : (
                                    <View style={styles.clientList}>
                                        {clients.map(client => (
                                            <View key={client.id} style={styles.clientCard}>
                                                <View style={styles.clientInfo}>
                                                    <Text style={styles.clientName}>{client.name}</Text>
                                                    <Text style={styles.clientDetail}>
                                                        {client.assignedPtId
                                                            ? `Assigned to: ${pts.find(p => p.id === client.assignedPtId)?.name || 'Unknown PT'}`
                                                            : 'Unassigned'}
                                                    </Text>
                                                </View>

                                                {profile.role === 'pt' && !client.assignedPtId && (
                                                    <TouchableOpacity
                                                        style={styles.assignButton}
                                                        onPress={() => handleAssign(client.id, client.name)}
                                                        disabled={!!actionLoading}
                                                    >
                                                        {actionLoading === client.id ? (
                                                            <ActivityIndicator size="small" color="#fff" />
                                                        ) : (
                                                            <Text style={styles.assignButtonText}>Take Client</Text>
                                                        )}
                                                    </TouchableOpacity>
                                                )}
                                            </View>
                                        ))}
                                    </View>
                                )}
                            </View>
                        )}

                        <View style={{ flex: 1, justifyContent: 'flex-end', marginTop: 40 }}>
                            <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                                <Ionicons name="log-out-outline" size={20} color="#f44336" style={{ marginRight: 10 }} />
                                <Text style={styles.logoutButtonText}>Log Out</Text>
                            </TouchableOpacity>
                        </View>
                    </>
                )}
            </ScrollView>
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
    adminSection: {
        marginBottom: 30,
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 15,
    },
    clientList: {
        gap: 10,
    },
    clientCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#eaeaea',
        borderRadius: 10,
        padding: 15,
    },
    clientInfo: {
        flex: 1,
    },
    clientName: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#333',
    },
    clientDetail: {
        fontSize: 14,
        color: '#888',
        marginTop: 4,
    },
    assignButton: {
        backgroundColor: '#F26122',
        paddingHorizontal: 15,
        paddingVertical: 8,
        borderRadius: 6,
    },
    assignButtonText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 14,
    },
    noClientsText: {
        color: '#888',
        fontStyle: 'italic',
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
});
