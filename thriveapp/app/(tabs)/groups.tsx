import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/auth';
import { createGroup, getPTGroups, Group, GroupInvite, inviteToGroup, getGroupMembers, getGroupInvites, getPendingInvitesForEmail, acceptGroupInvite, declineGroupInvite, getClientGroups } from '../../services/groupService';
import { getUserProfile, UserProfile, getGymBookingsForDate, bookGroupSession, checkSlotAvailability, Booking, getGroupSessions, cancelBooking } from '../../services/bookingService';
import { format, addDays, startOfDay, addMinutes, setHours, setMinutes, isBefore } from 'date-fns';
import { useRouter } from 'expo-router';
import CustomAlert from '../../components/CustomAlert';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radii } from '@/constants/theme';

const PT_OPEN_HOUR = 7;
const PT_CLOSE_HOUR = 20;

export default function GroupsScreen() {
    const { user } = useAuth();
    const router = useRouter();
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];
    
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [groups, setGroups] = useState<Group[]>([]);
    const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
    
    // Group Details State
    const [members, setMembers] = useState<UserProfile[]>([]);
    const [invites, setInvites] = useState<GroupInvite[]>([]);
    const [upcomingSessions, setUpcomingSessions] = useState<Booking[]>([]);
    const [detailsLoading, setDetailsLoading] = useState(false);

    // Client State
    const [pendingInvites, setPendingInvites] = useState<GroupInvite[]>([]);
    const [clientInvitesLoading, setClientInvitesLoading] = useState(false);
    const [clientGroups, setClientGroups] = useState<(Group & { ptName?: string })[]>([]);
    
    // Create Group State
    const [isCreateModalVisible, setCreateModalVisible] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const [creatingGroup, setCreatingGroup] = useState(false);
    
    // Invite State
    const [isInviteModalVisible, setInviteModalVisible] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviting, setInviting] = useState(false);
    
    // Booking State
    const [isBookingMode, setIsBookingMode] = useState(false);
    const [selectedDate, setSelectedDate] = useState<Date>(startOfDay(new Date()));
    const [availableSlots, setAvailableSlots] = useState<{ time: Date; available: boolean; attendees: number; blockReason?: string }[]>([]);
    const [slotsLoading, setSlotsLoading] = useState(false);
    const [bookingLoading, setBookingLoading] = useState(false);

    // Custom Alert
    const [alertConfig, setAlertConfig] = useState<{
        visible: boolean;
        title: string;
        message: string;
        isError?: boolean;
        isSuccess?: boolean;
        onConfirm?: () => void;
    }>({ visible: false, title: '', message: '' });

    const closeAlert = () => setAlertConfig(prev => ({ ...prev, visible: false }));

    const dates = Array.from({ length: 14 }).map((_, i) => addDays(startOfDay(new Date()), i));

    useEffect(() => {
        if (user) loadInitialData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    const loadInitialData = async () => {
        try {
            const profile = await getUserProfile(user!.uid);
            setUserProfile(profile);
            
            if (profile?.role === 'pt') {
                const ptGroups = await getPTGroups(user!.uid);
                setGroups(ptGroups);
            } else if (profile?.email) {
                const [invs, cGroups] = await Promise.all([
                    getPendingInvitesForEmail(profile.email),
                    getClientGroups(user!.uid)
                ]);
                setPendingInvites(invs);
                setClientGroups(cGroups);
            }
        } catch (error) {
            console.error('Error loading initial data', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchPendingInvites = async (email: string) => {
        setClientInvitesLoading(true);
        try {
            const [invs, cGroups] = await Promise.all([
                getPendingInvitesForEmail(email),
                getClientGroups(user!.uid)
            ]);
            setPendingInvites(invs);
            setClientGroups(cGroups);
        } catch (error) {
            console.error('Error fetching invites or groups:', error);
        } finally {
            setClientInvitesLoading(false);
        }
    };

    const handleAcceptInvite = async (invite: GroupInvite) => {
        if (!user) return;
        setClientInvitesLoading(true);
        try {
            await acceptGroupInvite(invite.id!, user.uid, invite.groupId);
            await fetchPendingInvites(userProfile!.email);
            setAlertConfig({ visible: true, title: 'Success', message: 'You have joined the group!', isSuccess: true });
        } catch (error) {
            console.error('Error accepting invite:', error);
            setAlertConfig({ visible: true, title: 'Error', message: 'Failed to accept invite.', isError: true });
        } finally {
            setClientInvitesLoading(false);
        }
    };

    const handleDeclineInvite = async (invite: GroupInvite) => {
        setClientInvitesLoading(true);
        try {
            await declineGroupInvite(invite.id!);
            await fetchPendingInvites(userProfile!.email);
            setAlertConfig({ visible: true, title: 'Declined', message: 'You declined the group invitation.' });
        } catch (error) {
            console.error('Error declining invite:', error);
            setAlertConfig({ visible: true, title: 'Error', message: 'Failed to decline invite.', isError: true });
        } finally {
            setClientInvitesLoading(false);
        }
    };

    const loadGroupDetails = async (group: Group) => {
        setSelectedGroup(group);
        setIsBookingMode(false);
        setDetailsLoading(true);
        try {
            const [groupMembers, groupInvites, sessions] = await Promise.all([
                getGroupMembers(group.id!),
                getGroupInvites(group.id!),
                getGroupSessions(group.id!)
            ]);
            setMembers(groupMembers);
            setInvites(groupInvites);
            setUpcomingSessions(sessions);
        } catch (error) {
            console.error('Error fetching group details:', error);
        } finally {
            setDetailsLoading(false);
        }
    };

    const handleCreateGroup = async () => {
        if (!newGroupName.trim()) {
            setAlertConfig({ visible: true, title: 'Error', message: 'Group name cannot be empty.', isError: true });
            return;
        }
        setCreatingGroup(true);
        try {
            await createGroup(user!.uid, newGroupName.trim());
            setCreateModalVisible(false);
            setNewGroupName('');
            await loadInitialData(); // Refresh groups
            setAlertConfig({ visible: true, title: 'Success', message: 'Group created successfully.', isSuccess: true });
        } catch (error) {
            console.error('Error creating group:', error);
            setAlertConfig({ visible: true, title: 'Error', message: 'Could not create group.', isError: true });
        } finally {
            setCreatingGroup(false);
        }
    };

    const handleInvite = async () => {
        if (!inviteEmail.trim() || !inviteEmail.includes('@')) {
            setAlertConfig({ visible: true, title: 'Error', message: 'Please enter a valid email address.', isError: true });
            return;
        }
        setInviting(true);
        try {
            await inviteToGroup(selectedGroup!.id!, inviteEmail.trim());
            setInviteModalVisible(false);
            setInviteEmail('');
            await loadGroupDetails(selectedGroup!); // Refresh details
            setAlertConfig({ visible: true, title: 'Success', message: 'Invitation sent.', isSuccess: true });
        } catch (error: any) {
            console.error('Error inviting user:', error);
            setAlertConfig({ visible: true, title: 'Error', message: error.message || 'Could not send invite.', isError: true });
        } finally {
            setInviting(false);
        }
    };

    // Booking Logic
    useEffect(() => {
        if (isBookingMode && selectedGroup) {
            fetchAvailability();
        }
    }, [selectedDate, isBookingMode, selectedGroup]);

    const fetchAvailability = async () => {
        if (!selectedGroup) return;
        setSlotsLoading(true);
        try {
            // Group booking blocks the gym and allows up to members length to join
            // We just need to check Gym Capacity (max 4 usually, but if blocking we just ensure NO ONE is currently booked in that slot maybe?)
            // Actually, if we are doing a group PT, we probably want to block the slot exclusively. 
            // So we check if ANYONE is booked at all in the gym. Wait, maybe we allow booking if there are 0 people?
            // Let's rely on standard logic: if it's available, we can block it.
            const gymBookingsForDay = await getGymBookingsForDate(selectedDate);
            
            const slots = [];
            let currentTime = setMinutes(setHours(selectedDate, PT_OPEN_HOUR), 0);
            const endTime = setMinutes(setHours(selectedDate, PT_CLOSE_HOUR), 0);
            const now = new Date();

            while (currentTime < endTime) {
                if (isBefore(currentTime, now)) {
                    currentTime = addMinutes(currentTime, 15);
                    continue;
                }

                // Check standard 1-hour availability.
                // We consider the gym "available" to block ONLY IF there are 0 overlapping active people.
                // Otherwise we can't book the whole gym for a private group.
                const targetEnd = addMinutes(currentTime, 60);
                const overlappingBookings = gymBookingsForDay.filter(b => {
                    return b.startTime < targetEnd && b.endTime > currentTime;
                });
                
                const uniqueBookings = Array.from(new Map(overlappingBookings.filter(b => b.id).map(b => [b.id, b])).values());
                const activeCount = uniqueBookings.filter(b => b.type === 'gym' || b.type === 'pt').length;
                const blockBooking = overlappingBookings.find(b => b.type === 'block');

                // For a private group, activeCount MUST be 0.
                const isAvailable = !blockBooking && activeCount === 0;

                slots.push({
                    time: currentTime,
                    available: isAvailable,
                    attendees: activeCount,
                    blockReason: blockBooking?.reason
                });

                currentTime = addMinutes(currentTime, 15);
            }

            setAvailableSlots(slots);
        } catch (error) {
            console.error('Error fetching availability:', error);
            setAlertConfig({ visible: true, title: 'Error', message: 'Failed to load slots.', isError: true });
        } finally {
            setSlotsLoading(false);
        }
    };

    const confirmBooking = async (startTime: Date) => {
        if (!selectedGroup) return;
        setBookingLoading(true);
        try {
            const endTime = addMinutes(startTime, 60); // 1 hour session
            await bookGroupSession(selectedGroup.id!, user!.uid, startTime, endTime);
            
            setAlertConfig({ visible: true, title: 'Success', message: 'Group session scheduled successfully!', isSuccess: true });
            setIsBookingMode(false); // return to group details
        } catch (error) {
            console.error('Error booking group session:', error);
            setAlertConfig({ visible: true, title: 'Error', message: 'Failed to book session.', isError: true });
        } finally {
            setBookingLoading(false);
        }
    };

    const handleSlotPress = (slot: any) => {
        setAlertConfig({
            visible: true,
            title: 'Confirm Booking',
            message: `Book a 1-hour session for ${selectedGroup?.name} at ${format(slot.time, 'HH:mm')}? This will block the gym for anyone else.`,
            onConfirm: () => confirmBooking(slot.time)
        });
    };

    const confirmCancellation = async (id: string) => {
        setDetailsLoading(true);
        try {
            await cancelBooking(id);
            await loadGroupDetails(selectedGroup!);
            setAlertConfig({ visible: true, title: 'Success', message: 'Session cancelled.', isSuccess: true, onConfirm: undefined });
        } catch (error) {
            console.error('Error cancelling session:', error);
            setAlertConfig({ visible: true, title: 'Error', message: 'Failed to cancel session.', isError: true, onConfirm: undefined });
        } finally {
            setDetailsLoading(false);
        }
    };

    const handleCancelSession = (session: Booking) => {
        setAlertConfig({
            visible: true,
            title: 'Cancel Session',
            message: `Are you sure you want to cancel the session on ${format(session.startTime, 'MMM d, HH:mm')}? This will cancel it for all members.`,
            onConfirm: () => confirmCancellation(session.id!)
        });
    };

    if (loading) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
                <ActivityIndicator size="large" color={theme.tint} style={{ marginTop: 50 }} />
            </SafeAreaView>
        );
    }

    if (userProfile?.role !== 'pt') {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
                <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
                    <Text style={[styles.title, { color: theme.text }]}>Groups</Text>
                    <Text style={[styles.subtitle, { color: theme.icon }]}>Manage your group training</Text>
                </View>
                <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
                    
                    {/* Client's Joined Groups Section */}
                    <View style={{ paddingHorizontal: 20, paddingTop: 10 }}>
                        <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 10 }]}>My Groups</Text>
                        {loading ? (
                            <ActivityIndicator color={theme.tint} />
                        ) : clientGroups.length === 0 ? (
                            <Text style={{ color: theme.icon, marginBottom: 20 }}>You haven't joined any groups yet.</Text>
                        ) : (
                            <View style={[styles.listWrapper, { backgroundColor: theme.card, borderColor: theme.border, marginBottom: 20 }]}>
                                {clientGroups.map((group, index) => {
                                    const isLast = index === clientGroups.length - 1;
                                    return (
                                        <View key={group.id}>
                                            <View style={styles.groupRow}>
                                                <View>
                                                    <Text style={[styles.groupNameText, { color: theme.text }]}>{group.name}</Text>
                                                    <Text style={[styles.groupMetaText, { color: theme.icon }]}>Trainer: {group.ptName}</Text>
                                                </View>
                                            </View>
                                            {!isLast && <View style={[styles.separator, { backgroundColor: theme.border, marginLeft: 16 }]} />}
                                        </View>
                                    );
                                })}
                            </View>
                        )}
                    </View>

                    {/* Pending Invites Section */}
                    <View style={{ paddingHorizontal: 20 }}>
                        <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 10 }]}>Group Invites</Text>
                        {clientInvitesLoading ? (
                            <ActivityIndicator color={theme.tint} />
                        ) : pendingInvites.length === 0 ? (
                            <Text style={{ color: theme.icon }}>You have no pending group invites.</Text>
                        ) : (
                            pendingInvites.map(inv => (
                                <View key={inv.id} style={{ backgroundColor: theme.card, padding: 16, borderRadius: Radii.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.border, marginBottom: 10 }}>
                                    <Text style={{ color: theme.text, fontSize: 18, fontWeight: '700', marginBottom: 4 }}>{inv.groupName}</Text>
                                    <Text style={{ color: theme.icon, marginBottom: 16 }}>Invited by {inv.ptName}</Text>
                                    <View style={{ flexDirection: 'row', gap: 10 }}>
                                        <TouchableOpacity style={{ flex: 1, padding: 12, borderRadius: Radii.pill, backgroundColor: theme.tint, alignItems: 'center' }} onPress={() => handleAcceptInvite(inv)}>
                                            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>Accept</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={{ flex: 1, padding: 12, borderRadius: Radii.pill, backgroundColor: 'rgba(239, 68, 68, 0.1)', alignItems: 'center' }} onPress={() => handleDeclineInvite(inv)}>
                                            <Text style={{ color: '#ef4444', fontWeight: '600', fontSize: 16 }}>Decline</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            ))
                        )}
                    </View>
                </ScrollView>
                <CustomAlert visible={alertConfig.visible} title={alertConfig.title} message={alertConfig.message} onClose={closeAlert} onConfirm={alertConfig.onConfirm} />
            </SafeAreaView>
        );
    }

    if (isBookingMode && selectedGroup) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
                <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View>
                            <Text style={[styles.title, { color: theme.text }]}>Book: {selectedGroup.name}</Text>
                            <Text style={[styles.subtitle, { color: theme.icon }]}>Select date and time</Text>
                        </View>
                        <TouchableOpacity onPress={() => setIsBookingMode(false)} style={[styles.backButton, { backgroundColor: theme.border }]}>
                            <Text style={[styles.backButtonText, { color: theme.text }]}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
                
                <View style={[styles.dateSelectorContainer, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateSelector}>
                        {dates.map((date, index) => {
                            const isSelected = selectedDate.getTime() === date.getTime();
                            return (
                                <TouchableOpacity
                                    key={index}
                                    style={[styles.dateCard, { backgroundColor: isSelected ? theme.tint : 'transparent' }, isSelected && styles.dateCardSelected]}
                                    onPress={() => setSelectedDate(date)}
                                >
                                    <Text style={[styles.dayText, { color: isSelected ? '#fff' : theme.icon }]}>{format(date, 'EEE')}</Text>
                                    <Text style={[styles.dateText, { color: isSelected ? '#fff' : theme.text }]}>{format(date, 'd')}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>
                
                <ScrollView contentContainerStyle={styles.slotsContainer}>
                    {slotsLoading ? (
                        <ActivityIndicator size="large" color={theme.tint} style={{ marginTop: 50 }} />
                    ) : availableSlots.length === 0 ? (
                        <Text style={{ textAlign: 'center', color: theme.icon }}>No slots available this day.</Text>
                    ) : (
                        <View style={[styles.slotsList, { backgroundColor: theme.card, borderColor: theme.border }]}>
                            {availableSlots.map((slot, index) => {
                                const isLast = index === availableSlots.length - 1;
                                return (
                                    <View key={index}>
                                        <TouchableOpacity
                                            style={[styles.slotRow, !slot.available && styles.slotRowUnavailable]}
                                            disabled={!slot.available || bookingLoading}
                                            onPress={() => handleSlotPress(slot)}
                                        >
                                            <View style={styles.slotTimeContainer}>
                                                <Text style={[styles.slotTime, { color: slot.available ? theme.text : theme.icon }, !slot.available && styles.slotTextUnavailable]}>
                                                    {format(slot.time, 'HH:mm')}
                                                </Text>
                                            </View>
                                            <View style={styles.slotDetailsContainer}>
                                                <Text style={[styles.slotDuration, { color: slot.available ? theme.tint : theme.icon }]}>
                                                    {slot.available ? '1 Hour' : (slot.blockReason || 'Gym in use')}
                                                </Text>
                                            </View>
                                            <View style={styles.slotChevron}>
                                                {slot.available && <Ionicons name="chevron-forward" size={20} color={theme.icon} opacity={0.5} />}
                                            </View>
                                        </TouchableOpacity>
                                        {!isLast && <View style={[styles.separator, { backgroundColor: theme.border }]} />}
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
                    onClose={closeAlert}
                    onConfirm={alertConfig.onConfirm}
                />
            </SafeAreaView>
        );
    }

    if (selectedGroup) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
                <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View>
                            <Text style={[styles.title, { color: theme.text }]}>{selectedGroup.name}</Text>
                            <Text style={[styles.subtitle, { color: theme.icon }]}>{members.length} Members</Text>
                        </View>
                        <TouchableOpacity onPress={() => setSelectedGroup(null)} style={[styles.backButton, { backgroundColor: theme.border }]}>
                            <Text style={[styles.backButtonText, { color: theme.text }]}>Back</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <ScrollView contentContainerStyle={{ padding: 20 }}>
                     <TouchableOpacity 
                        style={[styles.bookButton, { backgroundColor: theme.tint, marginBottom: 20 }]} 
                        onPress={() => setIsBookingMode(true)}
                    >
                        <Ionicons name="calendar-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                        <Text style={styles.bookButtonText}>Book Group Session</Text>
                    </TouchableOpacity>

                    <View style={styles.sectionHeader}>
                        <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 10 }]}>Upcoming Sessions</Text>
                    </View>
                    
                    {detailsLoading ? (
                        <ActivityIndicator color={theme.tint} />
                    ) : upcomingSessions.length === 0 ? (
                        <Text style={{ color: theme.icon, marginBottom: 20 }}>No sessions scheduled yet.</Text>
                    ) : (
                        <View style={[styles.listWrapper, { backgroundColor: theme.card, borderColor: theme.border, marginBottom: 20 }]}>
                            {upcomingSessions.map((session, i) => (
                                <View key={session.id}>
                                    <View style={[styles.listItem, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                                        <View>
                                            <Text style={[styles.listItemText, { color: theme.text }]}>
                                                {format(session.startTime, 'MMM do')}
                                            </Text>
                                            <Text style={[styles.listItemSub, { color: theme.icon }]}>
                                                {format(session.startTime, 'HH:mm')} - {format(session.endTime, 'HH:mm')}
                                            </Text>
                                        </View>
                                        <TouchableOpacity 
                                            style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radii.pill }}
                                            onPress={() => handleCancelSession(session)}
                                        >
                                            <Text style={{ color: '#ef4444', fontWeight: '600', fontSize: 13 }}>Cancel</Text>
                                        </TouchableOpacity>
                                    </View>
                                    {i < upcomingSessions.length - 1 && <View style={[styles.separator, { backgroundColor: theme.border, marginLeft: 0 }]} />}
                                </View>
                            ))}
                        </View>
                    )}

                    <View style={styles.sectionHeader}>
                        <Text style={[styles.sectionTitle, { color: theme.text }]}>Members</Text>
                        <TouchableOpacity onPress={() => setInviteModalVisible(true)}>
                            <Text style={{ color: theme.tint, fontWeight: '600' }}>+ Invite</Text>
                        </TouchableOpacity>
                    </View>
                    
                    {detailsLoading ? (
                        <ActivityIndicator color={theme.tint} />
                    ) : members.length === 0 ? (
                        <Text style={{ color: theme.icon, marginBottom: 20 }}>No members have joined yet.</Text>
                    ) : (
                        <View style={[styles.listWrapper, { backgroundColor: theme.card, borderColor: theme.border }]}>
                            {members.map((m, i) => (
                                <View key={m.id}>
                                    <View style={styles.listItem}>
                                        <Text style={[styles.listItemText, { color: theme.text }]}>{m.name}</Text>
                                        <Text style={[styles.listItemSub, { color: theme.icon }]}>{m.email}</Text>
                                    </View>
                                    {i < members.length - 1 && <View style={[styles.separator, { backgroundColor: theme.border, marginLeft: 0 }]} />}
                                </View>
                            ))}
                        </View>
                    )}

                    <View style={styles.sectionHeader}>
                        <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 10 }]}>Pending Invites</Text>
                    </View>
                    
                    {detailsLoading ? (
                        <ActivityIndicator color={theme.tint} />
                    ) : invites.filter(i => i.status === 'pending').length === 0 ? (
                        <Text style={{ color: theme.icon }}>No pending invites.</Text>
                    ) : (
                        <View style={[styles.listWrapper, { backgroundColor: theme.card, borderColor: theme.border }]}>
                            {invites.filter(inv => inv.status === 'pending').map((inv, i, arr) => (
                                <View key={inv.id}>
                                    <View style={styles.listItem}>
                                        <Text style={[styles.listItemText, { color: theme.text }]}>{inv.email}</Text>
                                        <Text style={[styles.listItemSub, { color: theme.icon }]}>Invited {format(inv.createdAt, 'MMM d')}</Text>
                                    </View>
                                    {i < arr.length - 1 && <View style={[styles.separator, { backgroundColor: theme.border, marginLeft: 0 }]} />}
                                </View>
                            ))}
                        </View>
                    )}
                </ScrollView>

                <Modal visible={isInviteModalVisible} transparent animationType="fade">
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
                        <View style={[styles.modalContent, { backgroundColor: theme.card, borderColor: theme.border }]}>
                            <Text style={[styles.modalTitle, { color: theme.text }]}>Invite Client</Text>
                            <Text style={[styles.modalSubtitle, { color: theme.icon }]}>Enter the client's email address</Text>
                            
                            <TextInput
                                style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                                placeholder="client@example.com"
                                placeholderTextColor={theme.icon}
                                value={inviteEmail}
                                onChangeText={setInviteEmail}
                                autoCapitalize="none"
                                keyboardType="email-address"
                            />
                            
                            <View style={styles.modalActions}>
                                <TouchableOpacity style={styles.modalCancel} onPress={() => setInviteModalVisible(false)} disabled={inviting}>
                                    <Text style={[styles.modalCancelText, { color: theme.icon }]}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.modalSubmit, { backgroundColor: theme.tint }]} onPress={handleInvite} disabled={inviting}>
                                    {inviting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.modalSubmitText}>Send Invite</Text>}
                                </TouchableOpacity>
                            </View>
                        </View>
                    </KeyboardAvoidingView>
                </Modal>

                <CustomAlert
                    visible={alertConfig.visible}
                    title={alertConfig.title}
                    message={alertConfig.message}
                    onClose={closeAlert}
                    onConfirm={alertConfig.onConfirm}
                />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View>
                        <Text style={[styles.title, { color: theme.text }]}>Your Groups</Text>
                        <Text style={[styles.subtitle, { color: theme.icon }]}>Manage group training</Text>
                    </View>
                    <TouchableOpacity style={[styles.addButton, { backgroundColor: theme.tint }]} onPress={() => setCreateModalVisible(true)}>
                        <Ionicons name="add" size={20} color="#fff" />
                        <Text style={styles.addButtonText}>New</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20 }}>
                {groups.length === 0 ? (
                    <View style={[styles.emptyState, { borderColor: theme.border }]}>
                        <Ionicons name="people-outline" size={48} color={theme.icon} />
                        <Text style={{ color: theme.text, fontSize: 18, fontWeight: '600', marginTop: 10 }}>No Groups Yet</Text>
                        <Text style={{ color: theme.icon, textAlign: 'center', marginTop: 5 }}>Create a group to invite clients and book shared sessions.</Text>
                    </View>
                ) : (
                    <View style={[styles.listWrapper, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        {groups.map((group, index) => {
                            const isLast = index === groups.length - 1;
                            return (
                                <View key={group.id}>
                                    <TouchableOpacity 
                                        style={styles.groupRow}
                                        onPress={() => loadGroupDetails(group)}    
                                    >
                                        <View>
                                            <Text style={[styles.groupNameText, { color: theme.text }]}>{group.name}</Text>
                                            <Text style={[styles.groupMetaText, { color: theme.icon }]}>Created {format(group.createdAt, 'MMM d, yyyy')}</Text>
                                        </View>
                                        <Ionicons name="chevron-forward" size={20} color={theme.icon} />
                                    </TouchableOpacity>
                                    {!isLast && <View style={[styles.separator, { backgroundColor: theme.border, marginLeft: 16 }]} />}
                                </View>
                            );
                        })}
                    </View>
                )}
            </ScrollView>

            <Modal visible={isCreateModalVisible} transparent animationType="fade">
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        <Text style={[styles.modalTitle, { color: theme.text }]}>Create Group</Text>
                        <Text style={[styles.modalSubtitle, { color: theme.icon }]}>Give your new training group a name</Text>
                        
                        <TextInput
                            style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                            placeholder="e.g. Mens 6am Class"
                            placeholderTextColor={theme.icon}
                            value={newGroupName}
                            onChangeText={setNewGroupName}
                            autoCapitalize="words"
                        />
                        
                        <View style={styles.modalActions}>
                            <TouchableOpacity style={styles.modalCancel} onPress={() => setCreateModalVisible(false)} disabled={creatingGroup}>
                                <Text style={[styles.modalCancelText, { color: theme.icon }]}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.modalSubmit, { backgroundColor: theme.tint }]} onPress={handleCreateGroup} disabled={creatingGroup}>
                                {creatingGroup ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.modalSubmitText}>Create</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
            
            <CustomAlert
                visible={alertConfig.visible}
                title={alertConfig.title}
                message={alertConfig.message}
                onClose={closeAlert}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 20, borderBottomWidth: StyleSheet.hairlineWidth },
    title: { fontSize: 34, fontWeight: '700', letterSpacing: -0.5 },
    subtitle: { fontSize: 16, marginTop: 4 },
    addButton: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radii.pill },
    addButtonText: { color: '#fff', fontWeight: '600', marginLeft: 4 },
    emptyState: { alignItems: 'center', justifyContent: 'center', padding: 40, borderStyle: 'dashed', borderWidth: 1, borderRadius: Radii.lg },
    listWrapper: { borderRadius: Radii.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', marginBottom: 20 },
    groupRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
    groupNameText: { fontSize: 17, fontWeight: '600' },
    groupMetaText: { fontSize: 14, marginTop: 4 },
    separator: { height: StyleSheet.hairlineWidth },
    
    // Details
    backButton: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radii.pill },
    backButtonText: { fontWeight: '600', fontSize: 14 },
    bookButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: Radii.pill },
    bookButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    sectionTitle: { fontSize: 20, fontWeight: '700' },
    listItem: { padding: 16 },
    listItemText: { fontSize: 16, fontWeight: '500' },
    listItemSub: { fontSize: 14, marginTop: 2 },
    
    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
    modalContent: { padding: 24, borderRadius: Radii.xl, borderWidth: 1 },
    modalTitle: { fontSize: 22, fontWeight: '700', marginBottom: 6 },
    modalSubtitle: { fontSize: 15, marginBottom: 20 },
    input: { padding: 16, borderRadius: Radii.lg, borderWidth: 1, fontSize: 16, marginBottom: 24 },
    modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
    modalCancel: { paddingHorizontal: 20, paddingVertical: 12, justifyContent: 'center' },
    modalCancelText: { fontWeight: '600', fontSize: 16 },
    modalSubmit: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: Radii.pill, justifyContent: 'center' },
    modalSubmitText: { color: '#fff', fontWeight: '600', fontSize: 16 },

    // Booking Slots
    dateSelectorContainer: { borderBottomWidth: StyleSheet.hairlineWidth },
    dateSelector: { paddingHorizontal: 15, paddingVertical: 12, gap: 8 },
    dateCard: { paddingVertical: 10, paddingHorizontal: 8, borderRadius: Radii.pill, alignItems: 'center', minWidth: 54 },
    dateCardSelected: { shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4, shadowColor: '#F26122' },
    dayText: { fontSize: 11, textTransform: 'uppercase', fontWeight: '600', marginBottom: 4 },
    dateText: { fontSize: 20, fontWeight: '500' },
    slotsContainer: { padding: 16, paddingBottom: 40 },
    slotsList: { borderRadius: Radii.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
    slotRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16 },
    slotRowUnavailable: { opacity: 0.6, backgroundColor: 'rgba(0,0,0,0.02)' },
    slotTimeContainer: { width: 70 },
    slotTime: { fontSize: 17, fontWeight: '600', letterSpacing: -0.4 },
    slotTextUnavailable: { textDecorationLine: 'line-through' },
    slotDetailsContainer: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingRight: 10 },
    slotDuration: { fontSize: 15, fontWeight: '600' },
    slotChevron: { width: 20, alignItems: 'flex-end' },
});
