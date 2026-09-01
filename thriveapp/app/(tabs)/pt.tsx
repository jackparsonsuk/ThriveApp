import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, TextInput, Dimensions, FlatList, ViewToken, Switch, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/auth';
import { getUserProfile, getPTBookingsForDate, createBooking, UserProfile, Booking, getAllPTs, assignClientToPt, getClientsForPt, getUserBookingsForDate, createRecurringSession, getGymBookingsForDate, checkSlotAvailability, getPendingPTRequestsForPT, updateBookingStatus, getUserPendingBookings, cancelBooking, getPersonAllBookingsForDate, updateWorkingHours, updateUserProfile, isUserActive, WorkingHours } from '../../services/bookingService';
import { getPtDayAvailability, PtSlot, formatWorkingDay, DAY_LABELS, DAY_ORDER, TIME_OPTIONS, effectiveWorkingHours, LEGACY_WORKING_DAY } from '../../services/availabilityService';
import { format, addDays, startOfDay, addMinutes, setHours, setMinutes, isBefore } from 'date-fns';
import { useRouter, useFocusEffect } from 'expo-router';
import CustomAlert from '../../components/CustomAlert';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import { BOOKING_WINDOW_DAYS, PT_AVAILABILITY_WINDOW_DAYS } from '@/constants/config';
import { useMouseDragScroll } from '@/hooks/useMouseDragScroll';
import * as Clipboard from 'expo-clipboard';
import { ScreenHeader, SectionHeader, EmptyState, Badge, Button, ListContainer, ListRow } from '@/components/ui';

// Assuming PT operating hours
const PT_OPEN_HOUR = 7;
const PT_CLOSE_HOUR = 20;

const SectionDivider = ({ theme }: { theme: any }) => (
    <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.border, marginVertical: 30, marginHorizontal: 20 }} />
);

export default function PTBookingScreen() {
    const { user } = useAuth();
    const router = useRouter();
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [selectedDate, setSelectedDate] = useState<Date>(startOfDay(new Date()));
    const [availableSlots, setAvailableSlots] = useState<{ time: Date; endTime?: Date; available: boolean; attendees: number; bookedPtCount: number; conflictReason?: string; isBlockedByMe?: boolean; blockBookingId?: string; conflictBookingId?: string; conflictBookingType?: string; }[]>([]);
    const [loading, setLoading] = useState(true);
    const [bookingLoading, setBookingLoading] = useState(false);
    const [recurringFrequency, setRecurringFrequency] = useState<'none' | 'weekly' | 'bi-weekly' | 'monthly'>('none');
    const [blockDuration, setBlockDuration] = useState<number>(1);
    const [isManagingAvailability, setIsManagingAvailability] = useState(false);

    // PT Assignment State
    const [ptCodeInput, setPtCodeInput] = useState('');
    const [assigningLoading, setAssigningLoading] = useState(false);
    const ptCodeInputRef = useRef<TextInput>(null);

    // PT's Clients State
    const [clients, setClients] = useState<UserProfile[]>([]);
    const [clientsLoading, setClientsLoading] = useState(false);
    const [selectedClientForBooking, setSelectedClientForBooking] = useState<UserProfile | null>(null);

    // Pending Requests State (PT role)
    const [pendingRequests, setPendingRequests] = useState<Array<Booking & { clientName: string }>>([]);
    const [pendingLoading, setPendingLoading] = useState(false);

    // Client's pending PT session requests
    const [clientPendingSessions, setClientPendingSessions] = useState<Booking[]>([]);
    const [clientPendingLoading, setClientPendingLoading] = useState(false);
    const [cancellingSessionId, setCancellingSessionId] = useState<string | null>(null);
    const flatListRef = useRef<FlatList>(null);
    const [hasInitialScrolled, setHasInitialScrolled] = useState(false);
    const { onScroll: onMouseDragScroll, dragProps } = useMouseDragScroll(flatListRef);
    const [visibleMonth, setVisibleMonth] = useState(format(new Date(), 'MMMM yyyy'));

    // Client's Assigned PT State
    const [assignedPtData, setAssignedPtData] = useState<UserProfile | null>(null);

    // Client-facing view of their PT's day
    const [ptSlots, setPtSlots] = useState<PtSlot[]>([]);
    const [ptSlotsLoading, setPtSlotsLoading] = useState(false);
    const [ptDayWindow, setPtDayWindow] = useState<{ start: Date; end: Date } | null>(null);

    // A PT/admin who has their own trainer, booking their own session
    const [isBookingOwnPt, setIsBookingOwnPt] = useState(false);

    // Active clients are the working list; inactive ones are parked out of the way
    // but stay one tap from coming back.
    const [clientListTab, setClientListTab] = useState<'active' | 'inactive'>('active');

    // Working hours editor (PT role)
    const [isEditingHours, setIsEditingHours] = useState(false);
    const [hoursDraft, setHoursDraft] = useState<WorkingHours>({});
    const [savingHours, setSavingHours] = useState(false);
    const [timePicker, setTimePicker] = useState<{ day: string; field: 'start' | 'end' } | null>(null);

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

    // Generate date array: 6 months for availability management, 6 weeks for booking
    const dates = useMemo(() => {
        const windowDays = isManagingAvailability ? PT_AVAILABILITY_WINDOW_DAYS : BOOKING_WINDOW_DAYS;
        return Array.from({ length: windowDays }).map((_, i) => addDays(startOfDay(new Date()), i));
    }, [isManagingAvailability]);

    const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
        if (viewableItems.length > 0) {
            const middleItem = viewableItems[Math.floor(viewableItems.length / 2)];
            if (middleItem?.item) {
                setVisibleMonth(format(middleItem.item as Date, 'MMMM yyyy'));
            }
        }
    }, []);
    const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

    useEffect(() => {
        if (user) {
            loadUserProfile();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    useEffect(() => {
        if (userProfile && userProfile.assignedPtId) {
            fetchAssignedPt(userProfile.assignedPtId);
        }

        if ((userProfile?.role === 'pt' || userProfile?.role === 'admin') && user?.uid) {
            fetchClients(user.uid);
            fetchPendingRequests(user.uid);
            if (selectedClientForBooking || isManagingAvailability) {
                // If PT is booking for a client or managing availability, check the PT's own availability
                fetchAvailability(user.uid);
            }
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDate, userProfile, user, selectedClientForBooking, isManagingAvailability]);

    useEffect(() => {
        const index = dates.findIndex(d => d.getTime() === selectedDate.getTime());
        if (index !== -1 && (index > 0 || hasInitialScrolled)) {
            const timer = setTimeout(() => {
                flatListRef.current?.scrollToIndex({ 
                    index, 
                    animated: true, 
                    viewPosition: 0.5 
                });
                setHasInitialScrolled(true);
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [selectedDate]);

    useEffect(() => {
        // Anyone with a trainer can have their own pending requests — PTs included
        if (userProfile?.assignedPtId && user?.uid) {
            fetchClientPendingSessions(user.uid);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userProfile, user]);

    // Anyone with a trainer sees that trainer's day — wait for the PT profile so we know their working hours
    useEffect(() => {
        if (userProfile?.assignedPtId && assignedPtData) {
            fetchClientAvailability();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDate, userProfile, assignedPtData]);

    // Tab screens stay mounted, so without this a request made elsewhere never
    // appears until a full reload — incoming requests most of all.
    useFocusEffect(useCallback(() => {
        if (!user?.uid || !userProfile) return;

        if (userProfile.role === 'pt' || userProfile.role === 'admin') {
            fetchPendingRequests(user.uid);
            fetchClients(user.uid);
        }
        if (userProfile.assignedPtId) {
            fetchClientPendingSessions(user.uid);
            if (assignedPtData) fetchClientAvailability();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, userProfile, assignedPtData, selectedDate]));

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

    const activeClients = useMemo(() => clients.filter(isUserActive), [clients]);
    const inactiveClients = useMemo(() => clients.filter(c => !isUserActive(c)), [clients]);
    const visibleClients = clientListTab === 'active' ? activeClients : inactiveClients;

    // Purely a filing change: an inactive client keeps their history, their login and
    // their existing bookings, they just stop cluttering the working list.
    const handleSetClientActive = async (client: UserProfile, isActive: boolean) => {
        setClients(prev => prev.map(c => (c.id === client.id ? { ...c, isActive } : c)));
        try {
            await updateUserProfile(client.id, { isActive });
        } catch (error) {
            console.error('Error updating client status:', error);
            setClients(prev => prev.map(c => (c.id === client.id ? { ...c, isActive: !isActive } : c)));
            setAlertConfig({
                visible: true,
                title: 'Error',
                message: `Could not move ${client.name?.split(' ')[0] || 'this client'} to ${isActive ? 'Active' : 'Inactive'}.`,
                isError: true
            });
        }
    };

    const fetchPendingRequests = async (ptId: string) => {
        setPendingLoading(true);
        try {
            const requests = await getPendingPTRequestsForPT(ptId);
            // Look up each requester's name, but never let one unreadable profile
            // reject the whole batch and leave the PT staring at an empty list
            const hydrated = await Promise.all(requests.map(async (req) => {
                try {
                    const clientProfile = await getUserProfile(req.userId);
                    return { ...req, clientName: clientProfile?.name || 'Unknown Client' };
                } catch (e) {
                    console.warn('Could not load requester profile', req.userId, e);
                    return { ...req, clientName: 'Unknown Client' };
                }
            }));
            hydrated.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
            setPendingRequests(hydrated);
        } catch (error) {
            console.error('Error fetching pending requests:', error);
        } finally {
            setPendingLoading(false);
        }
    };

    const handleApproveRequest = (requestId: string, clientName: string) => {
        setAlertConfig({
            visible: true,
            title: 'Approve Request',
            message: `Confirm PT session for ${clientName}?`,
            onConfirm: async () => {
                try {
                    await updateBookingStatus(requestId, 'confirmed');
                    if (user?.uid) {
                        fetchPendingRequests(user.uid);
                        fetchAvailability(user.uid);
                    }
                } catch (error) {
                    console.error('Error approving request:', error);
                    setAlertConfig({ visible: true, title: 'Error', message: 'Failed to approve request.', isError: true });
                }
            }
        });
    };

    const handleDeclineRequest = (requestId: string, clientName: string) => {
        setAlertConfig({
            visible: true,
            title: 'Decline Request',
            message: `Decline PT session request from ${clientName}?`,
            isError: true,
            onConfirm: async () => {
                try {
                    await updateBookingStatus(requestId, 'cancelled');
                    if (user?.uid) {
                        fetchPendingRequests(user.uid);
                        fetchAvailability(user.uid);
                    }
                } catch (error) {
                    console.error('Error declining request:', error);
                    setAlertConfig({ visible: true, title: 'Error', message: 'Failed to decline request.', isError: true });
                }
            }
        });
    };

    const fetchClientPendingSessions = async (userId: string) => {
        setClientPendingLoading(true);
        try {
            const sessions = await getUserPendingBookings(userId);
            const upcoming = sessions
                .filter(s => s.endTime > new Date())
                .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
            setClientPendingSessions(upcoming);
        } catch (error) {
            console.error('Error fetching pending sessions:', error);
        } finally {
            setClientPendingLoading(false);
        }
    };

    const handleCancelPendingSession = (session: Booking) => {
        setAlertConfig({
            visible: true,
            title: 'Cancel Request',
            message: `Cancel your PT session request for ${format(session.startTime, 'EEE, MMM d')} at ${format(session.startTime, 'HH:mm')}?`,
            isError: true,
            onConfirm: async () => {
                if (!session.id) return;
                setCancellingSessionId(session.id);
                try {
                    await cancelBooking(session.id, 'client');
                    // The freed hour has to reappear in the slot list too
                    if (user?.uid) await Promise.all([fetchClientPendingSessions(user.uid), fetchClientAvailability()]);
                } catch (error) {
                    console.error('Error cancelling pending session:', error);
                    setAlertConfig({ visible: true, title: 'Error', message: 'Failed to cancel the request.', isError: true });
                } finally {
                    setCancellingSessionId(null);
                }
            }
        });
    };

    const fetchAssignedPt = async (ptId: string) => {
        setLoading(true);
        try {
            const ptProfile = await getUserProfile(ptId);
            if (ptProfile) {
                setAssignedPtData(ptProfile);
            }
        } catch (error) {
            console.error('Error fetching assigned PT profile:', error);
        } finally {
            setLoading(false);
        }
    };

    const ptFirstName = assignedPtData?.name?.split(' ')[0] || 'Your PT';

    // Declared above the render branches so every branch can use it
    const backButton = (onPress: () => void) => (
        <TouchableOpacity onPress={onPress} style={[styles.backButton, { backgroundColor: theme.cardAlt }]}>
            <Text style={[styles.backButtonText, { color: theme.text }]}>Back</Text>
        </TouchableOpacity>
    );

    const openHoursEditor = () => {
        setHoursDraft(effectiveWorkingHours(userProfile?.workingHours));
        setIsEditingHours(true);
    };

    const toggleWorkingDay = (day: string, enabled: boolean) => {
        setHoursDraft(prev => {
            const next = { ...prev } as WorkingHours;
            if (enabled) next[day as keyof WorkingHours] = prev[day as keyof WorkingHours] ?? LEGACY_WORKING_DAY;
            else delete next[day as keyof WorkingHours];
            return next;
        });
    };

    const setWorkingTime = (day: string, field: 'start' | 'end', value: string) => {
        setHoursDraft(prev => {
            const existing = prev[day as keyof WorkingHours] ?? LEGACY_WORKING_DAY;
            return { ...prev, [day]: { ...existing, [field]: value } };
        });
    };

    const handleSaveWorkingHours = async () => {
        if (!user?.uid) return;

        const invalidDay = DAY_ORDER.find(day => {
            const hours = hoursDraft[day];
            return hours && hours.end <= hours.start;
        });
        if (invalidDay) {
            setAlertConfig({
                visible: true,
                title: 'Check Your Hours',
                message: `${DAY_LABELS[Number(invalidDay)]} finishes before it starts. Adjust the times and try again.`,
                isError: true
            });
            return;
        }

        setSavingHours(true);
        try {
            await updateWorkingHours(user.uid, hoursDraft);
            setUserProfile(prev => prev ? { ...prev, workingHours: hoursDraft } : prev);
            setIsEditingHours(false);
            setAlertConfig({
                visible: true,
                title: 'Hours Saved',
                message: 'Your clients can now only request sessions inside these hours.',
                isSuccess: true
            });
        } catch (error) {
            console.error('Error saving working hours:', error);
            setAlertConfig({
                visible: true,
                title: 'Error',
                message: 'Failed to save your working hours. Please try again.',
                isError: true
            });
        } finally {
            setSavingHours(false);
        }
    };

    // Client view: what hours can I actually request with my PT on this date?
    const fetchClientAvailability = async () => {
        if (!user?.uid || !userProfile?.assignedPtId) return;
        setPtSlotsLoading(true);
        try {
            const { slots, window } = await getPtDayAvailability({
                ptId: userProfile.assignedPtId,
                clientId: user.uid,
                date: selectedDate,
                workingHours: assignedPtData?.workingHours,
                ptFirstName,
            });
            setPtSlots(slots);
            setPtDayWindow(window);
        } catch (error) {
            console.error('Error fetching PT availability for client:', error);
            setAlertConfig({
                visible: true,
                title: 'Error',
                message: "Failed to load your PT's availability.",
                isError: true
            });
        } finally {
            setPtSlotsLoading(false);
        }
    };

    const handleRequestPtSession = (slot: PtSlot) => {
        setAlertConfig({
            visible: true,
            title: 'Request Session',
            message: `Request a PT session with ${ptFirstName} on ${format(slot.time, 'EEE, MMM d')} at ${format(slot.time, 'HH:mm')}?`,
            onConfirm: () => confirmPtRequest(slot)
        });
    };

    const confirmPtRequest = async (slot: PtSlot) => {
        if (!user?.uid || !userProfile?.assignedPtId) return;
        setBookingLoading(true);
        try {
            await createBooking({
                userId: user.uid,
                startTime: slot.time,
                endTime: slot.endTime,
                type: 'pt',
                ptId: userProfile.assignedPtId,
                status: 'pending'
            });
            setAlertConfig({
                visible: true,
                title: 'Request Sent!',
                message: `${ptFirstName} will confirm your session shortly.`,
                isSuccess: true,
                onConfirm: undefined
            });
            await Promise.all([fetchClientAvailability(), fetchClientPendingSessions(user.uid)]);
        } catch (error) {
            console.error('Error requesting PT session:', error);
            setAlertConfig({
                visible: true,
                title: 'Error',
                message: 'Failed to send your request. Please try again.',
                isError: true
            });
        } finally {
            setBookingLoading(false);
        }
    };

    const fetchAvailability = async (ptId: string) => {
        setLoading(true);
        try {
            const isPtBookingForClient = (userProfile?.role === 'pt' || userProfile?.role === 'admin') && !!selectedClientForBooking;
            const targetPtId = isManagingAvailability ? user?.uid : ptId;
            if (!targetPtId) return;

            // Fetch each source separately so we can generate contextual conflict reasons
            const [ptSessionBookings, ptPersonal, gymBookingsForDay] = await Promise.all([
                getPTBookingsForDate(selectedDate, targetPtId),
                getPersonAllBookingsForDate(targetPtId, selectedDate),
                getGymBookingsForDate(selectedDate),
            ]);

            let selfInstructorBookings: Booking[] = [];
            let selfBookings: Booking[] = [];
            if (user?.uid && targetPtId !== user.uid) {
                [selfInstructorBookings, selfBookings] = await Promise.all([
                    getPTBookingsForDate(selectedDate, user.uid),
                    getPersonAllBookingsForDate(user.uid, selectedDate),
                ]);
            }

            let clientBookings: Booking[] = [];
            if (isPtBookingForClient && selectedClientForBooking) {
                clientBookings = await getPersonAllBookingsForDate(selectedClientForBooking.id, selectedDate);
            }

            const slots = [];
            let currentTime = setMinutes(setHours(selectedDate, PT_OPEN_HOUR), 0);
            const endTime = setMinutes(setHours(selectedDate, PT_CLOSE_HOUR), 0);
            const now = new Date();

            while (currentTime < endTime) {
                if (isBefore(currentTime, now)) {
                    currentTime = addMinutes(currentTime, 15);
                    continue;
                }

                const targetEnd = addMinutes(currentTime, 60);
                const overlaps = (b: Booking) => b.startTime < targetEnd && b.endTime > currentTime;

                const ptSessions = ptSessionBookings.filter(b => overlaps(b) && b.type === 'pt');
                const ptBlocks = ptSessionBookings.filter(b => overlaps(b) && b.type === 'block');
                const ptOwnBlocks = ptSessionBookings.filter(b => overlaps(b) && b.type === 'pt_block');
                const ptPersonalConflicts = ptPersonal.filter(overlaps);
                const clientConflicts = clientBookings.filter(overlaps);
                const selfInstructorConflicts = selfInstructorBookings.filter(overlaps);
                const selfConflicts = selfBookings.filter(overlaps);
                const gymBlocks = gymBookingsForDay.filter(b => overlaps(b) && b.type === 'block');

                let isAvailable = true;
                let conflictReason: string | undefined;
                let isBlockedByMe = false;
                let blockBookingId: string | undefined;
                let conflictBookingId: string | undefined;
                let conflictBookingType: string | undefined;

                if (ptOwnBlocks.length > 0) {
                    if (isManagingAvailability) {
                        isAvailable = true;
                        isBlockedByMe = true;
                        blockBookingId = ptOwnBlocks[0].id;
                        conflictBookingId = ptOwnBlocks[0].id;
                        conflictBookingType = 'pt_block';
                        conflictReason = 'Unblock';
                    } else {
                        isAvailable = false;
                        conflictReason = 'Unavailable';
                        conflictBookingId = ptOwnBlocks[0].id;
                        conflictBookingType = 'pt_block';
                    }
                } else if (!isManagingAvailability) {
                    // Only check for other conflicts if we are NOT managing our own availability
                    if (ptBlocks.length > 0) {
                        isAvailable = false;
                        conflictReason = 'Blocked';
                        conflictBookingId = ptBlocks[0].id;
                        conflictBookingType = 'block';
                    } else if (gymBlocks.length > 0) {
                        isAvailable = false;
                        conflictReason = gymBlocks[0].reason || 'Gym Closed';
                        conflictBookingId = 'admin-block';
                        conflictBookingType = 'block';
                    } else if (ptPersonalConflicts.length > 0) {
                        isAvailable = false;
                        const c = ptPersonalConflicts[0];
                        conflictBookingId = c.id;
                        conflictBookingType = c.type;
                        if (isPtBookingForClient) {
                            if (c.type === 'gym') conflictReason = 'You are in the gym';
                            else if (c.type === 'group') conflictReason = 'You have a class';
                            else conflictReason = 'You have a booking';
                        } else {
                            if (c.type === 'gym') conflictReason = 'PT is in the gym';
                            else if (c.type === 'group') conflictReason = 'PT has a class';
                            else conflictReason = 'PT is unavailable';
                        }
                    } else if (clientConflicts.length > 0) {
                        isAvailable = false;
                        const c = clientConflicts[0];
                        conflictBookingId = c.id;
                        conflictBookingType = c.type;
                        const firstName = selectedClientForBooking?.name?.split(' ')[0] || 'Client';
                        if (c.type === 'gym') conflictReason = `${firstName} is in the gym`;
                        else if (c.type === 'group') conflictReason = `${firstName} has a class`;
                        else if (c.type === 'pt') conflictReason = `${firstName} has a PT session`;
                        else conflictReason = `${firstName} is busy`;
                    } else if (selfInstructorConflicts.length > 0) {
                        isAvailable = false;
                        conflictBookingId = selfInstructorConflicts[0].id;
                        conflictBookingType = 'pt';
                        conflictReason = 'You are leading a session';
                    } else if (selfConflicts.length > 0) {
                        isAvailable = false;
                        const c = selfConflicts[0];
                        conflictBookingId = c.id;
                        conflictBookingType = c.type;
                        if (c.type === 'gym') conflictReason = 'You have a gym session';
                        else if (c.type === 'group') conflictReason = 'You have a class';
                        else if (c.type === 'pt') conflictReason = 'You have a PT session';
                        else conflictReason = 'You are busy';
                    } else if (ptSessions.length >= 2) {
                        isAvailable = false;
                        conflictReason = 'Fully Booked';
                        conflictBookingId = ptSessions[0].id;
                        conflictBookingType = 'pt';
                    } else if (ptSessions.length === 1) {
                        conflictBookingId = ptSessions[0].id;
                        conflictBookingType = 'pt';
                    }
                }

                slots.push({
                    time: currentTime,
                    available: isAvailable,
                    attendees: checkSlotAvailability(currentTime, gymBookingsForDay).count,
                    bookedPtCount: ptSessions.length,
                    conflictReason,
                    isBlockedByMe,
                    blockBookingId,
                    conflictBookingId,
                    conflictBookingType
                });

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

    const handleBookSlot = async (slot: { time: Date; endTime?: Date; available: boolean; isBlockedByMe?: boolean; blockBookingId?: string }) => {
        if (isManagingAvailability) {
            if (slot.isBlockedByMe && slot.blockBookingId) {
                setAlertConfig({
                    visible: true,
                    title: 'Unblock Time',
                    message: `Do you want to unblock ${format(slot.time, 'HH:mm')}${slot.endTime ? ' to ' + format(slot.endTime, 'HH:mm') : ''}?`,
                    onConfirm: async () => {
                        try {
                            setBookingLoading(true);
                            await cancelBooking(slot.blockBookingId!, 'pt');
                            if (user?.uid) fetchAvailability(user.uid);
                            setAlertConfig({ visible: true, title: 'Success!', message: 'Time unblocked successfully.', isSuccess: true });
                        } catch (e) {
                            setAlertConfig({ visible: true, title: 'Error', message: 'Failed to unblock.', isError: true });
                        } finally {
                            setBookingLoading(false);
                        }
                    }
                });
            } else {
                const endTimeStr = format(addMinutes(slot.time, blockDuration * 60), 'HH:mm');
                setAlertConfig({
                    visible: true,
                    title: 'Block Time',
                    message: `Block out ${blockDuration} hour(s) from ${format(slot.time, 'HH:mm')} to ${endTimeStr}${recurringFrequency !== 'none' ? ' (' + recurringFrequency + ')' : ''}?`,
                    onConfirm: () => confirmBooking(slot.time, user!.uid, 'pt_block', blockDuration * 60)
                });
            }
            return;
        }

        const isPtBookingForClient = (userProfile?.role === 'pt' || userProfile?.role === 'admin') && selectedClientForBooking;
        const targetPtId = isPtBookingForClient ? user?.uid : userProfile?.assignedPtId;
        const targetClientName = isPtBookingForClient ? selectedClientForBooking.name : 'you';

        if (!user || !targetPtId) return;

        setAlertConfig({
            visible: true,
            title: 'Confirm PT Booking',
            message: `Book ${recurringFrequency !== 'none' ? recurringFrequency + ' ' : ''}PT session for ${targetClientName} at ${format(slot.time, 'HH:mm')}?`,
            onConfirm: () => confirmBooking(slot.time, targetPtId as string, 'pt')
        });
    };

    const confirmBooking = async (startTime: Date, ptId: string, bookingType: 'pt' | 'pt_block' = 'pt', durationMinutes: number = 60) => {
        if (!user) return;
        setBookingLoading(true);

        const isPtBookingForClient = (userProfile?.role === 'pt' || userProfile?.role === 'admin') && selectedClientForBooking;
        const targetUserId = isManagingAvailability ? user.uid : (isPtBookingForClient ? selectedClientForBooking.id : user.uid);

        try {
            const endTime = addMinutes(startTime, durationMinutes);

            if (recurringFrequency === 'none') {
                await createBooking({
                    userId: targetUserId,
                    startTime,
                    endTime,
                    type: bookingType,
                    ptId: ptId,
                    status: 'confirmed'
                });
            } else {
                await createRecurringSession({
                    userId: targetUserId,
                    ptId: ptId,
                    type: bookingType as any,
                    frequency: recurringFrequency as any,
                    startTime: startTime,
                    endTime: endTime,
                    status: 'active'
                });
            }

            setAlertConfig({
                visible: true,
                title: 'Success!',
                message: isManagingAvailability ? `Time block${recurringFrequency !== 'none' ? 's' : ''} added.` : (isPtBookingForClient ? `Session${recurringFrequency !== 'none' ? 's' : ''} booked for ${selectedClientForBooking.name}.` : 'Your PT session has been booked.'),
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
                if (matchedPt.id === user.uid) {
                    setAlertConfig({
                        visible: true,
                        title: 'Invalid Assignment',
                        message: 'You cannot assign yourself as your own Personal Trainer.',
                        isError: true
                    });
                    setAssigningLoading(false);
                    return;
                }
                await assignClientToPt(user.uid, matchedPt.id);
                // Update the local state to trigger a UI refresh
                setUserProfile(prev => prev ? { ...prev, assignedPtId: matchedPt.id } : null);

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

    if ((userProfile?.role === 'pt' || userProfile?.role === 'admin') && !selectedClientForBooking && !isManagingAvailability && !isBookingOwnPt) {
        const ptCode = user?.uid ? user.uid.substring(0, 6).toUpperCase() : '------';
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
                <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
                    <View style={styles.headerContainer}>
                        <ScreenHeader title="Your PT Code" subtitle="Share this with your clients" />
                    </View>
                    <View style={[styles.slotsContainer, { justifyContent: 'center', alignItems: 'center', paddingHorizontal: Spacing.xl }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: Spacing.sm }}>
                            <View style={[styles.ptCodeCard, { backgroundColor: theme.card, borderColor: theme.tint, shadowColor: theme.tint }]}>
                                <Text style={[styles.ptCodeText, { color: theme.text }]}>{ptCode}</Text>
                            </View>
                            <TouchableOpacity
                                style={{
                                    marginLeft: Spacing.lg,
                                    padding: Spacing.md + 2,
                                    backgroundColor: theme.tint,
                                    borderRadius: Radii.pill,
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    shadowColor: theme.tint,
                                    shadowOffset: { width: 0, height: 4 },
                                    shadowOpacity: 0.3,
                                    shadowRadius: 8,
                                    elevation: 4,
                                }}
                                onPress={async () => {
                                    await Clipboard.setStringAsync(ptCode);
                                    setAlertConfig({
                                        visible: true,
                                        title: 'Copied!',
                                        message: 'Your PT Code has been copied.',
                                        isSuccess: true
                                    });
                                }}
                            >
                                <Ionicons name="copy-outline" size={24} color={theme.onTint} />
                            </TouchableOpacity>
                        </View>
                        <Text style={[styles.noPtSubText, { color: theme.textSecondary, textAlign: 'center', marginTop: Spacing.xxl + 1 }]}>
                            Ask your client to enter this 6-character code in their app to automatically assign them to you.
                        </Text>
                    </View>

                    <View style={styles.clientsSection}>
                        <SectionHeader title="Client Requests" />
                        {pendingLoading ? (
                            <ActivityIndicator size="small" color={theme.tint} style={{ marginTop: 20 }} />
                        ) : pendingRequests.length === 0 ? (
                            <EmptyState icon="hourglass-outline" title="No clients are waiting on you." compact />
                        ) : (
                            <ListContainer>
                                {pendingRequests.map((req, index) => {
                                    const isLast = index === pendingRequests.length - 1;
                                    return (
                                        <ListRow key={req.id} isLast={isLast} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: Spacing.sm + 2 }}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={[styles.clientName, { color: theme.text }]}>{req.clientName}</Text>
                                                <Text style={[styles.clientEmail, { color: theme.textSecondary }]}>
                                                    {format(req.startTime, 'EEE, MMM d')} • {format(req.startTime, 'HH:mm')} - {format(req.endTime, 'HH:mm')}
                                                </Text>
                                            </View>
                                            <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                                                <Button variant="primary" size="sm" label="Approve" onPress={() => handleApproveRequest(req.id!, req.clientName)} />
                                                <Button variant="destructive" size="sm" label="Decline" onPress={() => handleDeclineRequest(req.id!, req.clientName)} />
                                            </View>
                                        </ListRow>
                                    );
                                })}
                            </ListContainer>
                        )}
                    </View>

                    <SectionDivider theme={theme} />

                    <View style={styles.clientsSection}>
                        <SectionHeader title="Your Clients" />

                        <View style={[styles.clientTabs, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
                            {(['active', 'inactive'] as const).map((tab) => {
                                const isSelected = clientListTab === tab;
                                const count = tab === 'active' ? activeClients.length : inactiveClients.length;
                                return (
                                    <TouchableOpacity
                                        key={tab}
                                        onPress={() => setClientListTab(tab)}
                                        style={[styles.clientTab, isSelected && { backgroundColor: theme.tint }]}
                                    >
                                        <Text style={[styles.clientTabText, { color: isSelected ? theme.onTint : theme.textSecondary }]}>
                                            {tab === 'active' ? 'Active' : 'Inactive'} ({count})
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        {clientsLoading ? (
                            <ActivityIndicator size="small" color={theme.tint} style={{ marginTop: 20 }} />
                        ) : visibleClients.length > 0 ? (
                            <ListContainer>
                                {visibleClients.map((client, index) => {
                                    const isLast = index === visibleClients.length - 1;
                                    const active = isUserActive(client);
                                    return (
                                        <ListRow key={client.id} isLast={isLast} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={[styles.clientName, { color: theme.text }]}>{client.name}</Text>
                                                <Text style={[styles.clientEmail, { color: theme.textSecondary }]}>{client.email}</Text>
                                            </View>
                                            <View style={styles.clientRowActions}>
                                                <Button variant="primary" size="sm" label="Book" onPress={() => setSelectedClientForBooking(client)} />
                                                <TouchableOpacity
                                                    onPress={() => handleSetClientActive(client, !active)}
                                                    style={[styles.clientStatusBtn, { borderColor: theme.border }]}
                                                    accessibilityRole="button"
                                                    accessibilityLabel={active ? `Move ${client.name} to Inactive` : `Move ${client.name} to Active`}
                                                >
                                                    <Ionicons
                                                        name={active ? 'archive-outline' : 'arrow-undo-outline'}
                                                        size={18}
                                                        color={theme.textSecondary}
                                                    />
                                                </TouchableOpacity>
                                            </View>
                                        </ListRow>
                                    );
                                })}
                            </ListContainer>
                        ) : (
                            <EmptyState
                                icon="people-outline"
                                title={
                                    clients.length === 0
                                        ? "You don't have any clients assigned yet."
                                        : clientListTab === 'active'
                                            ? 'No active clients — check the Inactive tab.'
                                            : 'No inactive clients.'
                                }
                                compact
                            />
                        )}
                        <Button
                            variant="secondary"
                            label="Manage My Availability"
                            onPress={() => setIsManagingAvailability(true)}
                            style={{ alignSelf: 'center', marginTop: Spacing.xxl + 1 }}
                        />
                    </View>

                    <SectionDivider theme={theme} />

                    <View style={styles.clientsSection}>
                        <SectionHeader title="Working Hours" />
                        <Text style={[styles.hoursIntro, { color: theme.textSecondary }]}>
                            Clients can only request sessions inside these hours. Block out individual days under Manage My Availability.
                        </Text>

                        {!userProfile?.workingHours && !isEditingHours && (
                            <View style={[styles.hoursNotice, { backgroundColor: theme.tintMuted, borderColor: theme.tint }]}>
                                <Ionicons name="information-circle-outline" size={18} color={theme.tint} style={{ marginRight: Spacing.sm }} />
                                <Text style={[styles.hoursNoticeText, { color: theme.text }]}>
                                    You haven&apos;t set your hours yet, so clients can request any day from 07:00 to 20:00.
                                </Text>
                            </View>
                        )}

                        <ListContainer>
                            {DAY_ORDER.map((day, index) => {
                                const source = isEditingHours ? hoursDraft : effectiveWorkingHours(userProfile?.workingHours);
                                const hours = source[day];
                                return (
                                    <ListRow
                                        key={day}
                                        isLast={index === DAY_ORDER.length - 1}
                                        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                                    >
                                        <Text style={[styles.hoursDayLabel, { color: theme.text }]}>{DAY_LABELS[Number(day)]}</Text>

                                        {isEditingHours ? (
                                            <View style={styles.hoursRowControls}>
                                                {hours ? (
                                                    <View style={styles.hoursChipRow}>
                                                        <TouchableOpacity
                                                            style={[styles.timeChip, { borderColor: theme.border, backgroundColor: theme.cardAlt }]}
                                                            onPress={() => setTimePicker({ day, field: 'start' })}
                                                        >
                                                            <Text style={[styles.timeChipText, { color: theme.text }]}>{hours.start}</Text>
                                                        </TouchableOpacity>
                                                        <Text style={{ color: theme.textTertiary }}>–</Text>
                                                        <TouchableOpacity
                                                            style={[styles.timeChip, { borderColor: theme.border, backgroundColor: theme.cardAlt }]}
                                                            onPress={() => setTimePicker({ day, field: 'end' })}
                                                        >
                                                            <Text style={[styles.timeChipText, { color: theme.text }]}>{hours.end}</Text>
                                                        </TouchableOpacity>
                                                    </View>
                                                ) : (
                                                    <Text style={[styles.hoursValue, { color: theme.textTertiary }]}>Not working</Text>
                                                )}
                                                <Switch
                                                    value={!!hours}
                                                    onValueChange={(enabled) => toggleWorkingDay(day, enabled)}
                                                    trackColor={{ false: theme.border, true: theme.tint }}
                                                    thumbColor="#ffffff"
                                                />
                                            </View>
                                        ) : (
                                            <Text style={[styles.hoursValue, { color: hours ? theme.textSecondary : theme.textTertiary }]}>
                                                {formatWorkingDay(hours)}
                                            </Text>
                                        )}
                                    </ListRow>
                                );
                            })}
                        </ListContainer>

                        {isEditingHours ? (
                            <View style={styles.hoursActions}>
                                <Button variant="secondary" label="Cancel" onPress={() => setIsEditingHours(false)} style={{ flex: 1 }} />
                                <Button variant="primary" label="Save Hours" onPress={handleSaveWorkingHours} loading={savingHours} style={{ flex: 1 }} />
                            </View>
                        ) : (
                            <Button
                                variant="secondary"
                                label="Edit Working Hours"
                                onPress={openHoursEditor}
                                style={{ alignSelf: 'center', marginTop: Spacing.lg }}
                            />
                        )}
                    </View>

                    <SectionDivider theme={theme} />

                    <View style={styles.clientsSection}>
                        <SectionHeader title="Your Own Training" />

                        {userProfile?.assignedPtId ? (
                            assignedPtData ? (
                                <ListContainer>
                                    <ListRow isLast style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.clientName, { color: theme.text }]}>Trainer: {assignedPtData.name}</Text>
                                            <Text style={[styles.clientEmail, { color: theme.textSecondary }]}>Book your own 1-to-1 sessions here.</Text>
                                        </View>
                                        <Button variant="primary" size="sm" label="Book" onPress={() => setIsBookingOwnPt(true)} />
                                    </ListRow>
                                </ListContainer>
                            ) : (
                                <ActivityIndicator size="small" color={theme.tint} />
                            )
                        ) : (
                            <View>
                                <Text style={[styles.noPtSubText, { color: theme.textSecondary }]}>You don't have a Personal Trainer yet.</Text>
                                <TextInput
                                    style={[styles.codeInput, {
                                        backgroundColor: theme.card,
                                        borderColor: theme.border,
                                        color: theme.text,
                                        fontSize: 22,
                                        padding: Spacing.md,
                                        height: 56,
                                        marginTop: Spacing.lg - 1,
                                        letterSpacing: ptCodeInput.length > 0 ? 6 : 1,
                                    }]}
                                    placeholder="PT Code"
                                    placeholderTextColor={theme.textTertiary}
                                    value={ptCodeInput}
                                    onChangeText={(text) => setPtCodeInput(text.toUpperCase())}
                                    maxLength={6}
                                    autoCapitalize="characters"
                                />
                                <Button
                                    variant="primary"
                                    label="Assign My PT"
                                    onPress={handleAssignPT}
                                    disabled={!ptCodeInput || ptCodeInput.length < 6}
                                    loading={assigningLoading}
                                    style={{ marginTop: Spacing.sm + 2, maxWidth: 300, width: '100%' }}
                                />
                            </View>
                        )}
                    </View>

                    <Modal
                        transparent
                        animationType="fade"
                        visible={!!timePicker}
                        onRequestClose={() => setTimePicker(null)}
                    >
                        <TouchableOpacity
                            style={[styles.pickerOverlay, { backgroundColor: theme.overlay }]}
                            activeOpacity={1}
                            onPress={() => setTimePicker(null)}
                        >
                            <View style={[styles.pickerBox, { backgroundColor: theme.card }]}>
                                <Text style={[styles.pickerTitle, { color: theme.text }]}>
                                    {timePicker ? `${DAY_LABELS[Number(timePicker.day)]} ${timePicker.field === 'start' ? 'start' : 'finish'}` : ''}
                                </Text>
                                <ScrollView style={{ maxHeight: 320 }}>
                                    {TIME_OPTIONS.map(option => {
                                        const current = timePicker ? hoursDraft[timePicker.day as keyof WorkingHours]?.[timePicker.field] : undefined;
                                        const isSelected = current === option;
                                        return (
                                            <TouchableOpacity
                                                key={option}
                                                style={[styles.pickerOption, isSelected && { backgroundColor: theme.tintMuted }]}
                                                onPress={() => {
                                                    if (timePicker) setWorkingTime(timePicker.day, timePicker.field, option);
                                                    setTimePicker(null);
                                                }}
                                            >
                                                <Text style={[styles.pickerOptionText, { color: isSelected ? theme.tint : theme.text }]}>{option}</Text>
                                                {isSelected && <Ionicons name="checkmark" size={18} color={theme.tint} />}
                                            </TouchableOpacity>
                                        );
                                    })}
                                </ScrollView>
                            </View>
                        </TouchableOpacity>
                    </Modal>

                    <CustomAlert
                        visible={alertConfig.visible}
                        title={alertConfig.title}
                        message={alertConfig.message}
                        onClose={closeAlert}
                        onConfirm={alertConfig.onConfirm}
                    />
                </ScrollView>
            </SafeAreaView>
        );
    }

    if (userProfile?.role === 'client' && !userProfile.assignedPtId) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
                <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                        <View style={[styles.ptConnectContainer, { minHeight: Dimensions.get('window').height * 0.75 }]}>
                            {/* Icon */}
                            <View style={[styles.ptConnectIconWrap, { backgroundColor: theme.tintMuted }]}>
                                <Ionicons name="person-add-outline" size={40} color={theme.tint} />
                            </View>

                            <Text style={[styles.ptConnectTitle, { color: theme.text }]}>Connect with a PT</Text>
                            <Text style={[styles.ptConnectSubtitle, { color: theme.textSecondary }]}>
                                Enter the 6-character code provided by your Thrive Coach.
                            </Text>

                            {/* OTP-style character boxes */}
                            <TouchableOpacity
                                activeOpacity={1}
                                onPress={() => ptCodeInputRef.current?.focus()}
                                style={styles.otpRow}
                            >
                                {Array.from({ length: 6 }).map((_, i) => {
                                    const char = ptCodeInput[i] || '';
                                    const isFilled = !!char;
                                    return (
                                        <View
                                            key={i}
                                            style={[
                                                styles.otpBox,
                                                { backgroundColor: theme.card, borderColor: isFilled ? theme.tint : theme.border },
                                                isFilled && { shadowColor: theme.tint, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 6, elevation: 3 }
                                            ]}
                                        >
                                            <Text style={[styles.otpChar, { color: theme.text }]}>{char}</Text>
                                        </View>
                                    );
                                })}
                                <TextInput
                                    ref={ptCodeInputRef}
                                    style={styles.otpHiddenInput}
                                    value={ptCodeInput}
                                    onChangeText={(text) => setPtCodeInput(text.toUpperCase())}
                                    maxLength={6}
                                    autoCapitalize="characters"
                                    autoFocus
                                />
                            </TouchableOpacity>

                            <Button
                                variant="primary"
                                label="Connect to Trainer"
                                onPress={handleAssignPT}
                                disabled={!ptCodeInput || ptCodeInput.length < 6}
                                loading={assigningLoading}
                                style={{ width: '100%', shadowColor: theme.tint, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 4 }}
                            />
                        </View>
                    </KeyboardAvoidingView>
                </ScrollView>
                <CustomAlert visible={alertConfig.visible} title={alertConfig.title} message={alertConfig.message} onClose={closeAlert} onConfirm={alertConfig.onConfirm} />
            </SafeAreaView>
        );
    }

    if (userProfile?.role === 'client' || isBookingOwnPt) {
        const bookableSlots = ptSlots.filter(s => s.available);

        return (
            <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
                <View style={styles.headerContainer}>
                    <ScreenHeader
                        title={assignedPtData ? `Book with ${ptFirstName}` : 'Your PT'}
                        subtitle="Pick a time and send a request"
                        right={isBookingOwnPt ? backButton(() => setIsBookingOwnPt(false)) : undefined}
                    />
                </View>

                <View
                    style={[styles.dateSelectorContainer, { backgroundColor: theme.background, borderBottomColor: theme.border }]}
                    {...dragProps}
                >
                    <Text style={[styles.monthLabel, { color: theme.text }]}>{visibleMonth}</Text>
                    <FlatList
                        ref={flatListRef}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.dateSelector}
                        data={dates}
                        keyExtractor={(_, index) => index.toString()}
                        onScroll={onMouseDragScroll}
                        scrollEventThrottle={16}
                        onViewableItemsChanged={onViewableItemsChanged}
                        viewabilityConfig={viewabilityConfig}
                        getItemLayout={(_, index) => ({ length: 62, offset: 62 * index, index })}
                        onScrollToIndexFailed={(info) => {
                            setTimeout(() => {
                                flatListRef.current?.scrollToIndex({ index: info.index, animated: false });
                            }, 100);
                        }}
                        renderItem={({ item: date }) => {
                            const isSelected = selectedDate.getTime() === date.getTime();
                            return (
                                <TouchableOpacity
                                    style={[
                                        styles.dateCard,
                                        { backgroundColor: isSelected ? theme.tint : 'transparent' },
                                        isSelected && { ...styles.dateCardSelected, shadowColor: theme.tint }
                                    ]}
                                    onPress={() => setSelectedDate(date)}
                                >
                                    <Text style={[styles.dayText, { color: isSelected ? theme.onTint : theme.textSecondary }]}>
                                        {format(date, 'EEE')}
                                    </Text>
                                    <Text style={[styles.dateText, { color: isSelected ? theme.onTint : theme.text }]}>
                                        {format(date, 'd')}
                                    </Text>
                                </TouchableOpacity>
                            );
                        }}
                    />
                </View>

                <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
                    <View style={styles.slotsContainer}>
                        {loading || ptSlotsLoading ? (
                            <ActivityIndicator size="large" color={theme.tint} style={{ marginTop: 50 }} />
                        ) : !assignedPtData ? (
                            <Text style={[styles.noPtText, { color: theme.text, textAlign: 'center', marginTop: 40 }]}>
                                Failed to load your PT&apos;s details.
                            </Text>
                        ) : !ptDayWindow ? (
                            <EmptyState
                                icon="moon-outline"
                                title={`${ptFirstName} doesn't work ${format(selectedDate, 'EEEE')}s`}
                                subtitle="Try another day."
                            />
                        ) : ptSlots.length === 0 ? (
                            <EmptyState
                                icon="time-outline"
                                title="No more times left today"
                                subtitle={`${ptFirstName} works ${format(ptDayWindow.start, 'HH:mm')} – ${format(ptDayWindow.end, 'HH:mm')} on ${format(selectedDate, 'EEEE')}s.`}
                            />
                        ) : (
                            <>
                                <Text style={[styles.workingHoursHint, { color: theme.textSecondary }]}>
                                    {bookableSlots.length > 0
                                        ? `${bookableSlots.length} time${bookableSlots.length === 1 ? '' : 's'} available · ${format(ptDayWindow.start, 'HH:mm')} – ${format(ptDayWindow.end, 'HH:mm')}`
                                        : `Fully booked · ${format(ptDayWindow.start, 'HH:mm')} – ${format(ptDayWindow.end, 'HH:mm')}`}
                                </Text>
                                <View style={[styles.slotsList, { backgroundColor: theme.card, borderColor: theme.border }]}>
                                    {ptSlots.map((slot, index) => {
                                        const isLast = index === ptSlots.length - 1;
                                        return (
                                            <View key={slot.time.toISOString()}>
                                                <TouchableOpacity
                                                    style={[
                                                        styles.slotRow,
                                                        !slot.available && { backgroundColor: theme.cardAlt, opacity: 0.7 }
                                                    ]}
                                                    disabled={!slot.available || bookingLoading}
                                                    onPress={() => handleRequestPtSession(slot)}
                                                >
                                                    <View style={styles.slotTimeContainer}>
                                                        <Text style={[
                                                            styles.slotTime,
                                                            { color: slot.available ? theme.text : theme.textSecondary },
                                                            !slot.available && styles.slotTextUnavailable
                                                        ]}>
                                                            {format(slot.time, 'HH:mm')}
                                                        </Text>
                                                    </View>

                                                    <View style={styles.slotDetailsContainer}>
                                                        <Text style={[styles.slotDuration, { color: slot.available ? theme.tint : theme.textSecondary }]}>
                                                            {slot.available ? '1 Hour' : (slot.reason ?? 'Unavailable')}
                                                        </Text>
                                                        {slot.available && (
                                                            <Text style={[styles.slotAttendees, { color: theme.textSecondary }]}>
                                                                until {format(slot.endTime, 'HH:mm')}
                                                            </Text>
                                                        )}
                                                    </View>

                                                    <View style={styles.slotChevron}>
                                                        {slot.available && (
                                                            <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} opacity={0.5} />
                                                        )}
                                                    </View>
                                                </TouchableOpacity>
                                                {!isLast && <View style={[styles.separator, { backgroundColor: theme.border }]} />}
                                            </View>
                                        );
                                    })}
                                </View>
                            </>
                        )}
                    </View>

                    {/* Pending session requests */}
                    <View style={styles.clientsSection}>
                        <SectionHeader title={`Your Requests to ${ptFirstName}`} />
                        {clientPendingLoading ? (
                            <ActivityIndicator size="small" color={theme.tint} style={{ marginTop: 20 }} />
                        ) : clientPendingSessions.length === 0 ? (
                            <EmptyState icon="hourglass-outline" title="You have no requests awaiting approval." compact />
                        ) : (
                            <ListContainer>
                                {clientPendingSessions.map((session, index) => {
                                    const isLast = index === clientPendingSessions.length - 1;
                                    return (
                                        <ListRow key={session.id} isLast={isLast} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: Spacing.sm + 2 }}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={[styles.clientName, { color: theme.text }]}>PT Session Request</Text>
                                                <Text style={[styles.clientEmail, { color: theme.textSecondary }]}>
                                                    {format(session.startTime, 'EEE, MMM d')} • {format(session.startTime, 'HH:mm')} - {format(session.endTime, 'HH:mm')}
                                                </Text>
                                                <View style={{ marginTop: Spacing.xs }}>
                                                    <Badge label="Awaiting approval" tone="warning" />
                                                </View>
                                            </View>
                                            <Button
                                                variant="destructive"
                                                size="sm"
                                                label="Cancel Request"
                                                onPress={() => handleCancelPendingSession(session)}
                                                loading={cancellingSessionId === session.id}
                                            />
                                        </ListRow>
                                    );
                                })}
                            </ListContainer>
                        )}
                    </View>

                    {assignedPtData && (
                        <Text style={[styles.trainerFooter, { color: theme.textTertiary }]}>
                            Training with {assignedPtData.name} · requests need their approval
                        </Text>
                    )}
                </ScrollView>
                <CustomAlert visible={alertConfig.visible} title={alertConfig.title} message={alertConfig.message} onClose={closeAlert} onConfirm={alertConfig.onConfirm} />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            <View style={styles.headerContainer}>
                {(userProfile?.role === 'pt' || userProfile?.role === 'admin') && selectedClientForBooking ? (
                    <ScreenHeader
                        title={`Book for ${selectedClientForBooking.name.split(' ')[0]}`}
                        subtitle="Select a date and time"
                        right={backButton(() => setSelectedClientForBooking(null))}
                    />
                ) : isManagingAvailability ? (
                    <ScreenHeader title="Availability" right={backButton(() => setIsManagingAvailability(false))} />
                ) : (
                    <ScreenHeader title="Book PT Session" subtitle="Select a date and time" />
                )}
            </View>

            <View
                style={[styles.dateSelectorContainer, { backgroundColor: theme.background, borderBottomColor: theme.border }]}
                {...dragProps}
            >
                <Text style={[styles.monthLabel, { color: theme.text }]}>{visibleMonth}</Text>
                <FlatList
                    ref={flatListRef}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.dateSelector}
                    data={dates}
                    keyExtractor={(_, index) => index.toString()}
                    onScroll={onMouseDragScroll}
                    scrollEventThrottle={16}
                    onViewableItemsChanged={onViewableItemsChanged}
                    viewabilityConfig={viewabilityConfig}
                    getItemLayout={(_, index) => ({
                        length: 62, // minWidth (54) + gap (8)
                        offset: 62 * index,
                        index,
                    })}
                    onScrollToIndexFailed={(info) => {
                        setTimeout(() => {
                            flatListRef.current?.scrollToIndex({ index: info.index, animated: false });
                        }, 100);
                    }}
                    renderItem={({ item: date }) => {
                        const isSelected = selectedDate.getTime() === date.getTime();
                        return (
                            <TouchableOpacity
                                style={[
                                    styles.dateCard,
                                    { backgroundColor: isSelected ? theme.tint : 'transparent' },
                                    isSelected && { ...styles.dateCardSelected, shadowColor: theme.tint }
                                ]}
                                onPress={() => setSelectedDate(date)}
                            >
                                <Text style={[
                                    styles.dayText,
                                    { color: isSelected ? theme.onTint : theme.textSecondary }
                                ]}>
                                    {format(date, 'EEE')}
                                </Text>
                                <Text style={[
                                    styles.dateText,
                                    { color: isSelected ? theme.onTint : theme.text }
                                ]}>
                                    {format(date, 'd')}
                                </Text>
                            </TouchableOpacity>
                        );
                    }}
                />
            </View>

            {((userProfile?.role === 'pt' || userProfile?.role === 'admin') && selectedClientForBooking && !isManagingAvailability) && (
                <View style={[styles.frequencyContainer, { borderBottomColor: theme.border }]}>
                    <Text style={[styles.frequencyLabel, { color: theme.text }]}>Repeat Session:</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.frequencyScroll}>
                        {['none', 'weekly', 'bi-weekly', 'monthly'].map((freq) => (
                            <TouchableOpacity
                                key={freq}
                                style={[
                                    styles.freqButton,
                                    { borderColor: theme.border },
                                    recurringFrequency === freq && { backgroundColor: theme.tint, borderColor: theme.tint }
                                ]}
                                onPress={() => setRecurringFrequency(freq as any)}
                            >
                                <Text style={[
                                    styles.freqButtonText,
                                    { color: recurringFrequency === freq ? theme.onTint : theme.textSecondary }
                                ]}>
                                    {freq === 'none' ? 'No Repeat' : freq === 'bi-weekly' ? 'Bi-Weekly' : freq.charAt(0).toUpperCase() + freq.slice(1)}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            )}

            {isManagingAvailability && (
                <View style={[styles.availabilityControls, { borderBottomColor: theme.border }]}>
                    <View style={styles.controlRow}>
                        <Text style={[styles.controlLabel, { color: theme.textSecondary }]}>Repeat:</Text>
                        {['none', 'weekly', 'bi-weekly', 'monthly'].map((freq) => (
                            <TouchableOpacity
                                key={freq}
                                style={[
                                    styles.controlChip,
                                    { borderColor: theme.border },
                                    recurringFrequency === freq && { backgroundColor: theme.tint, borderColor: theme.tint }
                                ]}
                                onPress={() => setRecurringFrequency(freq as any)}
                            >
                                <Text style={[
                                    styles.controlChipText,
                                    { color: recurringFrequency === freq ? theme.onTint : theme.textSecondary }
                                ]}>
                                    {freq === 'none' ? 'None' : freq === 'bi-weekly' ? 'Bi-Wk' : freq.charAt(0).toUpperCase() + freq.slice(1)}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    <View style={styles.controlRow}>
                        <Text style={[styles.controlLabel, { color: theme.textSecondary }]}>Duration:</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
                            {[1, 2, 3, 4, 5, 6, 7, 8].map((hours) => (
                                <TouchableOpacity
                                    key={hours}
                                    style={[
                                        styles.controlChip,
                                        { borderColor: theme.border },
                                        blockDuration === hours && { backgroundColor: theme.tint, borderColor: theme.tint }
                                    ]}
                                    onPress={() => setBlockDuration(hours)}
                                >
                                    <Text style={[
                                        styles.controlChipText,
                                        { color: blockDuration === hours ? theme.onTint : theme.textSecondary }
                                    ]}>
                                        {hours}h
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                        <TouchableOpacity
                            style={[styles.controlChip, { borderColor: theme.tint, backgroundColor: theme.tintMuted, marginLeft: 4 }]}
                            onPress={() => {
                                const dayStart = setMinutes(setHours(selectedDate, PT_OPEN_HOUR), 0);
                                const dayEnd = setMinutes(setHours(selectedDate, PT_CLOSE_HOUR), 0);
                                const durationHours = PT_CLOSE_HOUR - PT_OPEN_HOUR;
                                setAlertConfig({
                                    visible: true,
                                    title: 'Block Entire Day',
                                    message: `Block off the entire day (${format(dayStart, 'HH:mm')} \u2013 ${format(dayEnd, 'HH:mm')}) on ${format(selectedDate, 'EEE, MMM d')}${recurringFrequency !== 'none' ? ' (' + recurringFrequency + ')' : ''}?`,
                                    onConfirm: () => confirmBooking(dayStart, user!.uid, 'pt_block', durationHours * 60)
                                });
                            }}
                        >
                            <Ionicons name="calendar" size={12} color={theme.tint} style={{ marginRight: 3 }} />
                            <Text style={[styles.controlChipText, { color: theme.tint, fontWeight: '700' }]}>All Day</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            <ScrollView contentContainerStyle={styles.slotsContainer}>
                {loading ? (
                    <ActivityIndicator size="large" color={theme.tint} style={{ marginTop: 50 }} />
                ) : availableSlots.length === 0 ? (
                    <Text style={[styles.noSlotsText, { color: theme.textSecondary }]}>No more slots available for this day.</Text>
                ) : (
                    <View style={[styles.slotsList, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        {availableSlots.map((slot, index) => {
                            const isLast = index === availableSlots.length - 1;

                            // Grouping outline logic
                            const hasGroup = !!slot.conflictBookingId;
                            const prevSlot = hasGroup && index > 0 ? availableSlots[index - 1] : null;
                            const nextSlot = hasGroup && index < availableSlots.length - 1 ? availableSlots[index + 1] : null;

                            const isFirstInBlock = hasGroup && prevSlot?.conflictBookingId !== slot.conflictBookingId;
                            const isLastInBlock = hasGroup && nextSlot?.conflictBookingId !== slot.conflictBookingId;
                            const isMiddleInBlock = hasGroup && !isFirstInBlock && !isLastInBlock;

                            let outlineStyle: any = {};
                            if (hasGroup) {
                                const bookingColors: Record<string, string> = {
                                    pt_block: theme.tint,
                                    pt: theme.success,
                                    gym: theme.info,
                                    group: '#8B5CF6',
                                    block: theme.textTertiary
                                };
                                const groupColor = bookingColors[slot.conflictBookingType ?? ''] || theme.tint;

                                outlineStyle = {
                                    borderColor: groupColor,
                                    borderLeftWidth: 2,
                                    borderRightWidth: 2,
                                };
                                if (isFirstInBlock) {
                                    outlineStyle.borderTopWidth = 2;
                                    outlineStyle.borderTopLeftRadius = Radii.sm;
                                    outlineStyle.borderTopRightRadius = Radii.sm;
                                    outlineStyle.marginTop = 4;
                                }
                                if (isLastInBlock) {
                                    outlineStyle.borderBottomWidth = 2;
                                    outlineStyle.borderBottomLeftRadius = Radii.sm;
                                    outlineStyle.borderBottomRightRadius = Radii.sm;
                                    outlineStyle.marginBottom = 4;
                                }
                            }

                            return (
                                <View key={index}>
                                    <TouchableOpacity
                                        style={[
                                            styles.slotRow,
                                            !slot.available && { backgroundColor: theme.cardAlt, opacity: 0.7 },
                                            outlineStyle
                                        ]}
                                        disabled={!slot.available || bookingLoading}
                                        onPress={() => handleBookSlot(slot)}
                                    >
                                        <View style={styles.slotTimeContainer}>
                                            <Text style={[
                                                styles.slotTime,
                                                { color: slot.available ? theme.text : theme.textSecondary },
                                                !slot.available && styles.slotTextUnavailable
                                            ]}>
                                                {format(slot.time, 'HH:mm')}
                                            </Text>
                                        </View>

                                        <View style={styles.slotDetailsContainer}>
                                            <Text style={[styles.slotDuration, { color: slot.available ? theme.tint : theme.textSecondary }]}>
                                                {slot.available ? (
                                                    // @ts-ignore
                                                    slot.isBlockedByMe ? 'Blocked (Tap to unblock)' : (slot.bookedPtCount === 1 ? '1/2 Booked' : '1 Hour')
                                                ) : (slot.conflictReason ?? 'Booked')}
                                            </Text>
                                            {slot.available && !((slot as any).isBlockedByMe) && (
                                                <Text style={[styles.slotAttendees, { color: theme.textSecondary, fontSize: 13, marginLeft: 10 }]}>
                                                    {slot.attendees} / 4 Booked
                                                </Text>
                                            )}
                                        </View>

                                        <View style={styles.slotChevron}>
                                            {slot.available && (
                                                <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} opacity={0.5} />
                                            )}
                                        </View>
                                    </TouchableOpacity>
                                    {(!isLast && !(hasGroup && !isLastInBlock)) && <View style={[styles.separator, { backgroundColor: theme.border }]} />}
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
    },
    headerContainer: {
        paddingHorizontal: Spacing.xl,
        paddingTop: Spacing.sm,
    },
    dateSelectorContainer: {
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    monthLabel: {
        fontSize: 13,
        fontWeight: '600',
        paddingHorizontal: 20,
        paddingTop: 8,
        paddingBottom: 0,
    },
    dateSelector: {
        paddingHorizontal: 15,
        paddingVertical: 8,
        gap: 6,
    },
    dateCard: {
        paddingVertical: 8,
        paddingHorizontal: 6,
        borderRadius: Radii.pill,
        alignItems: 'center',
        minWidth: 48,
    },
    dateCardSelected: {
        shadowColor: '#F26122',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    dayText: {
        fontSize: 11,
        textTransform: 'uppercase',
        fontWeight: '600',
        marginBottom: 4,
    },
    dateText: {
        fontSize: 20,
        fontWeight: '500',
    },
    slotsContainer: {
        padding: 16,
        paddingBottom: 40,
    },
    slotsList: {
        borderRadius: Radii.lg,
        borderWidth: StyleSheet.hairlineWidth,
        overflow: 'hidden',
    },
    slotRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
    },
    slotTimeContainer: {
        width: 70,
    },
    slotTime: {
        fontSize: 17,
        fontWeight: '600',
        letterSpacing: -0.4,
    },
    slotTextUnavailable: {
        textDecorationLine: 'line-through',
    },
    slotDetailsContainer: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingRight: 10,
    },
    slotDuration: {
        fontSize: 15,
        fontWeight: '600',
        // Longer reasons ("… has less than one hour available") wrap instead of
        // running past the chevron.
        flexShrink: 1,
    },
    slotAttendees: {
        fontSize: 14,
        fontWeight: '400',
    },
    slotChevron: {
        width: 20,
        alignItems: 'flex-end',
    },
    separator: {
        height: StyleSheet.hairlineWidth,
        marginLeft: 16,
    },
    noSlotsText: {
        textAlign: 'center',
        fontSize: 16,
        marginTop: 50,
    },
    noPtText: {
        fontSize: 18,
        fontWeight: '600',
        textAlign: 'center',
        paddingHorizontal: 20,
    },
    hoursIntro: {
        ...Typography.footnote,
        marginTop: -Spacing.xs,
        marginBottom: Spacing.md,
        lineHeight: 18,
    },
    hoursNotice: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        padding: Spacing.md,
        borderRadius: Radii.md,
        borderWidth: StyleSheet.hairlineWidth,
        marginBottom: Spacing.md,
    },
    hoursNoticeText: {
        ...Typography.footnote,
        flex: 1,
        lineHeight: 18,
    },
    hoursDayLabel: {
        ...Typography.subhead,
        fontWeight: '600',
        width: 86,
    },
    hoursValue: {
        ...Typography.subhead,
    },
    hoursRowControls: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        flexShrink: 1,
    },
    hoursChipRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
    },
    timeChip: {
        paddingVertical: 4,
        paddingHorizontal: Spacing.sm,
        borderRadius: Radii.sm,
        borderWidth: StyleSheet.hairlineWidth,
    },
    timeChipText: {
        ...Typography.footnote,
        fontWeight: '600',
    },
    hoursActions: {
        flexDirection: 'row',
        gap: Spacing.md,
        marginTop: Spacing.lg,
    },
    pickerOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: Spacing.xl,
    },
    pickerBox: {
        width: Platform.OS === 'web' ? 320 : '80%',
        borderRadius: Radii.xl,
        paddingVertical: Spacing.lg,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
        elevation: 8,
    },
    pickerTitle: {
        ...Typography.headline,
        textAlign: 'center',
        marginBottom: Spacing.md,
    },
    pickerOption: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: Spacing.md,
        paddingHorizontal: Spacing.xl,
    },
    pickerOptionText: {
        ...Typography.body,
    },
    workingHoursHint: {
        ...Typography.footnote,
        marginBottom: Spacing.sm,
        marginLeft: 4,
    },
    trainerFooter: {
        ...Typography.footnote,
        textAlign: 'center',
        marginTop: Spacing.xxl,
        paddingHorizontal: Spacing.xl,
    },
    noPtSubText: {
        fontSize: 14,
        marginTop: 10,
        textAlign: 'center',
        paddingHorizontal: 20,
    },
    ptCodeCard: {
        paddingVertical: 30,
        paddingHorizontal: 40,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: Radii.xl,
        alignItems: 'center',
        justifyContent: 'center',
        // Make it look like a pass
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
        elevation: 10,
    },
    ptCodeText: {
        fontSize: 48,
        fontWeight: '700',
        letterSpacing: 8,
    },
    codeInput: {
        width: '100%',
        maxWidth: 300,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: Radii.md,
        textAlign: 'center',
        letterSpacing: 6,
        fontWeight: 'bold',
        marginBottom: 20,
    },
    ptConnectContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
        paddingVertical: 40,
    },
    ptConnectIconWrap: {
        width: 88,
        height: 88,
        borderRadius: 44,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 28,
    },
    ptConnectTitle: {
        fontSize: 30,
        fontWeight: '700',
        letterSpacing: -0.5,
        textAlign: 'center',
        marginBottom: 10,
    },
    ptConnectSubtitle: {
        fontSize: 16,
        textAlign: 'center',
        lineHeight: 23,
        marginBottom: 44,
        paddingHorizontal: 8,
    },
    otpRow: {
        flexDirection: 'row',
        gap: 10,
        justifyContent: 'center',
        marginBottom: 36,
    },
    otpBox: {
        width: 48,
        height: 62,
        borderRadius: 12,
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    otpChar: {
        fontSize: 26,
        fontWeight: '700',
    },
    otpHiddenInput: {
        position: 'absolute',
        width: 1,
        height: 1,
        opacity: 0,
    },
    clientsSection: {
        paddingHorizontal: Spacing.xl,
        marginTop: Spacing.sm,
    },
    clientName: {
        ...Typography.headline,
    },
    clientEmail: {
        ...Typography.subhead,
        marginTop: 4,
    },
    clientTabs: {
        flexDirection: 'row',
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: Radii.md,
        padding: 3,
        marginBottom: Spacing.md,
    },
    clientTab: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: Spacing.sm,
        borderRadius: Radii.sm,
    },
    clientTabText: {
        ...Typography.subhead,
        fontWeight: '600',
    },
    clientRowActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    clientStatusBtn: {
        padding: Spacing.sm,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: Radii.sm,
    },
    backButton: {
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: Radii.sm,
    },
    backButtonText: {
        fontSize: 14,
        fontWeight: '600',
    },
    frequencyContainer: {
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    frequencyLabel: {
        fontSize: 15,
        fontWeight: '600',
        paddingHorizontal: 20,
        marginBottom: 8,
    },
    frequencyScroll: {
        paddingHorizontal: 15,
        gap: 8,
    },
    freqButton: {
        paddingVertical: 6,
        paddingHorizontal: 14,
        borderRadius: Radii.pill,
        borderWidth: StyleSheet.hairlineWidth,
    },
    availabilityControls: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
        gap: 6,
    },
    controlRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    controlLabel: {
        fontSize: 12,
        fontWeight: '700',
        width: 58,
    },
    controlChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: Radii.pill,
        borderWidth: 1,
    },
    controlChipText: {
        fontSize: 12,
        fontWeight: '600',
    },
    freqButtonText: {
        fontSize: 14,
        fontWeight: '500',
    }
});
