import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/auth';
import { getUpcomingGroupSessions, createGroupBooking, getUserBookings, GroupSession, Booking } from '../../services/bookingService';
import { format } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import CustomAlert from '../../components/CustomAlert';

export default function GroupBookingScreen() {
    const { user } = useAuth();
    const router = useRouter();
    const [sessions, setSessions] = useState<GroupSession[]>([]);
    const [userBookings, setUserBookings] = useState<Booking[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [bookingLoading, setBookingLoading] = useState<string | null>(null);

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

    const fetchData = async () => {
        if (!user) return;
        try {
            const [upcomingSessions, bookings] = await Promise.all([
                getUpcomingGroupSessions(),
                getUserBookings(user.uid)
            ]);
            setSessions(upcomingSessions);
            setUserBookings(bookings);
        } catch (error) {
            console.error('Error fetching group sessions:', error);
            setAlertConfig({
                visible: true,
                title: 'Error',
                message: 'Failed to load group sessions.',
                isError: true
            });
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [user]);

    const onRefresh = () => {
        setRefreshing(true);
        fetchData();
    };

    const isUserBooked = (sessionId: string) => {
        return userBookings.some(b => b.type === 'group' && (b.ptId === sessionId || (b as any).groupId === sessionId));
    };

    const handleBookSession = (session: GroupSession) => {
        if (!user) return;

        setAlertConfig({
            visible: true,
            title: 'Confirm Booking',
            message: `Book your spot for ${session.title}\n${format(session.startTime, 'EEE, MMM d • HH:mm')}?`,
            onConfirm: () => confirmBooking(session)
        });
    };

    const confirmBooking = async (session: GroupSession) => {
        if (!user || !session.id) return;

        setBookingLoading(session.id);
        try {
            await createGroupBooking(user.uid, session.id, session.startTime, session.endTime);

            setAlertConfig({
                visible: true,
                title: 'Success!',
                message: 'You have been booked onto ' + session.title,
                isSuccess: true,
                onConfirm: undefined
            });
            fetchData(); // Refresh slots
        } catch (error) {
            console.error('Error booking group session:', error);
            setAlertConfig({
                visible: true,
                title: 'Error',
                message: 'Failed to complete booking. Please try again.',
                isError: true
            });
        } finally {
            setBookingLoading(null);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Group Classes</Text>
                <Text style={styles.subtitle}>Find and book specialized group sessions</Text>
            </View>

            <ScrollView
                contentContainerStyle={styles.slotsContainer}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
                {loading ? (
                    <ActivityIndicator size="large" color="#F26122" style={{ marginTop: 50 }} />
                ) : sessions.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <Ionicons name="calendar-outline" size={48} color="#ccc" />
                        <Text style={styles.noSlotsText}>No upcoming group sessions found.</Text>
                        <Text style={styles.noSlotsSubText}>Check back later or pull to refresh.</Text>
                    </View>
                ) : (
                    <View style={styles.list}>
                        {sessions.map((session) => {
                            const availableSpots = session.maxCapacity - session.currentBookings;
                            const isFull = availableSpots <= 0;
                            const alreadyBooked = isUserBooked(session.id!);
                            const disabled = isFull || alreadyBooked || bookingLoading === session.id;

                            return (
                                <View key={session.id} style={styles.sessionCard}>
                                    <View style={styles.sessionInfo}>
                                        <Text style={styles.sessionTitle}>{session.title}</Text>
                                        <View style={styles.sessionTimeContainer}>
                                            <Ionicons name="time-outline" size={16} color="#666" style={{ marginRight: 5 }} />
                                            <Text style={styles.sessionTime}>
                                                {format(session.startTime, 'EEE, MMM d')} • {format(session.startTime, 'HH:mm')} - {format(session.endTime, 'HH:mm')}
                                            </Text>
                                        </View>
                                        <View style={styles.capacityContainer}>
                                            <Ionicons name="people-outline" size={16} color="#666" style={{ marginRight: 5 }} />
                                            <Text style={styles.capacityText}>
                                                {session.currentBookings} / {session.maxCapacity} Booked
                                            </Text>
                                        </View>
                                    </View>

                                    <TouchableOpacity
                                        style={[
                                            styles.bookButton,
                                            disabled && styles.bookButtonDisabled,
                                            alreadyBooked && styles.bookButtonBooked
                                        ]}
                                        disabled={disabled}
                                        onPress={() => handleBookSession(session)}
                                    >
                                        {bookingLoading === session.id ? (
                                            <ActivityIndicator size="small" color="#fff" />
                                        ) : (
                                            <Text style={[
                                                styles.bookButtonText,
                                                disabled && !alreadyBooked && styles.bookButtonTextDisabled
                                            ]}>
                                                {alreadyBooked ? 'Booked' : isFull ? 'Full' : 'Book'}
                                            </Text>
                                        )}
                                    </TouchableOpacity>
                                </View>
                            );
                        })}
                    </View>
                )}
            </ScrollView>

            <CustomAlert
                visible={alertConfig.visible}
                title={alertConfig.title}
                message={alertConfig.message}
                onClose={() => {
                    closeAlert();
                    if (alertConfig.isSuccess) {
                        router.push('/(tabs)');
                    }
                }}
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
    subtitle: {
        fontSize: 16,
        color: '#ccc',
        marginTop: 5,
    },
    slotsContainer: {
        padding: 20,
        flexGrow: 1,
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 80,
    },
    list: {
        gap: 15,
    },
    sessionCard: {
        backgroundColor: '#f9f9f9',
        borderRadius: 10,
        padding: 15,
        borderWidth: 1,
        borderColor: '#eee',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    sessionInfo: {
        flex: 1,
        paddingRight: 10,
    },
    sessionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 8,
    },
    sessionTimeContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
    },
    sessionTime: {
        fontSize: 14,
        color: '#666',
    },
    capacityContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    capacityText: {
        fontSize: 14,
        color: '#666',
    },
    bookButton: {
        backgroundColor: '#F26122',
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 8,
        minWidth: 90,
        alignItems: 'center',
    },
    bookButtonDisabled: {
        backgroundColor: '#e0e0e0',
    },
    bookButtonBooked: {
        backgroundColor: '#4caf50',
    },
    bookButtonText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 16,
    },
    bookButtonTextDisabled: {
        color: '#999',
    },
    noSlotsText: {
        textAlign: 'center',
        color: '#333',
        fontSize: 18,
        fontWeight: 'bold',
        marginTop: 15,
    },
    noSlotsSubText: {
        textAlign: 'center',
        color: '#888',
        fontSize: 14,
        marginTop: 5,
    }
});
