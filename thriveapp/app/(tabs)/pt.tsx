import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/auth';
import { getUserProfile, getPTBookingsForDate, createBooking, UserProfile, getAllPTs, assignClientToPt, getClientsForPt } from '../../services/bookingService';
import { format, addDays, startOfDay, addMinutes, setHours, setMinutes, isBefore } from 'date-fns';
import { useRouter } from 'expo-router';
import CustomAlert from '../../components/CustomAlert';

// Assuming PT operating hours
const PT_OPEN_HOUR = 8;
const PT_CLOSE_HOUR = 20;

export default function PTBookingScreen() {
    const { user } = useAuth();
    const router = useRouter();
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [selectedDate, setSelectedDate] = useState<Date>(startOfDay(new Date()));
    const [availableSlots, setAvailableSlots] = useState<{ time: Date; available: boolean }[]>([]);
    const [loading, setLoading] = useState(true);
    const [bookingLoading, setBookingLoading] = useState(false);

    // PT Assignment State
    const [ptCodeInput, setPtCodeInput] = useState('');
    const [assigningLoading, setAssigningLoading] = useState(false);

    // PT's Clients State
    const [clients, setClients] = useState<UserProfile[]>([]);
    const [clientsLoading, setClientsLoading] = useState(false);

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

    // Generate the next 14 days for the selector
    const dates = Array.from({ length: 14 }).map((_, i) => addDays(startOfDay(new Date()), i));

    useEffect(() => {
        if (user) {
            loadUserProfile();
        }
    }, [user]);

    useEffect(() => {
        if (userProfile && userProfile.assignedPtId) {
            fetchAvailability(userProfile.assignedPtId);
        }
        if (userProfile?.role === 'pt' && user?.uid) {
            fetchClients(user.uid);
        }
    }, [selectedDate, userProfile, user]);

    const loadUserProfile = async () => {
        if (!user) return;
        try {
            const profile = await getUserProfile(user.uid);
            setUserProfile(profile);
            if (!profile?.assignedPtId && profile?.role === 'client') {
                setLoading(false); // Stop loading if no PT assigned
            }
        } catch (error) {
            console.error('Error fetching user profile:', error);
            setAlertConfig({
                visible: true,
                title: 'Error',
                message: 'Failed to load user profile.',
                isError: true
            });
            setLoading(false);
        }
    };

    const fetchClients = async (ptId: string) => {
        setClientsLoading(true);
        try {
            const ptsClients = await getClientsForPt(ptId);
            setClients(ptsClients);
        } catch (error) {
            console.error('Error fetching clients:', error);
            setAlertConfig({
                visible: true,
                title: 'Error',
                message: 'Failed to load your clients.',
                isError: true
            });
        } finally {
            setClientsLoading(false);
        }
    };

    const fetchAvailability = async (ptId: string) => {
        setLoading(true);
        try {
            const bookingsForDay = await getPTBookingsForDate(selectedDate, ptId);

            const slots = [];
            let currentTime = setMinutes(setHours(selectedDate, PT_OPEN_HOUR), 0);
            const endTime = setMinutes(setHours(selectedDate, PT_CLOSE_HOUR), 0);
            const now = new Date();

            while (currentTime < endTime) {
                if (isBefore(currentTime, now)) {
                    currentTime = addMinutes(currentTime, 15);
                    continue;
                }

                // For PTs, availability implies NO overlapping bookings at all since it's 1-on-1 (unless group PT)
                // Assume 1 hour session. Thus check if any booking overlaps with [currentTime, currentTime + 60mins]
                const targetEnd = addMinutes(currentTime, 60); // Standard PT session length 1hr
                const overlappingBookings = bookingsForDay.filter(b => {
                    return b.startTime < targetEnd && b.endTime > currentTime;
                });

                const isAvailable = overlappingBookings.length === 0;

                slots.push({
                    time: currentTime,
                    available: isAvailable,
                });

                // Advance by 15 mins for PT slots to allow 15 min increment start times
                currentTime = addMinutes(currentTime, 15);
            }

            setAvailableSlots(slots);
        } catch (error) {
            console.error('Error fetching PT availability:', error);
            setAlertConfig({
                visible: true,
                title: 'Error',
                message: 'Failed to load available slots.',
                isError: true
            });
        } finally {
            setLoading(false);
        }
    };

    const handleBookSlot = async (slot: { time: Date; available: boolean }) => {
        if (!user || !userProfile?.assignedPtId) return;

        setAlertConfig({
            visible: true,
            title: 'Confirm PT Booking',
            message: `Book PT session with your assigned trainer at ${format(slot.time, 'HH:mm')} for 1 hour?`,
            onConfirm: () => confirmBooking(slot.time, userProfile.assignedPtId as string)
        });
    };

    const confirmBooking = async (startTime: Date, ptId: string) => {
        if (!user) return;
        setBookingLoading(true);
        try {
            // Assuming PT sessions are 1 hour default
            const endTime = addMinutes(startTime, 60);

            await createBooking({
                userId: user.uid,
                startTime,
                endTime,
                type: 'pt',
                ptId: ptId,
                status: 'confirmed'
            });

            setAlertConfig({
                visible: true,
                title: 'Success!',
                message: 'Your PT session has been booked.',
                isSuccess: true,
                onConfirm: undefined
            });
            fetchAvailability(ptId); // Refresh slots
        } catch (error) {
            console.error('Error booking PT slot:', error);
            setAlertConfig({
                visible: true,
                title: 'Error',
                message: 'Failed to complete booking. Please try again.',
                isError: true
            });
        } finally {
            setBookingLoading(false);
        }
    };

    const handleAssignPT = async () => {
        if (!user || ptCodeInput.trim().length !== 6) {
            setAlertConfig({
                visible: true,
                title: 'Invalid Code',
                message: 'Please enter a valid 6-character PT code.',
                isError: true
            });
            return;
        }

        setAssigningLoading(true);
        try {
            const trimmedInput = ptCodeInput.trim().toUpperCase();
            const pts = await getAllPTs();
            const matchedPt = pts.find(pt => pt.id.substring(0, 6).toUpperCase() === trimmedInput);

            if (matchedPt) {
                await assignClientToPt(user.uid, matchedPt.id);
                // The context will automatically pull the new assignedPtId, causing the UI to refresh
                setAlertConfig({
                    visible: true,
                    title: 'PT Assigned!',
                    message: `You are now assigned to ${matchedPt.name || 'your trainer'}.`,
                    isSuccess: true
                });
            } else {
                setAlertConfig({
                    visible: true,
                    title: 'Invalid Code',
                    message: 'We could not find a Personal Trainer with that code.',
                    isError: true
                });
            }
        } catch (error) {
            console.error('Error assigning PT:', error);
            setAlertConfig({
                visible: true,
                title: 'Error',
                message: 'Something went wrong. Please try again.',
                isError: true
            });
        } finally {
            setAssigningLoading(false);
        }
    };

    if (userProfile?.role === 'pt') {
        const ptCode = user?.uid ? user.uid.substring(0, 6).toUpperCase() : '------';
        return (
            <SafeAreaView style={styles.container}>
                <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
                    <View style={styles.header}>
                        <Text style={styles.title}>Your PT Code</Text>
                        <Text style={styles.subtitle}>Share this with your clients</Text>
                    </View>
                    <View style={[styles.slotsContainer, { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 }]}>
                        <View style={styles.ptCodeCard}>
                            <Text style={styles.ptCodeText}>{ptCode}</Text>
                        </View>
                        <Text style={[styles.noPtSubText, { textAlign: 'center', marginTop: 20 }]}>
                            Ask your client to enter this 6-character code in their app to automatically assign them to you.
                        </Text>
                    </View>

                    <View style={styles.clientsSection}>
                        <Text style={styles.clientsTitle}>Your Clients</Text>
                        {clientsLoading ? (
                            <ActivityIndicator size="small" color="#FF5A00" style={{ marginTop: 20 }} />
                        ) : clients.length > 0 ? (
                            clients.map(client => (
                                <View key={client.id} style={styles.clientCard}>
                                    <View>
                                        <Text style={styles.clientName}>{client.name}</Text>
                                        <Text style={styles.clientEmail}>{client.email}</Text>
                                    </View>
                                </View>
                            ))
                        ) : (
                            <Text style={styles.noClientsText}>You don't have any clients assigned yet.</Text>
                        )}
                    </View>
                </ScrollView>
            </SafeAreaView>
        );
    }

    if (userProfile?.role === 'client' && !userProfile.assignedPtId) {
        return (
            <SafeAreaView style={styles.container}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={{ flex: 1 }}
                >
                    <View style={styles.header}>
                        <Text style={styles.title}>Connect with a PT</Text>
                    </View>
                    <View style={[styles.slotsContainer, { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 }]}>
                        <Text style={[styles.noPtText, { textAlign: 'center' }]}>You do not have a Personal Trainer yet.</Text>
                        <Text style={[styles.noPtSubText, { textAlign: 'center', marginBottom: 30 }]}>Enter the 6-character code provided by your Thrive Coach.</Text>

                        <TextInput
                            style={styles.codeInput}
                            placeholder="e.g. A1B2C3"
                            placeholderTextColor="#737373"
                            value={ptCodeInput}
                            onChangeText={(text) => setPtCodeInput(text.toUpperCase())}
                            maxLength={6}
                            autoCapitalize="characters"
                        />

                        <TouchableOpacity
                            style={[styles.assignButton, (!ptCodeInput || ptCodeInput.length < 6) && { opacity: 0.5 }]}
                            onPress={handleAssignPT}
                            disabled={!ptCodeInput || ptCodeInput.length < 6 || assigningLoading}
                        >
                            {assigningLoading ? (
                                <ActivityIndicator color="#ffffff" />
                            ) : (
                                <Text style={styles.assignButtonText}>Assign My PT</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
                <CustomAlert
                    visible={alertConfig.visible}
                    title={alertConfig.title}
                    message={alertConfig.message}
                    onClose={closeAlert}
                />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Book PT Session</Text>
                <Text style={styles.subtitle}>Select a date and time</Text>
            </View>

            <View style={styles.dateSelectorContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateSelector}>
                    {dates.map((date, index) => {
                        const isSelected = selectedDate.getTime() === date.getTime();
                        return (
                            <TouchableOpacity
                                key={index}
                                style={[styles.dateCard, isSelected && styles.dateCardSelected]}
                                onPress={() => setSelectedDate(date)}
                            >
                                <Text style={[styles.dayText, isSelected && styles.textSelected]}>
                                    {format(date, 'EEE')}
                                </Text>
                                <Text style={[styles.dateText, isSelected && styles.textSelected]}>
                                    {format(date, 'd')}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>

            <ScrollView contentContainerStyle={styles.slotsContainer}>
                {loading ? (
                    <ActivityIndicator size="large" color="#F26122" style={{ marginTop: 50 }} />
                ) : availableSlots.length === 0 ? (
                    <Text style={styles.noSlotsText}>No more slots available for this day.</Text>
                ) : (
                    <View style={styles.slotsGrid}>
                        {availableSlots.map((slot, index) => (
                            <TouchableOpacity
                                key={index}
                                style={[
                                    styles.slotCard,
                                    !slot.available && styles.slotCardUnavailable
                                ]}
                                disabled={!slot.available || bookingLoading}
                                onPress={() => handleBookSlot(slot)}
                            >
                                <Text style={[
                                    styles.slotTime,
                                    !slot.available && styles.slotTextUnavailable
                                ]}>
                                    {format(slot.time, 'HH:mm')}
                                </Text>
                                {slot.available && (
                                    <Text style={styles.slotDuration}>1 Hour</Text>
                                )}
                                {!slot.available && (
                                    <Text style={styles.slotFullText}>Booked</Text>
                                )}
                            </TouchableOpacity>
                        ))}
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
        backgroundColor: '#0a0a0a',
    },
    header: {
        padding: 20,
        backgroundColor: '#121212',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 90, 0, 0.1)',
    },
    title: {
        fontSize: 24,
        fontWeight: '800', // Match website headers
        color: '#ffffff',
    },
    subtitle: {
        fontSize: 16,
        color: '#a3a3a3', // text-secondary from website
        marginTop: 5,
    },
    dateSelectorContainer: {
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.05)',
        backgroundColor: '#0a0a0a',
    },
    dateSelector: {
        padding: 15,
        gap: 10,
    },
    dateCard: {
        paddingVertical: 10,
        paddingHorizontal: 15,
        borderRadius: 16, // --radius-md
        backgroundColor: 'rgba(30, 20, 15, 0.4)', // glass-panel background
        borderWidth: 1,
        borderColor: 'rgba(255, 90, 0, 0.1)',
        alignItems: 'center',
        minWidth: 60,
    },
    dateCardSelected: {
        backgroundColor: '#FF5A00', // True Thrive Orange
        borderColor: '#FF5A00',
    },
    dayText: {
        fontSize: 12,
        color: '#a3a3a3',
        textTransform: 'uppercase',
        fontWeight: '600',
    },
    dateText: {
        fontSize: 18,
        fontWeight: '800',
        color: '#ffffff',
        marginTop: 2,
    },
    textSelected: {
        color: '#ffffff',
    },
    slotsContainer: {
        padding: 20,
    },
    slotsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        justifyContent: 'space-between',
    },
    slotCard: {
        width: '31%',
        backgroundColor: '#121212',
        padding: 15,
        borderRadius: 16,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    slotCardUnavailable: {
        backgroundColor: 'rgba(18, 18, 18, 0.5)',
        borderColor: 'rgba(255, 255, 255, 0.02)',
        opacity: 0.5,
    },
    slotTime: {
        fontSize: 16,
        fontWeight: '700',
        color: '#ffffff',
    },
    slotTextUnavailable: {
        color: '#737373', // text-muted
        textDecorationLine: 'line-through',
    },
    slotDuration: {
        fontSize: 12,
        color: '#FF5A00',
        marginTop: 4,
        fontWeight: 'bold',
    },
    slotFullText: {
        fontSize: 12,
        color: '#ef4444', // Red for full
        marginTop: 4,
        fontWeight: '600',
    },
    noSlotsText: {
        textAlign: 'center',
        color: '#a3a3a3',
        fontSize: 16,
        marginTop: 50,
    },
    noPtText: {
        fontSize: 18,
        fontWeight: '800',
        color: '#ffffff',
        textAlign: 'center',
        paddingHorizontal: 20,
    },
    noPtSubText: {
        fontSize: 14,
        color: '#a3a3a3',
        marginTop: 10,
        textAlign: 'center',
        paddingHorizontal: 20,
    },
    ptCodeCard: {
        paddingVertical: 30,
        paddingHorizontal: 40,
        backgroundColor: 'rgba(30, 20, 15, 0.4)',
        borderColor: 'rgba(255, 90, 0, 0.3)',
        borderWidth: 2,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        borderStyle: 'dashed',
    },
    ptCodeText: {
        fontSize: 48,
        fontWeight: '900',
        color: '#ffffff',
        letterSpacing: 8,
    },
    codeInput: {
        width: '100%',
        maxWidth: 300,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        backgroundColor: '#121212',
        padding: 20,
        borderRadius: 16,
        fontSize: 24,
        color: '#ffffff',
        textAlign: 'center',
        letterSpacing: 6,
        fontWeight: 'bold',
        marginBottom: 20,
    },
    assignButton: {
        backgroundColor: '#FF5A00',
        paddingVertical: 15,
        paddingHorizontal: 30,
        borderRadius: 9999,
        width: '100%',
        maxWidth: 300,
        alignItems: 'center',
    },
    assignButtonText: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '700',
        textTransform: 'uppercase',
    },
    clientsSection: {
        paddingHorizontal: 20,
        marginTop: 20,
    },
    clientsTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: '#ffffff',
        marginBottom: 15,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.1)',
        paddingBottom: 10,
    },
    clientCard: {
        backgroundColor: '#121212',
        padding: 15,
        borderRadius: 16,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    clientName: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#ffffff',
    },
    clientEmail: {
        fontSize: 14,
        color: '#a3a3a3',
        marginTop: 4,
    },
    noClientsText: {
        color: '#a3a3a3',
        fontSize: 15,
        textAlign: 'center',
        marginTop: 20,
        fontStyle: 'italic',
    }
});
