import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform, Modal, FlatList, ViewToken } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/auth';
import { createGroup, getPTGroups, Group, GroupInvite, inviteToGroup, getGroupMembers, getGroupInvites, getPendingInvitesForEmail, acceptGroupInvite, declineGroupInvite, getClientGroups, removeGroupMember, deleteGroup } from '../../services/groupService';
import { getUserProfile, UserProfile, getGymBookingsForDate, bookGroupSession, checkSlotAvailability, Booking, getGroupSessions, cancelBooking } from '../../services/bookingService';
import { format, addDays, startOfDay, addMinutes, setHours, setMinutes, isBefore } from 'date-fns';
import { useRouter } from 'expo-router';
import CustomAlert from '../../components/CustomAlert';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import { BOOKING_WINDOW_DAYS } from '@/constants/config';
import { useMouseDragScroll } from '@/hooks/useMouseDragScroll';
import { ScreenHeader, SectionHeader, EmptyState, Badge, Button, ListContainer, ListRow } from '@/components/ui';

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
    const flatListRef = useRef<FlatList>(null);
    const [hasInitialScrolled, setHasInitialScrolled] = useState(false);
    const { onScroll: onMouseDragScroll, dragProps } = useMouseDragScroll(flatListRef);
    const [visibleMonth, setVisibleMonth] = useState(format(new Date(), 'MMMM yyyy'));

    const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
        if (viewableItems.length > 0) {
            const middleItem = viewableItems[Math.floor(viewableItems.length / 2)];
            if (middleItem?.item) {
                setVisibleMonth(format(middleItem.item as Date, 'MMMM yyyy'));
            }
        }
    }, []);
    const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

    // Custom Alert
    const [alertConfig, setAlertConfig] = useState<{
        visible: boolean;
        title: string;
        message: string;
        isError?: boolean;
        isSuccess?: boolean;
        isDestructive?: boolean;
        confirmText?: string;
        cancelText?: string;
        onConfirm?: () => void;
    }>({ visible: false, title: '', message: '' });

    const closeAlert = () => setAlertConfig(prev => ({ ...prev, visible: false }));

    const dates = Array.from({ length: BOOKING_WINDOW_DAYS }).map((_, i) => addDays(startOfDay(new Date()), i));

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

    useEffect(() => {
        if (isBookingMode) {
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
        }
    }, [selectedDate, isBookingMode]);

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
            
            await loadGroupDetails(selectedGroup); // Refresh upcoming sessions list
            
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

    const handleRemoveMember = (member: UserProfile) => {
        setAlertConfig({
            visible: true,
            title: 'Remove Member',
            message: `Are you sure you want to remove ${member.name} from ${selectedGroup?.name}? This will also cancel their upcoming sessions for this group.`,
            isDestructive: true,
            confirmText: 'Remove',
            onConfirm: async () => {
                setDetailsLoading(true);
                try {
                    await removeGroupMember(selectedGroup!.id!, member.id);
                    await loadGroupDetails(selectedGroup!);
                    setAlertConfig({ visible: true, title: 'Success', message: 'Member removed.', isSuccess: true, onConfirm: undefined });
                } catch (error) {
                    console.error('Error removing member:', error);
                    setAlertConfig({ visible: true, title: 'Error', message: 'Failed to remove member.', isError: true, onConfirm: undefined });
                } finally {
                    setDetailsLoading(false);
                }
            }
        });
    };

    const handleDeleteGroup = () => {
        setAlertConfig({
            visible: true,
            title: 'Delete Group',
            message: `Are you entirely sure you want to delete ${selectedGroup?.name}? This will permanently remove the group, dismiss all members, and permanently cancel all upcoming group sessions entirely for everyone.`,
            isDestructive: true,
            confirmText: 'Delete Group',
            onConfirm: async () => {
                setDetailsLoading(true);
                try {
                    await deleteGroup(selectedGroup!.id!, selectedGroup!.name);
                    setAlertConfig({ 
                        visible: true, 
                        title: 'Success', 
                        message: 'Group permanently deleted.', 
                        isSuccess: true, 
                        onConfirm: () => setSelectedGroup(null) 
                    });
                    loadInitialData(); // refresh the main PT groups list
                } catch (error) {
                    console.error('Error deleting group:', error);
                    setAlertConfig({ visible: true, title: 'Error', message: 'Failed to delete the group.', isError: true, onConfirm: undefined });
                } finally {
                    setDetailsLoading(false);
                }
            }
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
                <View style={styles.headerContainer}>
                    <ScreenHeader title="Groups" subtitle="Manage your group training" />
                </View>
                <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>

                    {/* Client's Joined Groups Section */}
                    <View style={{ paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm }}>
                        <SectionHeader title="My Groups" />
                        {loading ? (
                            <ActivityIndicator color={theme.tint} />
                        ) : clientGroups.length === 0 ? (
                            <EmptyState icon="people-outline" title="You haven't joined any groups yet." compact />
                        ) : (
                            <ListContainer style={{ marginBottom: Spacing.xl }}>
                                {clientGroups.map((group, index) => {
                                    const isLast = index === clientGroups.length - 1;
                                    return (
                                        <ListRow key={group.id} isLast={isLast}>
                                            <Text style={[styles.groupNameText, { color: theme.text }]}>{group.name}</Text>
                                            <Text style={[styles.groupMetaText, { color: theme.textSecondary }]}>Trainer: {group.ptName}</Text>
                                        </ListRow>
                                    );
                                })}
                            </ListContainer>
                        )}
                    </View>

                    {/* Pending Invites Section */}
                    <View style={{ paddingHorizontal: Spacing.xl }}>
                        <SectionHeader title="Group Invites" />
                        {clientInvitesLoading ? (
                            <ActivityIndicator color={theme.tint} />
                        ) : pendingInvites.length === 0 ? (
                            <EmptyState icon="mail-outline" title="You have no pending group invites." compact />
                        ) : (
                            pendingInvites.map(inv => (
                                <View key={inv.id} style={{ backgroundColor: theme.card, padding: Spacing.lg, borderRadius: Radii.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.border, marginBottom: Spacing.md }}>
                                    <Text style={{ color: theme.text, ...Typography.title3, fontSize: 18, marginBottom: 4 }}>{inv.groupName}</Text>
                                    <Text style={{ color: theme.textSecondary, marginBottom: Spacing.lg }}>Invited by {inv.ptName}</Text>
                                    <View style={{ flexDirection: 'row', gap: Spacing.md }}>
                                        <Button variant="primary" label="Accept" onPress={() => handleAcceptInvite(inv)} style={{ flex: 1 }} />
                                        <Button variant="destructive" label="Decline" onPress={() => handleDeclineInvite(inv)} style={{ flex: 1 }} />
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
                <View style={styles.headerContainer}>
                    <ScreenHeader
                        title={`Book: ${selectedGroup.name}`}
                        subtitle="Select date and time"
                        right={
                            <TouchableOpacity onPress={() => setIsBookingMode(false)} style={[styles.backButton, { backgroundColor: theme.cardAlt }]}>
                                <Text style={[styles.backButtonText, { color: theme.text }]}>Cancel</Text>
                            </TouchableOpacity>
                        }
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
                                    style={[styles.dateCard, { backgroundColor: isSelected ? theme.tint : 'transparent' }, isSelected && { ...styles.dateCardSelected, shadowColor: theme.tint }]}
                                    onPress={() => setSelectedDate(date)}
                                >
                                    <Text style={[styles.dayText, { color: isSelected ? theme.onTint : theme.textSecondary }]}>{format(date, 'EEE')}</Text>
                                    <Text style={[styles.dateText, { color: isSelected ? theme.onTint : theme.text }]}>{format(date, 'd')}</Text>
                                </TouchableOpacity>
                            );
                        }}
                    />
                </View>

                <ScrollView contentContainerStyle={styles.slotsContainer}>
                    {slotsLoading ? (
                        <ActivityIndicator size="large" color={theme.tint} style={{ marginTop: 50 }} />
                    ) : availableSlots.length === 0 ? (
                        <Text style={{ textAlign: 'center', color: theme.textSecondary }}>No slots available this day.</Text>
                    ) : (
                        <View style={[styles.slotsList, { backgroundColor: theme.card, borderColor: theme.border }]}>
                            {availableSlots.map((slot, index) => {
                                const isLast = index === availableSlots.length - 1;
                                return (
                                    <View key={index}>
                                        <TouchableOpacity
                                            style={[styles.slotRow, !slot.available && { backgroundColor: theme.cardAlt, opacity: 0.7 }]}
                                            disabled={!slot.available || bookingLoading}
                                            onPress={() => handleSlotPress(slot)}
                                        >
                                            <View style={styles.slotTimeContainer}>
                                                <Text style={[styles.slotTime, { color: slot.available ? theme.text : theme.textSecondary }, !slot.available && styles.slotTextUnavailable]}>
                                                    {format(slot.time, 'HH:mm')}
                                                </Text>
                                            </View>
                                            <View style={styles.slotDetailsContainer}>
                                                <Text style={[styles.slotDuration, { color: slot.available ? theme.tint : theme.textSecondary }]}>
                                                    {slot.available ? '1 Hour' : (slot.blockReason || 'Gym in use')}
                                                </Text>
                                            </View>
                                            <View style={styles.slotChevron}>
                                                {slot.available && <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} opacity={0.5} />}
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
                <View style={styles.headerContainer}>
                    <ScreenHeader
                        title={selectedGroup.name}
                        subtitle={`${members.length} Members`}
                        right={
                            <TouchableOpacity onPress={() => setSelectedGroup(null)} style={[styles.backButton, { backgroundColor: theme.cardAlt }]}>
                                <Text style={[styles.backButtonText, { color: theme.text }]}>Back</Text>
                            </TouchableOpacity>
                        }
                    />
                </View>

                <ScrollView contentContainerStyle={{ padding: Spacing.xl }}>
                    <Button
                        variant="primary"
                        icon="calendar-outline"
                        label="Book Group Session"
                        onPress={() => setIsBookingMode(true)}
                        style={{ marginBottom: Spacing.xl }}
                    />

                    <SectionHeader title="Upcoming Sessions" />

                    {detailsLoading ? (
                        <ActivityIndicator color={theme.tint} />
                    ) : upcomingSessions.length === 0 ? (
                        <EmptyState icon="calendar-outline" title="No sessions scheduled yet." compact />
                    ) : (
                        <ListContainer style={{ marginBottom: Spacing.xl }}>
                            {upcomingSessions.map((session, i) => (
                                <ListRow key={session.id} isLast={i === upcomingSessions.length - 1} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <View>
                                        <Text style={[styles.listItemText, { color: theme.text }]}>
                                            {format(session.startTime, 'MMM do')}
                                        </Text>
                                        <Text style={[styles.listItemSub, { color: theme.textSecondary }]}>
                                            {format(session.startTime, 'HH:mm')} - {format(session.endTime, 'HH:mm')}
                                        </Text>
                                    </View>
                                    <Button variant="destructive" size="sm" label="Cancel" onPress={() => handleCancelSession(session)} />
                                </ListRow>
                            ))}
                        </ListContainer>
                    )}

                    <SectionHeader
                        title="Members"
                        action={
                            <TouchableOpacity onPress={() => setInviteModalVisible(true)}>
                                <Text style={{ color: theme.tint, fontWeight: '600' }}>+ Invite</Text>
                            </TouchableOpacity>
                        }
                    />

                    {detailsLoading ? (
                        <ActivityIndicator color={theme.tint} />
                    ) : members.length === 0 ? (
                        <EmptyState icon="person-outline" title="No members have joined yet." compact />
                    ) : (
                        <ListContainer style={{ marginBottom: Spacing.xl }}>
                            {members.map((m, i) => (
                                <ListRow key={m.id} isLast={i === members.length - 1} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <View>
                                        <Text style={[styles.listItemText, { color: theme.text }]}>{m.name}</Text>
                                        <Text style={[styles.listItemSub, { color: theme.textSecondary }]}>{m.email}</Text>
                                    </View>
                                    <TouchableOpacity
                                        style={{ paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm }}
                                        onPress={() => handleRemoveMember(m)}
                                    >
                                        <Ionicons name="close-circle" size={24} color={theme.textSecondary} />
                                    </TouchableOpacity>
                                </ListRow>
                            ))}
                        </ListContainer>
                    )}

                    <SectionHeader title="Pending Invites" />

                    {detailsLoading ? (
                        <ActivityIndicator color={theme.tint} />
                    ) : invites.filter(i => i.status === 'pending').length === 0 ? (
                        <EmptyState icon="mail-outline" title="No pending invites." compact />
                    ) : (
                        <ListContainer>
                            {invites.filter(inv => inv.status === 'pending').map((inv, i, arr) => (
                                <ListRow key={inv.id} isLast={i === arr.length - 1}>
                                    <Text style={[styles.listItemText, { color: theme.text }]}>{inv.email}</Text>
                                    <Text style={[styles.listItemSub, { color: theme.textSecondary }]}>Invited {format(inv.createdAt, 'MMM d')}</Text>
                                </ListRow>
                            ))}
                        </ListContainer>
                    )}

                    {/* Danger Zone: Delete Group */}
                    {userProfile?.role === 'pt' && (
                        <View style={{ marginTop: Spacing.huge, marginBottom: Spacing.huge }}>
                            <Text style={[styles.sectionTitle, { color: theme.danger, marginBottom: Spacing.lg - 1 }]}>Danger Zone</Text>
                            <Button
                                variant="destructive"
                                icon="trash-outline"
                                label="Delete Group"
                                onPress={handleDeleteGroup}
                            />
                            <Text style={{ color: theme.textSecondary, fontSize: 13, textAlign: 'center', marginTop: Spacing.sm + 2 }}>
                                This will irrevocably cancel all upcoming sessions along with deleting the group itself.
                            </Text>
                        </View>
                    )}
                </ScrollView>

                <Modal visible={isInviteModalVisible} transparent animationType="fade">
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}>
                        <View style={[styles.modalContent, { backgroundColor: theme.card, borderColor: theme.border }]}>
                            <Text style={[styles.modalTitle, { color: theme.text }]}>Invite Client</Text>
                            <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>Enter the client's email address</Text>

                            <TextInput
                                style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                                placeholder="client@example.com"
                                placeholderTextColor={theme.textTertiary}
                                value={inviteEmail}
                                onChangeText={setInviteEmail}
                                autoCapitalize="none"
                                keyboardType="email-address"
                            />

                            <View style={styles.modalActions}>
                                <TouchableOpacity style={styles.modalCancel} onPress={() => setInviteModalVisible(false)} disabled={inviting}>
                                    <Text style={[styles.modalCancelText, { color: theme.textSecondary }]}>Cancel</Text>
                                </TouchableOpacity>
                                <Button variant="primary" label="Send Invite" onPress={handleInvite} loading={inviting} />
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
            <View style={styles.headerContainer}>
                <ScreenHeader
                    title="Your Groups"
                    subtitle="Manage group training"
                    right={
                        <Button variant="primary" size="sm" icon="add" label="New" onPress={() => setCreateModalVisible(true)} />
                    }
                />
            </View>

            <ScrollView contentContainerStyle={{ padding: Spacing.xl }}>
                {groups.length === 0 ? (
                    <EmptyState icon="people-outline" title="No Groups Yet" subtitle="Create a group to invite clients and book shared sessions." />
                ) : (
                    <ListContainer>
                        {groups.map((group, index) => {
                            const isLast = index === groups.length - 1;
                            return (
                                <ListRow key={group.id} isLast={isLast} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <TouchableOpacity
                                        style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                                        onPress={() => loadGroupDetails(group)}
                                    >
                                        <View>
                                            <Text style={[styles.groupNameText, { color: theme.text }]}>{group.name}</Text>
                                            <Text style={[styles.groupMetaText, { color: theme.textSecondary }]}>Created {format(group.createdAt, 'MMM d, yyyy')}</Text>
                                        </View>
                                        <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
                                    </TouchableOpacity>
                                </ListRow>
                            );
                        })}
                    </ListContainer>
                )}
            </ScrollView>

            <Modal visible={isCreateModalVisible} transparent animationType="fade">
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}>
                    <View style={[styles.modalContent, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        <Text style={[styles.modalTitle, { color: theme.text }]}>Create Group</Text>
                        <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>Give your new training group a name</Text>

                        <TextInput
                            style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                            placeholder="e.g. Mens 6am Class"
                            placeholderTextColor={theme.textTertiary}
                            value={newGroupName}
                            onChangeText={setNewGroupName}
                            autoCapitalize="words"
                        />

                        <View style={styles.modalActions}>
                            <TouchableOpacity style={styles.modalCancel} onPress={() => setCreateModalVisible(false)} disabled={creatingGroup}>
                                <Text style={[styles.modalCancelText, { color: theme.textSecondary }]}>Cancel</Text>
                            </TouchableOpacity>
                            <Button variant="primary" label="Create" onPress={handleCreateGroup} loading={creatingGroup} />
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
    headerContainer: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm },
    groupNameText: { ...Typography.headline },
    groupMetaText: { ...Typography.subhead, marginTop: 4 },
    separator: { height: StyleSheet.hairlineWidth },

    // Details
    backButton: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radii.pill },
    backButtonText: { fontWeight: '600', fontSize: 14 },
    sectionTitle: { ...Typography.title3 },
    listItemText: { ...Typography.bodyMedium },
    listItemSub: { ...Typography.footnote, marginTop: 2 },

    // Modal
    modalOverlay: { flex: 1, justifyContent: 'center', padding: Spacing.xl },
    modalContent: { padding: Spacing.xxl, borderRadius: Radii.xl, borderWidth: 1 },
    modalTitle: { ...Typography.title2, marginBottom: 6 },
    modalSubtitle: { ...Typography.subhead, marginBottom: Spacing.xl },
    input: { padding: Spacing.lg, borderRadius: Radii.lg, borderWidth: 1, fontSize: 16, marginBottom: Spacing.xxl },
    modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.md },
    modalCancel: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, justifyContent: 'center' },
    modalCancelText: { fontWeight: '600', fontSize: 16 },

    // Booking Slots
    dateSelectorContainer: { borderBottomWidth: StyleSheet.hairlineWidth },
    monthLabel: { fontSize: 14, fontWeight: '600', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 2 },
    dateSelector: { paddingHorizontal: 15, paddingVertical: 12, gap: 8 },
    dateCard: { paddingVertical: 10, paddingHorizontal: 8, borderRadius: Radii.pill, alignItems: 'center', minWidth: 54 },
    dateCardSelected: { shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
    dayText: { fontSize: 11, textTransform: 'uppercase', fontWeight: '600', marginBottom: 4 },
    dateText: { fontSize: 20, fontWeight: '500' },
    slotsContainer: { padding: 16, paddingBottom: 40 },
    slotsList: { borderRadius: Radii.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
    slotRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16 },
    slotTimeContainer: { width: 70 },
    slotTime: { fontSize: 17, fontWeight: '600', letterSpacing: -0.4 },
    slotTextUnavailable: { textDecorationLine: 'line-through' },
    slotDetailsContainer: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingRight: 10 },
    slotDuration: { fontSize: 15, fontWeight: '600' },
    slotChevron: { width: 20, alignItems: 'flex-end' },
});
