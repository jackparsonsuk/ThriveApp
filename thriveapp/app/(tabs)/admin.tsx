import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, FlatList, Alert, Switch, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/auth';
import { getAllBookingsForDate, blockOutSlot, cancelBooking, Booking, UserProfile, getAllUsers, getUserProfile, updateUserProfile } from '../../services/bookingService';
import { getGlobalSettings, updateGlobalSettings, GlobalSettings } from '../../services/settingsService';
import { format, addDays, startOfDay, addMinutes, setHours, setMinutes, isToday, isBefore } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import CustomAlert from '../../components/CustomAlert';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radii } from '@/constants/theme';
import { BOOKING_WINDOW_DAYS } from '@/constants/config';
import { useMouseDragScroll } from '@/hooks/useMouseDragScroll';

// Operating hours
const OPEN_HOUR = 7;
const CLOSE_HOUR = 20;

type AdminTab = 'schedule' | 'members' | 'settings';

export default function AdminScreen() {
    const router = useRouter();
    const { user } = useAuth();
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];
    const [activeTab, setActiveTab] = useState<AdminTab>('schedule');
    const flatListRef = useRef<FlatList>(null);
    const scheduleRef = useRef<FlatList>(null);
    const [hasScrolledToToday, setHasScrolledToToday] = useState(false);
    const [userRole, setUserRole] = useState<string>('');
    
    // Schedule State
    const [selectedDate, setSelectedDate] = useState<Date>(startOfDay(new Date()));
    const [dailyBookings, setDailyBookings] = useState<(Booking & { user?: UserProfile })[]>([]);
    const [loading, setLoading] = useState(false);
    const { onScroll, dragProps } = useMouseDragScroll(flatListRef);

    // Members State
    const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
    const [membersLoading, setMembersLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [roleFilter, setRoleFilter] = useState<'all' | 'client' | 'pt' | 'admin'>('all');
    const [selectedMember, setSelectedMember] = useState<UserProfile | null>(null);

    // Settings State
    const [globalSettings, setGlobalSettings] = useState<GlobalSettings | null>(null);
    const [signupCode, setSignupCode] = useState('');
    const [savingCode, setSavingCode] = useState(false);
    const [isEditingSignupCode, setIsEditingSignupCode] = useState(false);

    const [announcementText, setAnnouncementText] = useState('');
    const [showAnnouncement, setShowAnnouncement] = useState(false);
    const [savingAnnouncement, setSavingAnnouncement] = useState(false);

    // Custom Alert State
    const [alertConfig, setAlertConfig] = useState<{
        visible: boolean;
        title: string;
        message: string;
        isDestructive?: boolean;
        confirmText?: string;
        cancelText?: string;
        onConfirm?: () => void;
    }>({ visible: false, title: '', message: '' });

    const closeAlert = () => setAlertConfig(prev => ({ ...prev, visible: false }));

    const dates = useMemo(() => Array.from({ length: 7 + BOOKING_WINDOW_DAYS }).map((_, i) => addDays(startOfDay(new Date()), i - 7)), []);

    useEffect(() => {
        if (activeTab === 'schedule') {
            fetchSchedule();
        } else if (activeTab === 'members') {
            fetchMembers();
        } else if (activeTab === 'settings') {
            fetchSettings();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDate, activeTab]);

    useEffect(() => {
        if (activeTab === 'schedule' && !hasScrolledToToday) {
            const timer = setTimeout(() => {
                flatListRef.current?.scrollToIndex({ index: 7, animated: false });
                setHasScrolledToToday(true);
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [activeTab, hasScrolledToToday]);

    const scheduleBlocks = useMemo(() => {
        const blocks = [];
        let currentTime = setMinutes(setHours(selectedDate, OPEN_HOUR), 0);
        const endTime = setMinutes(setHours(selectedDate, CLOSE_HOUR), 0);

        while (currentTime < endTime) {
            const blockEnd = addMinutes(currentTime, 15);
            const overlapping = dailyBookings.filter(b => b.startTime < blockEnd && b.endTime > currentTime);
            blocks.push({ time: currentTime, bookings: overlapping });
            currentTime = addMinutes(currentTime, 15);
        }
        return blocks;
    }, [selectedDate, dailyBookings]);

    useEffect(() => {
        if (activeTab === 'schedule' && isToday(selectedDate) && scheduleBlocks.length > 0) {
            const now = new Date();
            const totalMinutesFromStart = (now.getHours() - OPEN_HOUR) * 60 + now.getMinutes();
            let blockIndex = Math.floor(totalMinutesFromStart / 15);
            
            // Boundary checks
            if (blockIndex < 0) blockIndex = 0;
            if (blockIndex >= scheduleBlocks.length) blockIndex = scheduleBlocks.length - 1;

            if (blockIndex > 0) {
                const timer = setTimeout(() => {
                    scheduleRef.current?.scrollToIndex({ 
                        index: blockIndex, 
                        animated: true,
                        viewPosition: 0 
                    });
                }, 600);
                return () => clearTimeout(timer);
            }
        }
    }, [selectedDate, activeTab, scheduleBlocks.length]);

    useEffect(() => {
        if (user) {
            getUserProfile(user.uid).then(profile => {
                if (profile) setUserRole(profile.role);
            });
        }
    }, [user]);

    const fetchSchedule = async () => {
        setLoading(true);
        try {
            const bookings = await getAllBookingsForDate(selectedDate);
            setDailyBookings(bookings);
        } catch (error) {
            console.error('Error fetching admin schedule:', error);
            setAlertConfig({
                visible: true,
                title: 'Error',
                message: 'Failed to load the schedule.',
            });
        } finally {
            setLoading(false);
        }
    };

    const fetchMembers = async () => {
        setMembersLoading(true);
        try {
            const users = await getAllUsers();
            setAllUsers(users);
        } catch (error) {
            console.error('Error fetching members:', error);
            setAlertConfig({
                visible: true,
                title: 'Error',
                message: 'Failed to load members.',
            });
        } finally {
            setMembersLoading(false);
        }
    };

    const fetchSettings = async () => {
        setLoading(true);
        try {
            const settings = await getGlobalSettings();
            setGlobalSettings(settings);
            setSignupCode(settings?.signupCode || '');
            setAnnouncementText(settings?.announcementText || '');
            setShowAnnouncement(settings?.showAnnouncement || false);
        } catch (error) {
            console.error('Error fetching settings:', error);
            setAlertConfig({
                visible: true,
                title: 'Error',
                message: 'Failed to load settings.',
            });
        } finally {
            setLoading(false);
        }
    };

    const handleSaveSignupCode = async () => {
        if (!signupCode.trim()) {
            Alert.alert('Error', 'Signup code cannot be empty');
            return;
        }
        
        setSavingCode(true);
        try {
            await updateGlobalSettings({ signupCode: signupCode.trim() });
            setAlertConfig({
                visible: true,
                title: 'Success',
                message: 'Signup code updated successfully.',
                isDestructive: false
            });
        } catch (error) {
            console.error('Error saving signup code:', error);
            setAlertConfig({
                visible: true,
                title: 'Error',
                message: 'Failed to update signup code. Check permissions.',
                isDestructive: false
            });
        } finally {
            setSavingCode(false);
        }
    };

    const handleSaveAnnouncement = async () => {
        setSavingAnnouncement(true);
        try {
            await updateGlobalSettings({ 
                announcementText: announcementText.trim()
            });
            setAlertConfig({
                visible: true,
                title: 'Success',
                message: 'Announcement settings updated.',
                isDestructive: false
            });
        } catch (error) {
            console.error('Error saving announcement:', error);
            setAlertConfig({
                visible: true,
                title: 'Error',
                message: 'Failed to update announcement. Check permissions.',
                isDestructive: false
            });
        } finally {
            setSavingAnnouncement(false);
            fetchSettings(); // Refresh to catch any other changes
        }
    };

    const handleToggleAnnouncement = async (val: boolean) => {
        setShowAnnouncement(val);
        try {
            await updateGlobalSettings({ showAnnouncement: val });
        } catch (error) {
            console.error('Error saving announcement toggle:', error);
            // Revert state if it fails
            setShowAnnouncement(!val);
            setAlertConfig({
                visible: true,
                title: 'Error',
                message: 'Failed to update toggle.',
                isDestructive: false
            });
        }
    };

    const handleCancelBooking = (bookingId: string, userName: string) => {
        setAlertConfig({
            visible: true,
            title: 'Remove Client',
            message: `Are you sure you want to cancel the booking for ${userName}?`,
            isDestructive: true,
            confirmText: 'Remove',
            onConfirm: async () => {
                setLoading(true);
                try {
                    await cancelBooking(bookingId);
                    fetchSchedule();
                } catch {
                    setAlertConfig({ visible: true, title: 'Error', message: 'Failed to cancel booking.' });
                    setLoading(false);
                }
            }
        });
    };

    const handleBlockSlot = (time: Date) => {
        setAlertConfig({
            visible: true,
            title: 'Block Out Slot',
            message: `Prevent clients from booking 15 minutes at ${format(time, 'HH:mm')}?`,
            isDestructive: true,
            confirmText: 'Block Slot',
            onConfirm: async () => {
                if (!user) return;
                setLoading(true);
                try {
                    await blockOutSlot(user.uid, time, addMinutes(time, 15), 'Admin block out');
                    fetchSchedule();
                } catch {
                    setAlertConfig({ visible: true, title: 'Error', message: 'Failed to block slot.' });
                    setLoading(false);
                }
            }
        });
    };

    const filteredUsers = useMemo(() => {
        return allUsers.filter(u => {
            const matchesSearch = u.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                u.email?.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesRole = roleFilter === 'all' || u.role === roleFilter;
            return matchesSearch && matchesRole;
        }).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }, [allUsers, searchQuery, roleFilter]);

    const renderSchedule = () => {
        const now = new Date();
        const viewingToday = isToday(selectedDate);
        const isPastDate = isBefore(selectedDate, startOfDay(now));

        return (
            <View style={{ flex: 1 }}>
                {loading ? (
                    <ActivityIndicator size="large" color={theme.tint} style={{ marginTop: 50 }} />
                ) : (
                    <FlatList
                        ref={scheduleRef}
                        data={scheduleBlocks}
                        keyExtractor={(_, index) => index.toString()}
                        contentContainerStyle={styles.scheduleContainer}
                        initialNumToRender={20}
                        onScrollToIndexFailed={(info) => {
                            setTimeout(() => {
                                scheduleRef.current?.scrollToIndex({ index: info.index, animated: false });
                            }, 100);
                        }}
                        renderItem={({ item: block }) => {
                            const hasBlock = block.bookings.some((b: Booking) => b.type === 'block');
                            const blockEnd = addMinutes(block.time, 15);
                            const isPastSlot = isPastDate || (viewingToday && blockEnd <= now);

                            return (
                                <View style={[styles.timeBlock, { backgroundColor: theme.card, borderColor: theme.border }]}>
                                    <View style={[styles.timeHeader, { borderBottomColor: theme.border }]}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                            <Text style={[styles.timeText, { color: theme.text }]}>{format(block.time, 'HH:mm')}</Text>
                                            {viewingToday && block.time <= now && blockEnd > now && (
                                                <View style={{ backgroundColor: theme.tint, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>NOW</Text>
                                                </View>
                                            )}
                                        </View>
                                        {!hasBlock ? (
                                            !isPastSlot && (
                                                <TouchableOpacity style={[styles.blockBtn, { borderColor: theme.tint }]} onPress={() => handleBlockSlot(block.time)}>
                                                    <Ionicons name="lock-closed" size={14} color={theme.tint} />
                                                    <Text style={[styles.blockBtnText, { color: theme.tint }]}>Block Slot</Text>
                                                </TouchableOpacity>
                                            )
                                        ) : (
                                            <TouchableOpacity
                                                style={[styles.blockedBadge, isPastSlot && { opacity: 0.7 }]}
                                                onPress={() => {
                                                    if (isPastSlot) return;
                                                    const blockBooking = block.bookings.find((b: Booking) => b.type === 'block');
                                                    if (blockBooking && blockBooking.id) {
                                                        handleCancelBooking(blockBooking.id, 'this blocked slot');
                                                    }
                                                }}
                                            >
                                                <Ionicons name="lock-open" size={14} color="#fff" />
                                                <Text style={styles.blockedText}>{isPastSlot ? 'BLOCKED' : 'UNBLOCK'}</Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                    <View style={styles.attendeesList}>
                                        {block.bookings.length === 0 && !hasBlock && (
                                            <Text style={[styles.emptyText, { color: theme.icon }]}>No one booked.</Text>
                                        )}
                                        {(() => {
                                            const groupBlock = block.bookings.find((b: Booking) => b.type === 'block' && b.reason?.includes('Group Session'));
                                            if (groupBlock) {
                                                const groupName = groupBlock.reason?.replace('Group Session: ', '') || 'Group Session';
                                                return (
                                                    <View style={[styles.attendeeCard, { borderBottomColor: theme.border }]}>
                                                        <View style={styles.attendeeInfo}>
                                                            <Text style={[styles.attendeeName, { color: theme.text, fontStyle: 'italic' }]}>
                                                                (Blocked, {groupName})
                                                            </Text>
                                                        </View>
                                                        {!isPastSlot && (
                                                            <TouchableOpacity onPress={() => handleCancelBooking(groupBlock.id!, groupName)}>
                                                                <Ionicons name="close-circle" size={24} color={theme.icon} />
                                                            </TouchableOpacity>
                                                        )}
                                                    </View>
                                                );
                                            }

                                            return block.bookings.map((b: Booking & { user?: UserProfile }) => {
                                                if (b.type === 'block') return null;
                                                const userName = b.user?.name || b.user?.email || 'Unknown Client';
                                                return (
                                                    <View key={b.id} style={[styles.attendeeCard, { borderBottomColor: theme.border }]}>
                                                        <View style={styles.attendeeInfo}>
                                                            <Text style={[styles.attendeeName, { color: theme.text }]}>{userName}</Text>
                                                            <View style={styles.badgeContainer}>
                                                                {b.type === 'pt' ? (
                                                                    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                                                                        <Text style={[styles.ptBadge, { backgroundColor: theme.tint }]}>PT Session</Text>
                                                                        {(b as any).instructorName && (
                                                                            <Text style={{ fontSize: 13, fontWeight: '500', color: theme.icon }}>
                                                                                with {(b as any).instructorName}
                                                                            </Text>
                                                                        )}
                                                                    </View>
                                                                ) : (
                                                                    <>
                                                                        <Text style={styles.typeBadge}>{b.type.toUpperCase()}</Text>
                                                                        {b.type === 'group' && <Text style={styles.groupBadge}>Group</Text>}
                                                                    </>
                                                                )}
                                                            </View>
                                                        </View>
                                                        {!isPastSlot && (
                                                            <TouchableOpacity onPress={() => handleCancelBooking(b.id!, userName)}>
                                                                <Ionicons name="close-circle" size={24} color={theme.icon} />
                                                            </TouchableOpacity>
                                                        )}
                                                    </View>
                                                );
                                            });
                                        })()}
                                    </View>
                                </View>
                            );
                        }}
                    />
                )}
            </View>
        );
    };

    const handleToggleGymAccess = async (member: UserProfile, newVal: boolean) => {
        setSelectedMember(prev => prev ? { ...prev, canBookGym: newVal } : null);
        setAllUsers(prev => prev.map(u => u.id === member.id ? { ...u, canBookGym: newVal } : u));
        try {
            await updateUserProfile(member.id, { canBookGym: newVal });
        } catch (error) {
            console.error('Error updating gym access:', error);
            setSelectedMember(prev => prev ? { ...prev, canBookGym: !newVal } : null);
            setAllUsers(prev => prev.map(u => u.id === member.id ? { ...u, canBookGym: !newVal } : u));
            setAlertConfig({ visible: true, title: 'Error', message: 'Failed to update gym access.' });
        }
    };

    const renderMemberDetail = () => {
        if (!selectedMember) return null;
        return (
            <View style={styles.membersContainer}>
                <TouchableOpacity onPress={() => setSelectedMember(null)} style={styles.backRow}>
                    <Ionicons name="chevron-back" size={20} color={theme.tint} />
                    <Text style={[styles.backText, { color: theme.tint }]}>Members</Text>
                </TouchableOpacity>
                <View style={[styles.memberDetailCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <View style={[styles.avatar, { backgroundColor: theme.tint + '20', width: 60, height: 60, borderRadius: 30, marginBottom: 12 }]}>
                        <Text style={[styles.avatarText, { color: theme.tint, fontSize: 24 }]}>{(selectedMember.name || selectedMember.email).charAt(0).toUpperCase()}</Text>
                    </View>
                    <Text style={[styles.memberName, { color: theme.text, fontSize: 20, marginBottom: 4 }]}>{selectedMember.name || 'No Name'}</Text>
                    <Text style={[styles.memberEmail, { color: theme.icon, marginBottom: 12 }]}>{selectedMember.email}</Text>
                    <View style={[styles.roleBadge, { backgroundColor: selectedMember.role === 'admin' ? '#ef4444' : selectedMember.role === 'pt' ? theme.tint : '#a3a3a3', marginBottom: 20 }]}>
                        <Text style={styles.roleBadgeText}>{selectedMember.role.toUpperCase()}</Text>
                    </View>
                </View>

                {selectedMember.role === 'client' && (
                    <View style={[styles.settingsCard, { backgroundColor: theme.card, borderColor: theme.border, marginTop: 16 }]}>
                        <View style={styles.settingRow}>
                            <View style={styles.settingInfo}>
                                <Text style={[styles.settingLabel, { color: theme.text }]}>Gym Access</Text>
                                <Text style={[styles.settingDescription, { color: theme.icon }]}>Allow this client to independently book gym sessions.</Text>
                            </View>
                            <Switch
                                value={selectedMember.canBookGym ?? true}
                                onValueChange={(val) => handleToggleGymAccess(selectedMember, val)}
                                trackColor={{ false: theme.border, true: theme.tint }}
                            />
                        </View>
                    </View>
                )}
            </View>
        );
    };

    const renderMembers = () => {
        if (selectedMember) return renderMemberDetail();
        return (
        <View style={styles.membersContainer}>
            <View style={styles.searchBarContainer}>
                <Ionicons name="search" size={20} color={theme.icon} style={styles.searchIcon} />
                <TextInput
                    style={[styles.searchInput, { color: theme.text, backgroundColor: theme.card, borderColor: theme.border }]}
                    placeholder="Search members..."
                    placeholderTextColor={theme.icon}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                />
            </View>

            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.roleFilters}
                contentContainerStyle={styles.roleFiltersContent}
            >
                {['all', 'client', 'pt', 'admin'].map((role) => (
                    <TouchableOpacity
                        key={role}
                        onPress={() => setRoleFilter(role as any)}
                        style={[
                            styles.roleFilterBtn,
                            { borderColor: theme.border },
                            roleFilter === role && { backgroundColor: theme.tint, borderColor: theme.tint }
                        ]}
                    >
                        <Text style={[styles.roleFilterText, { color: roleFilter === role ? '#fff' : theme.icon }]}>
                            {role.charAt(0).toUpperCase() + role.slice(1)}s
                        </Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            {membersLoading ? (
                <View style={{ flex: 1, justifyContent: 'center' }}>
                    <ActivityIndicator size="large" color={theme.tint} />
                </View>
            ) : (
                <FlatList
                    data={filteredUsers}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            style={[styles.memberCard, { backgroundColor: theme.card, borderColor: theme.border }]}
                            onPress={() => setSelectedMember(item)}
                        >
                            <View style={[styles.avatar, { backgroundColor: theme.tint + '20' }]}>
                                <Text style={[styles.avatarText, { color: theme.tint }]}>{(item.name || item.email).charAt(0).toUpperCase()}</Text>
                            </View>
                            <View style={styles.memberInfo}>
                                <Text style={[styles.memberName, { color: theme.text }]}>{item.name || 'No Name'}</Text>
                                <Text style={[styles.memberEmail, { color: theme.icon }]}>{item.email}</Text>
                                <View style={styles.memberBadgeContainer}>
                                    <View style={[styles.roleBadge, { backgroundColor: item.role === 'admin' ? '#ef4444' : item.role === 'pt' ? theme.tint : '#a3a3a3' }]}>
                                        <Text style={styles.roleBadgeText}>{item.role.toUpperCase()}</Text>
                                    </View>
                                </View>
                            </View>
                            <Ionicons name="chevron-forward" size={20} color={theme.icon} />
                        </TouchableOpacity>
                    )}
                    ListEmptyComponent={<Text style={[styles.emptyText, { textAlign: 'center', marginTop: 20 }]}>No members found.</Text>}
                    contentContainerStyle={{ paddingBottom: 20 }}
                    style={{ flex: 1 }}
                />
            )}
        </View>
        );
    };

    const renderSettings = () => (
        <ScrollView style={styles.settingsContainer} contentContainerStyle={{ paddingBottom: 40 }}>
            {loading ? (
                <ActivityIndicator size="large" color={theme.tint} style={{ marginTop: 50 }} />
            ) : (
                <View style={styles.settingsSection}>
                    <Text style={[styles.sectionTitle, { color: theme.text }]}>Global Settings</Text>
                    <View style={[styles.settingsCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        <View style={styles.settingRow}>
                            <View style={styles.settingInfo}>
                                <Text style={[styles.settingLabel, { color: theme.text }]}>Signup Code</Text>
                                <Text style={[styles.settingDescription, { color: theme.icon }]}>
                                    Required for new client registrations. Give this code to clients so they can sign up.
                                </Text>
                            </View>
                            {!isEditingSignupCode && (
                                <TouchableOpacity 
                                    style={[styles.editButton, { borderColor: theme.border }]}
                                    onPress={() => setIsEditingSignupCode(true)}
                                >
                                    <Ionicons name="pencil" size={14} color={theme.text} />
                                    <Text style={[styles.editButtonText, { color: theme.text }]}>Edit</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                        
                        {isEditingSignupCode ? (
                            <View style={styles.inputContainer}>
                                <TextInput
                                    style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                                    value={signupCode}
                                    onChangeText={setSignupCode}
                                    placeholder="Enter signup code"
                                    placeholderTextColor={theme.icon}
                                    autoCapitalize="none"
                                />
                                
                                <TouchableOpacity 
                                    style={[styles.cancelButton, { backgroundColor: theme.border }]}
                                    onPress={() => {
                                        setIsEditingSignupCode(false);
                                        setSignupCode(globalSettings?.signupCode || '');
                                    }}
                                    disabled={savingCode}
                                >
                                    <Text style={[styles.cancelButtonText, { color: theme.text }]}>Cancel</Text>
                                </TouchableOpacity>

                                <TouchableOpacity 
                                    style={[styles.saveButton, { backgroundColor: theme.tint }]}
                                    onPress={async () => {
                                        await handleSaveSignupCode();
                                        setIsEditingSignupCode(false);
                                    }}
                                    disabled={savingCode || signupCode === globalSettings?.signupCode}
                                >
                                    {savingCode ? (
                                        <ActivityIndicator size="small" color="#fff" />
                                    ) : (
                                        <Text style={styles.saveButtonText}>Save</Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <View style={[styles.codeDisplayBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
                                <Text style={[styles.codeText, { color: theme.text }]}>
                                    {globalSettings?.signupCode || 'No code set'}
                                </Text>
                            </View>
                        )}
                    </View>

                    {/* App Announcement Banner Section */}
                    <View style={[styles.settingsCard, { backgroundColor: theme.card, borderColor: theme.border, marginTop: 20 }]}>
                        <View style={styles.settingRow}>
                            <View style={styles.settingInfo}>
                                <Text style={[styles.settingLabel, { color: theme.text }]}>App Announcement</Text>
                                <Text style={[styles.settingDescription, { color: theme.icon }]}>
                                    A global message displayed as a banner on every user's dashboard.
                                </Text>
                            </View>
                            <Switch
                                value={showAnnouncement}
                                onValueChange={handleToggleAnnouncement}
                                trackColor={{ false: theme.border, true: theme.tint }}
                            />
                        </View>
                        
                        <View style={[styles.inputContainer, { marginTop: 10 }]}>
                            <TextInput
                                style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text, minHeight: 80, textAlignVertical: 'top' }]}
                                value={announcementText}
                                onChangeText={setAnnouncementText}
                                placeholder="E.g., Gym closed for maintenance this Friday."
                                placeholderTextColor={theme.icon}
                                multiline
                            />
                        </View>
                        
                        <TouchableOpacity 
                            style={[styles.saveButton, { backgroundColor: theme.tint, marginTop: 15, alignSelf: 'flex-start' }]}
                            onPress={handleSaveAnnouncement}
                            disabled={savingAnnouncement || announcementText === (globalSettings?.announcementText || '')}
                        >
                            {savingAnnouncement ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <Text style={styles.saveButtonText}>Save Announcement</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            )}
        </ScrollView>
    );

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
                <View style={styles.headerTop}>
                    <Text style={[styles.title, { color: theme.text }]}>Admin Panel</Text>
                    {userRole === 'admin' && (
                        <TouchableOpacity 
                            style={[styles.analyticsBtn, { backgroundColor: theme.tint }]}
                            onPress={() => router.push('/analytics')}
                        >
                            <Ionicons name="stats-chart" size={18} color="#fff" />
                            <Text style={styles.analyticsBtnText}>Analytics</Text>
                        </TouchableOpacity>
                    )}
                </View>
                
                <View style={styles.tabContainer}>
                    <TouchableOpacity 
                        onPress={() => setActiveTab('schedule')}
                        style={[styles.tab, activeTab === 'schedule' && { borderBottomColor: theme.tint }]}
                    >
                        <Text style={[styles.tabText, { color: activeTab === 'schedule' ? theme.text : theme.icon }]}>Schedule</Text>
                    </TouchableOpacity>
                    {userRole === 'admin' && (
                        <>
                            <TouchableOpacity 
                                onPress={() => setActiveTab('members')}
                                style={[styles.tab, activeTab === 'members' && { borderBottomColor: theme.tint }]}
                            >
                                <Text style={[styles.tabText, { color: activeTab === 'members' ? theme.text : theme.icon }]}>Members</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                onPress={() => setActiveTab('settings')}
                                style={[styles.tab, activeTab === 'settings' && { borderBottomColor: theme.tint }]}
                            >
                                <Text style={[styles.tabText, { color: activeTab === 'settings' ? theme.text : theme.icon }]}>Settings</Text>
                            </TouchableOpacity>
                        </>
                    )}
                </View>
            </View>

            {activeTab === 'schedule' && (
                <View 
                    style={[styles.dateSelectorContainer, { backgroundColor: theme.background, borderBottomColor: theme.border }]}
                    {...dragProps}
                >
                    <FlatList
                        ref={flatListRef}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.dateSelector}
                        data={dates}
                        keyExtractor={(_, i) => i.toString()}
                        onScroll={onScroll}
                        scrollEventThrottle={16}
                        initialNumToRender={15}
                        onScrollToIndexFailed={(info) => {
                            setTimeout(() => {
                                flatListRef.current?.scrollToIndex({ index: info.index, animated: false });
                            }, 100);
                        }}
                        getItemLayout={(_, index) => ({
                            length: 62, // minWidth (54) + gap (8)
                            offset: 62 * index,
                            index,
                        })}
                        renderItem={({ item: date }) => {
                            const isSelected = selectedDate.getTime() === date.getTime();
                            return (
                                <TouchableOpacity
                                    style={[styles.dateCard, { backgroundColor: isSelected ? theme.tint : 'transparent' }, isSelected && styles.dateCardSelected]}
                                    onPress={() => setSelectedDate(date)}
                                >
                                    <Text style={[styles.dayText, { color: isSelected ? '#fff' : theme.icon }]}>{format(date, 'EEE')}</Text>
                                    <Text style={[styles.dateText, { color: isSelected ? '#fff' : theme.text }]}>{format(date, 'd')}</Text>
                                </TouchableOpacity>
                            );
                        }}
                    />
                </View>
            )}

            {activeTab === 'schedule' && renderSchedule()}
            {activeTab === 'members' && renderMembers()}
            {activeTab === 'settings' && renderSettings()}

            <CustomAlert
                visible={alertConfig.visible}
                title={alertConfig.title}
                message={alertConfig.message}
                isDestructive={alertConfig.isDestructive}
                confirmText={alertConfig.confirmText}
                cancelText={alertConfig.cancelText}
                onClose={closeAlert}
                onConfirm={alertConfig.onConfirm}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { paddingHorizontal: 20, paddingTop: 10, borderBottomWidth: StyleSheet.hairlineWidth },
    headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
    title: { fontSize: 34, fontWeight: '700', letterSpacing: -0.5 },
    analyticsBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radii.pill, gap: 6 },
    analyticsBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
    tabContainer: { flexDirection: 'row', gap: 20 },
    tab: { paddingVertical: 10, borderBottomWidth: 3, borderBottomColor: 'transparent' },
    tabText: { fontSize: 16, fontWeight: '700' },
    dateSelectorContainer: { borderBottomWidth: StyleSheet.hairlineWidth },
    dateSelector: { paddingHorizontal: 15, paddingVertical: 12, gap: 8 },
    dateCard: { paddingVertical: 10, paddingHorizontal: 8, borderRadius: Radii.pill, alignItems: 'center', minWidth: 54 },
    dateCardSelected: { shadowColor: '#F26122', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
    dayText: { fontSize: 11, textTransform: 'uppercase', fontWeight: '600', marginBottom: 4 },
    dateText: { fontSize: 20, fontWeight: '500' },
    scheduleContainer: { padding: 16, paddingBottom: 40 },
    timeBlock: { borderRadius: Radii.lg, marginBottom: 15, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
    timeHeader: { padding: 14, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    timeText: { fontSize: 18, fontWeight: '700', letterSpacing: -0.4 },
    blockBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radii.pill, borderWidth: 1 },
    blockBtnText: { fontSize: 13, fontWeight: '700', marginLeft: 6, textTransform: 'uppercase' },
    blockedBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(239, 68, 68, 0.2)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 9999, borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.5)' },
    blockedText: { color: '#ef4444', fontSize: 12, fontWeight: '700', marginLeft: 4 },
    attendeesList: { padding: 10 },
    emptyText: { fontStyle: 'italic', padding: 10 },
    attendeeCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderBottomWidth: StyleSheet.hairlineWidth },
    attendeeInfo: { flex: 1 },
    attendeeName: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
    badgeContainer: { flexDirection: 'row', gap: 6 },
    typeBadge: { fontSize: 10, fontWeight: '700', color: '#1a1a1a', backgroundColor: '#a3a3a3', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    ptBadge: { fontSize: 10, fontWeight: '700', color: '#ffffff', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    groupBadge: { fontSize: 10, fontWeight: '700', color: '#ffffff', backgroundColor: '#3b82f6', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    membersContainer: { flex: 1, padding: 16 },
    searchBarContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
    searchIcon: { position: 'absolute', left: 12, zIndex: 1 },
    searchInput: { flex: 1, height: 44, borderRadius: Radii.md, borderWidth: StyleSheet.hairlineWidth, paddingLeft: 40, paddingRight: 15, fontSize: 16 },
    roleFilters: { flexDirection: 'row', marginBottom: 15, maxHeight: 60 },
    roleFiltersContent: { paddingVertical: 5 },
    roleFilterBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radii.pill, borderWidth: 1, marginRight: 8, justifyContent: 'center' },
    roleFilterText: { fontSize: 14, fontWeight: '600' },
    memberCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: Radii.lg, borderWidth: StyleSheet.hairlineWidth, marginBottom: 10 },
    avatar: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    avatarText: { fontSize: 18, fontWeight: '700' },
    memberInfo: { flex: 1 },
    memberName: { fontSize: 16, fontWeight: '700' },
    memberEmail: { fontSize: 14, marginBottom: 4 },
    memberBadgeContainer: { flexDirection: 'row' },
    roleBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
    roleBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
    settingsContainer: { flex: 1, padding: 16 },
    settingsSection: { marginBottom: 30 },
    sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12, marginLeft: 4 },
    settingsCard: { borderRadius: Radii.lg, borderWidth: StyleSheet.hairlineWidth, padding: 16 },
    settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    settingInfo: { flex: 1 },
    settingLabel: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
    settingDescription: { fontSize: 13 },
    inputContainer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    input: { flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: Radii.md, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16 },
    saveButton: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: Radii.md, justifyContent: 'center', alignItems: 'center', minWidth: 80 },
    saveButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
    editButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radii.pill, borderWidth: StyleSheet.hairlineWidth },
    editButtonText: { fontSize: 13, fontWeight: '600' },
    cancelButton: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: Radii.md, justifyContent: 'center', alignItems: 'center', backgroundColor: 'transparent', borderWidth: StyleSheet.hairlineWidth },
    cancelButtonText: { fontSize: 14, fontWeight: '600' },
    codeDisplayBox: { padding: 16, borderRadius: Radii.md, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.02)' },
    codeText: { fontSize: 24, fontWeight: '700', letterSpacing: 2 },
    backRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 4 },
    backText: { fontSize: 16, fontWeight: '600' },
    memberDetailCard: { borderRadius: Radii.lg, borderWidth: StyleSheet.hairlineWidth, padding: 20, alignItems: 'center' },
});
