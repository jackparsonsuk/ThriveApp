import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/auth';
import { getUserProfile, getPTBookingsForDate, createBooking, UserProfile } from '../../services/bookingService';
import { format, addDays, startOfDay, addMinutes, setHours, setMinutes, isBefore } from 'date-fns';
import { useRouter } from 'expo-router';
import CustomAlert from '../../components/CustomAlert';

// Assuming PT operating hours
const PT_OPEN_HOUR = 6;
const PT_CLOSE_HOUR = 20;

export default function PTBookingScreen() {
    const { user } = useAuth();
    const router = useRouter();
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [selectedDate, setSelectedDate] = useState<Date>(startOfDay(new Date()));
    const [availableSlots, setAvailableSlots] = useState<{ time: Date; available: boolean }[]>([]);
    const [loading, setLoading] = useState(true);
    const [bookingLoading, setBookingLoading] = useState(false);

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
    }, [selectedDate, userProfile]);

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
                    currentTime = addMinutes(currentTime, 30);
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

                // Advance by 60 mins for PT slots to keep it clean, or 30 mins depending on requirement
                // Requirement says day split into 30 min segments. We'll show slots every 30 mins.
                currentTime = addMinutes(currentTime, 30);
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

    if (userProfile?.role === 'client' && !userProfile.assignedPtId) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.title}>Book PT Session</Text>
                </View>
                <View style={[styles.slotsContainer, { justifyContent: 'center', alignItems: 'center' }]}>
                    <Text style={styles.noPtText}>You do not have an assigned Personal Trainer yet.</Text>
                    <Text style={styles.noPtSubText}>Please speak to a member of staff to get assigned.</Text>
                </View>
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
    dateSelectorContainer: {
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        backgroundColor: '#f9f9f9',
    },
    dateSelector: {
        padding: 15,
        gap: 10,
    },
    dateCard: {
        paddingVertical: 10,
        paddingHorizontal: 15,
        borderRadius: 8,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#ddd',
        alignItems: 'center',
        minWidth: 60,
    },
    dateCardSelected: {
        backgroundColor: '#F26122',
        borderColor: '#F26122',
    },
    dayText: {
        fontSize: 12,
        color: '#666',
        textTransform: 'uppercase',
    },
    dateText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#333',
        marginTop: 2,
    },
    textSelected: {
        color: '#fff',
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
        backgroundColor: '#f0f0f0',
        padding: 15,
        borderRadius: 8,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#e0e0e0',
    },
    slotCardUnavailable: {
        backgroundColor: '#f5f5f5',
        opacity: 0.5,
    },
    slotTime: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#333',
    },
    slotTextUnavailable: {
        color: '#999',
        textDecorationLine: 'line-through',
    },
    slotDuration: {
        fontSize: 12,
        color: '#F26122',
        marginTop: 4,
        fontWeight: 'bold',
    },
    slotFullText: {
        fontSize: 12,
        color: '#d32f2f',
        marginTop: 4,
    },
    noSlotsText: {
        textAlign: 'center',
        color: '#666',
        fontSize: 16,
        marginTop: 50,
    },
    noPtText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#333',
        textAlign: 'center',
        paddingHorizontal: 20,
    },
    noPtSubText: {
        fontSize: 14,
        color: '#666',
        marginTop: 10,
        textAlign: 'center',
        paddingHorizontal: 20,
    }
});
