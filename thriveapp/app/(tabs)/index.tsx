import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Modal, FlatList } from 'react-native';
import { useAuth } from '../../context/auth';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getUserBookings, getPTBookingsForInstructor, getUserCancelledUpcomingBookings, getPTCancelledBookingsForInstructor, cancelBooking, cancelRecurringSeries, Booking, getUserProfile, UserProfile, getClientsForPt, createBooking, getPendingPTRequestsForPT } from '../../services/bookingService';
import { getGroupById } from '../../services/groupService';
import { getGlobalSettings, GlobalSettings } from '../../services/settingsService';
import { format, isSameDay, isToday, isTomorrow } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import CustomAlert from '../../components/CustomAlert';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import UpdateBanner from '../../components/UpdateBanner';
import { Card, SectionHeader, EmptyState, Badge, Button, ListContainer, ListRow } from '@/components/ui';

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

const getGreetingIcon = (): keyof typeof Ionicons.glyphMap => {
  const hour = new Date().getHours();
  if (hour < 6 || hour >= 20) return 'moon-outline';
  if (hour < 12) return 'partly-sunny-outline';
  return 'sunny-outline';
};

const getRelativeDayLabel = (date: Date) => {
  if (isToday(date)) return 'Today';
  if (isTomorrow(date)) return 'Tomorrow';
  return format(date, 'EEE, d MMM');
};

export default function DashboardScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  type ExtendedBooking = Booking & {
    clientName?: string;
    partnerName?: string;
    partnerBookingId?: string;
  };
  const [bookings, setBookings] = useState<ExtendedBooking[]>([]);
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [showCancelled, setShowCancelled] = useState(false);
  const [ptsClients, setPtsClients] = useState<UserProfile[]>([]);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const [partnerModalVisible, setPartnerModalVisible] = useState(false);
  const [selectedBookingForPartner, setSelectedBookingForPartner] = useState<ExtendedBooking | null>(null);
  const [addingPartnerLoading, setAddingPartnerLoading] = useState(false);

  // Custom Alert State
  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    isDestructive?: boolean;
    confirmText?: string;
    onSecondaryConfirm?: () => void;
    secondaryConfirmText?: string;
    cancelText?: string;
    onConfirm?: () => void;
  }>({ visible: false, title: '', message: '' });

  const closeAlert = () => setAlertConfig(prev => ({ ...prev, visible: false }));

  const fetchBookingsAndProfile = useCallback(async () => {
    if (!user) return;
    try {
      const [profile, settings] = await Promise.all([
        getUserProfile(user.uid),
        getGlobalSettings().catch(() => null)
      ]);
      setUserProfile(profile);
      setGlobalSettings(settings);

      if (profile?.role === 'pt' || profile?.role === 'admin') {
        const clients = await getClientsForPt(user.uid);
        setPtsClients(clients);
        const pendingRequests = await getPendingPTRequestsForPT(user.uid);
        setPendingRequestCount(pendingRequests.length);
      }

      const userBookings = await getUserBookings(user.uid);
      let allBookings: Booking[] = [...userBookings];

      if (profile?.role === 'pt' || profile?.role === 'admin') {
        const ptBookings = await getPTBookingsForInstructor(user.uid);
        // Combine and deduplicate
        const combined = [...userBookings, ...ptBookings];
        allBookings = Array.from(new Map(combined.map(b => [b.id, b])).values());
      }

      // Fetch upcoming cancelled bookings and merge in (requires composite indexes — degrades gracefully if missing)
      try {
        const cancelledUser = await getUserCancelledUpcomingBookings(user.uid);
        let cancelledBookings: Booking[] = [...cancelledUser];
        if (profile?.role === 'pt' || profile?.role === 'admin') {
          const cancelledPT = await getPTCancelledBookingsForInstructor(user.uid);
          const combined = [...cancelledUser, ...cancelledPT];
          cancelledBookings = Array.from(new Map(combined.map(b => [b.id, b])).values());
        }
        allBookings = Array.from(new Map([...allBookings, ...cancelledBookings].map(b => [b.id, b])).values());
      } catch (e) {
        console.warn('Cancelled bookings query failed (index may be missing):', e);
      }

      // Filter out past bookings to only show upcoming (confirmed and cancelled; pending PT requests shown in PT tab)
      const isPtOrAdmin = profile?.role === 'pt' || profile?.role === 'admin';
      let upcoming = allBookings.filter(b => b.endTime > new Date() && (b.status === 'confirmed' || b.status === 'cancelled' || (b.status === 'pending' && isPtOrAdmin)));

      if (profile?.role === 'pt' || profile?.role === 'admin') {
        // Deduplicate group sessions (so the PT doesn't see N cards for 1 group session)
        const groupSessions = new Set(upcoming.filter(b => b.type === 'group').map(b => `${b.groupId}-${b.startTime.getTime()}`));

        upcoming = upcoming.filter(b => {
          if (b.type === 'group') {
            const key = `${b.groupId}-${b.startTime.getTime()}`;
            if (groupSessions.has(key)) {
              groupSessions.delete(key); // keep the first one
              return true;
            }
            return false; // drop duplicate member bookings
          }
          if (b.type === 'block') {
            // If there's a group session at this time, don't show the redundant block card
            const hasOverlappingGroup = upcoming.some(g => g.type === 'group' && g.startTime.getTime() === b.startTime.getTime());
            if (hasOverlappingGroup) return false;
          }
          return true;
        });
      }

      // Fetch client names for PT bookings where the PT is the instructor
      const bookingsWithNames: ExtendedBooking[] = await Promise.all(upcoming.map(async (b) => {
        if (b.type === 'pt' && (profile?.role === 'pt' || profile?.role === 'admin') && b.ptId === user.uid && b.userId !== user.uid) {
          const clientProfile = await getUserProfile(b.userId);
          return { ...b, clientName: clientProfile?.name || 'Unknown Client' };
        }
        if (b.type === 'group' && b.groupId) {
          try {
            const group = await getGroupById(b.groupId);
            if (group) return { ...b, clientName: group.name };
          } catch (e) { console.error('Error fetching group name', e) }
        }
        return b;
      }));

      // Sort upcoming first
      const sorted = bookingsWithNames.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

      // Group paired PT sessions for the instructor
      const grouped: ExtendedBooking[] = [];
      const processedPTUniqueKeys = new Set<string>();

      if (profile?.role === 'pt' || profile?.role === 'admin') {
        sorted.forEach(booking => {
          if (booking.type === 'pt' && booking.status === 'confirmed' && booking.ptId === user.uid) {
            const slotKey = `${booking.ptId}-${booking.startTime.getTime()}`;
            if (processedPTUniqueKeys.has(slotKey)) {
              // This is the second person in the slot, find the first and update it
              const existingIndex = grouped.findIndex(b => b.type === 'pt' && `${b.ptId}-${b.startTime.getTime()}` === slotKey);
              if (existingIndex !== -1) {
                grouped[existingIndex] = {
                  ...grouped[existingIndex],
                  partnerName: booking.clientName,
                  partnerBookingId: booking.id
                };
              }
              return;
            }
            processedPTUniqueKeys.add(slotKey);
          }
          grouped.push(booking);
        });
        setBookings(grouped);
      } else {
        setBookings(sorted);
      }
    } catch {
      console.error('Error fetching bookings');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      fetchBookingsAndProfile();
    }, [fetchBookingsAndProfile])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchBookingsAndProfile();
  };

  const handleCancel = (booking: Booking) => {
    if (booking.type === 'group') {
      setAlertConfig({
        visible: true,
        title: 'Cannot Cancel Here',
        message: userProfile?.role === 'pt'
          ? 'Please go to the Groups tab to cancel a group session.'
          : 'Group sessions cannot be cancelled here. Please contact your trainer.',
        onConfirm: undefined,
        onSecondaryConfirm: undefined,
        cancelText: 'OK'
      });
      return;
    }

    if (booking.recurringTemplateId) {
      setAlertConfig({
        visible: true,
        title: 'Cancel Recurring Booking',
        message: `Do you want to cancel just this session on ${format(booking.startTime, 'MMM d, HH:mm')}, or this and all future sessions in the series?`,
        isDestructive: true,
        confirmText: 'Cancel This Session',
        onConfirm: () => confirmCancellation(booking.id!, (booking as any).partnerBookingId, booking.userId),
        secondaryConfirmText: 'Cancel Entire Series',
        onSecondaryConfirm: () => confirmRecurringCancellation(booking.recurringTemplateId!, booking.startTime, booking.userId),
        cancelText: 'Keep it'
      });
    } else {
      const isGrouped = !!(booking as any).partnerName;
      setAlertConfig({
        visible: true,
        title: isGrouped ? 'Cancel Paired Session' : 'Cancel Booking',
        message: isGrouped
          ? `This will cancel the session for BOTH ${(booking as any).clientName} and ${(booking as any).partnerName} at ${format(booking.startTime, 'HH:mm')}. Are you sure?`
          : `Are you sure you want to cancel this ${booking.type} booking on ${format(booking.startTime, 'MMM d, HH:mm')}?`,
        isDestructive: true,
        confirmText: 'Yes, Cancel',
        cancelText: 'No, Keep it',
        onConfirm: () => confirmCancellation(booking.id!, (booking as any).partnerBookingId, booking.userId)
      });
    }
  };

  const confirmCancellation = async (id: string, partnerBookingId?: string, bookingUserId?: string) => {
    setCancellingId(id);
    const cancelledBy = bookingUserId === user?.uid ? 'client' : 'pt';
    try {
      const promises = [cancelBooking(id, cancelledBy)];
      if (partnerBookingId) {
        promises.push(cancelBooking(partnerBookingId, cancelledBy));
      }
      await Promise.all(promises);
      fetchBookingsAndProfile();
    } catch (error) {
      setAlertConfig({
        visible: true,
        title: 'Error',
        message: 'Failed to cancel the booking.',
        onConfirm: undefined,
        onSecondaryConfirm: undefined
      });
    } finally {
      setCancellingId(null);
    }
  };

  const confirmRecurringCancellation = async (templateId: string, fromDate: Date, bookingUserId?: string) => {
    setCancellingId(templateId); // Using templateId as temporary cancellingId to show loader
    const cancelledBy = bookingUserId === user?.uid ? 'client' : 'pt';
    try {
      await cancelRecurringSeries(templateId, fromDate, cancelledBy);
      fetchBookingsAndProfile();
    } catch (error) {
      console.error("Cancellation Error Details:", error);
      setAlertConfig({
        visible: true,
        title: 'Error',
        message: 'Failed to cancel the recurring series.',
        onConfirm: undefined,
        onSecondaryConfirm: undefined
      });
    } finally {
      setCancellingId(null);
    }
  };

  const getTypeLabel = (booking: ExtendedBooking) => {
    if (booking.type === 'pt' && booking.status === 'pending') {
      return 'PT Session Request (Pending)';
    }
    if (booking.type === 'pt' && booking.clientName) {
      if (booking.partnerName) {
        return `PT Session with ${booking.clientName} and ${booking.partnerName}`;
      }
      return `PT Session with ${booking.clientName}`;
    }
    if (booking.type === 'group' && booking.clientName) {
      return `${booking.clientName} booking`; // e.g. "Mens 6am Class booking"
    }
    switch (booking.type) {
      case 'gym': return 'Gym Session';
      case 'pt': return 'Personal Training';
      case 'group': return 'Group Class';
      case 'block': return booking.reason || 'Blocked Time';
      case 'pt_block': return 'Unavailable';
      default: return booking.type;
    }
  };

  const handleAddPartner = async (client: UserProfile) => {
    if (!selectedBookingForPartner || !user) return;
    setAddingPartnerLoading(true);
    try {
      await createBooking({
        userId: client.id,
        ptId: user.uid,
        startTime: selectedBookingForPartner.startTime,
        endTime: selectedBookingForPartner.endTime,
        type: 'pt',
        status: 'confirmed'
      });
      setPartnerModalVisible(false);
      setSelectedBookingForPartner(null);

      // Refresh immediately so the background reflects the change
      fetchBookingsAndProfile();

      setAlertConfig({
        visible: true,
        title: 'Partner Added!',
        message: `${client.name} has been added to the session at ${format(selectedBookingForPartner.startTime, 'HH:mm')}.`,
        confirmText: 'Great',
        onConfirm: undefined // Refresh already triggered above
      });
    } catch (error) {
      console.error('Error adding partner:', error);
      setAlertConfig({
        visible: true,
        title: 'Error',
        message: 'Failed to add partner. Please try again.',
        isDestructive: true
      });
    } finally {
      setAddingPartnerLoading(false);
    }
  };

  const nextBooking = bookings.find(b => b.status !== 'cancelled') ?? null;
  const remainingBookings = bookings.filter(b => b !== nextBooking);

  const displayedBookings = remainingBookings.filter(b => {
    if (!showCancelled && b.status === 'cancelled') return false;
    return true;
  });

  const isPtOrAdmin = userProfile?.role === 'pt' || userProfile?.role === 'admin';
  // Clients without gym access can only reach a lock screen there, so don't offer it
  const canBookGym = isPtOrAdmin || (userProfile?.canBookGym ?? true);
  const firstName = userProfile?.name?.split(' ')[0] || 'there';
  const initial = (userProfile?.name?.trim()?.[0] || firstName[0] || '?').toUpperCase();

  const heroSubtitle = loading
    ? 'Loading your schedule…'
    : nextBooking
    ? isToday(nextBooking.startTime)
      ? "You've got a session today — let's make it count."
      : isTomorrow(nextBooking.startTime)
      ? 'Your next session is tomorrow. Get ready!'
      : `Your next session is ${format(nextBooking.startTime, 'EEEE, MMM d')}.`
    : isPtOrAdmin
    ? "Here's what's on your schedule."
    : "You're all clear — time to book your next session.";

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.tint} />}
      >
        <View style={styles.heroSection}>
          <View style={styles.heroRow}>
            <View style={[styles.avatarCircle, { backgroundColor: theme.tint }]}>
              <Text style={styles.avatarInitial}>{initial}</Text>
            </View>
            <View style={styles.heroTextColumn}>
              <View style={styles.heroGreetingRow}>
                <Ionicons name={getGreetingIcon()} size={16} color={theme.tint} style={{ marginRight: 6 }} />
                <Text style={[styles.greetingText, { color: theme.textSecondary }]}>{getGreeting()}</Text>
              </View>
              <Text style={[styles.nameText, { color: theme.text }]} numberOfLines={1}>{firstName}</Text>
            </View>
          </View>
          <Text style={[styles.heroSubtitle, { color: theme.textSecondary }]}>{heroSubtitle}</Text>
        </View>

        <View style={styles.quickActionsRow}>
          {canBookGym && (
          <TouchableOpacity
            style={[styles.quickAction, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => router.push('/gym')}
            activeOpacity={0.75}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: theme.tintMuted }]}>
              <Ionicons name="barbell-outline" size={20} color={theme.tint} />
            </View>
            <Text style={[styles.quickActionLabel, { color: theme.text }]}>Gym</Text>
          </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.quickAction, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => router.push('/pt')}
            activeOpacity={0.75}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: theme.tintMuted }]}>
              <Ionicons name="body-outline" size={20} color={theme.tint} />
              {isPtOrAdmin && pendingRequestCount > 0 && (
                <View style={[styles.quickActionBadge, { backgroundColor: theme.danger, borderColor: theme.card }]}>
                  <Text style={styles.quickActionBadgeText}>{pendingRequestCount > 9 ? '9+' : pendingRequestCount}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.quickActionLabel, { color: theme.text }]}>PT</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.quickAction, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => router.push('/groups')}
            activeOpacity={0.75}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: theme.tintMuted }]}>
              <Ionicons name="people-outline" size={20} color={theme.tint} />
            </View>
            <Text style={[styles.quickActionLabel, { color: theme.text }]}>Groups</Text>
          </TouchableOpacity>
        </View>

        <UpdateBanner latestVersion={globalSettings?.latestVersion} />

        {globalSettings?.showAnnouncement && globalSettings?.announcementText && (
          <View style={[styles.announcementBanner, { backgroundColor: theme.tintMuted, borderColor: theme.tint }]}>
            <Ionicons name="megaphone-outline" size={20} color={theme.tint} style={{ marginRight: Spacing.md, marginTop: 2 }} />
            <Text style={[styles.announcementText, { color: theme.text }]}>
              {globalSettings.announcementText}
            </Text>
          </View>
        )}

        {loading ? (
          <ActivityIndicator size="large" color={theme.tint} style={{ marginTop: 40 }} />
        ) : bookings.filter(b => showCancelled || b.status !== 'cancelled').length === 0 ? (
          <View style={styles.section}>
            <EmptyState
              icon="calendar-outline"
              title="Your calendar's wide open"
              subtitle={isPtOrAdmin ? 'No upcoming sessions scheduled yet.' : "Let's get your next session on the books."}
            />
            {!isPtOrAdmin && (
              <View style={styles.emptyActionsRow}>
                {canBookGym && (
                  <Button variant="primary" icon="barbell-outline" label="Book Gym" onPress={() => router.push('/gym')} style={{ flex: 1 }} />
                )}
                <Button variant={canBookGym ? 'secondary' : 'primary'} icon="body-outline" label="Book PT" onPress={() => router.push('/pt')} style={{ flex: 1 }} />
              </View>
            )}
          </View>
        ) : (
          <>
            {nextBooking && (
            <View style={styles.section}>
              <SectionHeader title="Next Session" />
              <Card elevated tinted padding={20}>
                <View style={styles.relativeDayPill}>
                  <Text style={styles.relativeDayText}>{getRelativeDayLabel(nextBooking.startTime)}</Text>
                </View>
                <View style={styles.highlightHeader}>
                  <Text style={styles.highlightTypeText}>
                    {nextBooking.recurringTemplateId && (
                      <Ionicons name="repeat-outline" size={16} color="#ffffff" style={{ marginRight: 4 }} />
                    )}
                    {getTypeLabel(nextBooking)}
                  </Text>
                  {nextBooking.type !== 'group' && (
                  <View style={styles.highlightActionsRow}>
                    {(userProfile?.role === 'pt' || userProfile?.role === 'admin') &&
                     nextBooking.type === 'pt' &&
                     nextBooking.status === 'confirmed' &&
                     !nextBooking.partnerName && (
                      <Button
                        variant="onTint"
                        size="sm"
                        icon="person-add-outline"
                        label="Add Partner"
                        onPress={() => {
                          setSelectedBookingForPartner(nextBooking);
                          setPartnerModalVisible(true);
                        }}
                      />
                    )}
                    <Button
                      variant="onTint"
                      size="sm"
                      loading={cancellingId === nextBooking.id}
                      icon={nextBooking.recurringTemplateId ? 'settings-outline' : 'close-circle-outline'}
                      label={nextBooking.status === 'pending' ? 'Withdraw' : nextBooking.recurringTemplateId ? 'Manage' : 'Cancel'}
                      onPress={() => handleCancel(nextBooking)}
                      disabled={!!cancellingId}
                    />
                  </View>
                  )}
                </View>
                <View style={styles.highlightDetailsRow}>
                  <Ionicons name="calendar" size={16} color="rgba(255,255,255,0.9)" style={{ marginRight: 6 }} />
                  <Text style={styles.highlightDetailsText}>
                    {format(nextBooking.startTime, 'EEEE, MMMM do')}
                  </Text>
                </View>
                <View style={[styles.highlightDetailsRow, { marginTop: 4 }]}>
                  <Ionicons name="time" size={16} color="rgba(255,255,255,0.9)" style={{ marginRight: 6 }} />
                  <Text style={styles.highlightDetailsText}>
                    {format(nextBooking.startTime, 'HH:mm')} - {format(nextBooking.endTime, 'HH:mm')}
                  </Text>
                </View>
              </Card>
            </View>
            )}

            {remainingBookings.length > 0 && (
              <View style={styles.section}>
                {bookings.some(b => b.status === 'cancelled') && (
                  <View style={styles.filterContainer}>
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', opacity: 0.8 }}
                      onPress={() => setShowCancelled(!showCancelled)}
                    >
                      <Ionicons name={showCancelled ? "checkbox" : "square-outline"} size={20} color={theme.textSecondary} style={{ marginRight: 6 }} />
                      <Text style={{ fontSize: 13, color: theme.textSecondary, fontWeight: '500' }}>Show Cancelled</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {displayedBookings.length === 0 ? (
                  <EmptyState icon="calendar-clear-outline" title="No more sessions scheduled." compact />
                ) : (
                  <ListContainer>
                    {displayedBookings.map((booking, index) => {
                      const isLast = index === displayedBookings.length - 1;
                      const isCancelled = booking.status === 'cancelled';
                      const cancelledByLabel = booking.type === 'gym' ? 'Cancelled'
                        : booking.cancelledBy === 'pt' ? 'Cancelled by PT'
                        : booking.cancelledBy === 'admin' ? 'Cancelled by admin'
                        : booking.cancelledBy === 'client' ? 'Cancelled by client'
                        : 'Cancelled';
                      return (
                        <ListRow key={booking.id} isLast={isLast} style={{ opacity: isCancelled ? 0.5 : 1 }}>
                          <Text style={[styles.typeText, { color: theme.text }]}>
                            {booking.recurringTemplateId && (
                              <Ionicons name="repeat-outline" size={15} color={theme.textSecondary} style={{ marginRight: 4 }} />
                            )}
                            {getTypeLabel(booking)}
                          </Text>
                          <View style={styles.detailsRow}>
                            <Ionicons name="time-outline" size={15} color={theme.textSecondary} style={{ marginRight: 6 }} />
                            <Text style={[styles.detailsText, { color: theme.textSecondary }]}>
                              {format(booking.startTime, 'EEE, MMM d')} • {format(booking.startTime, 'HH:mm')} - {format(booking.endTime, 'HH:mm')}
                            </Text>
                          </View>
                          {isCancelled && (
                            <View style={{ marginTop: 6 }}>
                              <Badge label={cancelledByLabel} tone="danger" />
                            </View>
                          )}

                          {booking.type !== 'group' && !isCancelled && (
                            <View style={styles.cardActionsRow}>
                              {(userProfile?.role === 'pt' || userProfile?.role === 'admin') &&
                               booking.type === 'pt' &&
                               booking.status === 'confirmed' &&
                               !booking.partnerName && (
                                <Button
                                  variant="tint"
                                  size="sm"
                                  icon="person-add-outline"
                                  label="Add Partner"
                                  onPress={() => {
                                    setSelectedBookingForPartner(booking);
                                    setPartnerModalVisible(true);
                                  }}
                                />
                              )}
                              <Button
                                variant="secondary"
                                size="sm"
                                loading={cancellingId === booking.id}
                                icon={booking.recurringTemplateId ? 'settings-outline' : 'close-circle-outline'}
                                label={booking.status === 'pending' ? 'Withdraw' : booking.recurringTemplateId ? 'Manage' : 'Cancel'}
                                onPress={() => handleCancel(booking)}
                                disabled={!!cancellingId}
                              />
                            </View>
                          )}
                        </ListRow>
                      );
                    })}
                  </ListContainer>
                )}
              </View>
            )}
          </>
        )}

      </ScrollView>

      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        isDestructive={alertConfig.isDestructive}
        confirmText={alertConfig.confirmText || 'Confirm'}
        secondaryConfirmText={alertConfig.secondaryConfirmText}
        cancelText={alertConfig.cancelText || 'Cancel'}
        onClose={closeAlert}
        onConfirm={alertConfig.onConfirm}
        onSecondaryConfirm={alertConfig.onSecondaryConfirm}
      />

      {/* Partner Selection Modal */}
      <Modal
        visible={partnerModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setPartnerModalVisible(false)}
      >
        <View style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Add Partner</Text>
              <TouchableOpacity onPress={() => setPartnerModalVisible(false)}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>
              Select a client to add to the {selectedBookingForPartner ? format(selectedBookingForPartner.startTime, 'HH:mm') : ''} session.
            </Text>

            {addingPartnerLoading ? (
              <ActivityIndicator size="large" color={theme.tint} style={{ marginVertical: 40 }} />
            ) : (
              <FlatList
                data={ptsClients.filter(c => c.id !== selectedBookingForPartner?.userId)}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.clientOption, { borderBottomColor: theme.border }]}
                    onPress={() => handleAddPartner(item)}
                  >
                    <View style={styles.clientInfo}>
                      <Text style={[styles.clientNameOption, { color: theme.text }]}>{item.name}</Text>
                      <Text style={[styles.clientEmailOption, { color: theme.textSecondary }]}>{item.email}</Text>
                    </View>
                    <Ionicons name="add-circle-outline" size={24} color={theme.tint} />
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <Text style={[styles.emptyClientsText, { color: theme.textSecondary }]}>No other clients found.</Text>
                }
                style={styles.modalList}
              />
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.xl,
    flexGrow: 1,
  },
  section: {
    marginTop: Spacing.sm,
  },
  heroSection: {
    marginBottom: Spacing.xl,
    paddingVertical: Spacing.sm,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
  },
  heroTextColumn: {
    marginLeft: Spacing.md,
    flex: 1,
  },
  heroGreetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  greetingText: {
    ...Typography.subhead,
  },
  nameText: {
    ...Typography.largeTitle,
    marginTop: 2,
  },
  heroSubtitle: {
    ...Typography.body,
    marginTop: Spacing.md,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.xxl,
  },
  quickAction: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    borderRadius: Radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  quickActionIcon: {
    width: 40,
    height: 40,
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  quickActionBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: Radii.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  quickActionBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  quickActionLabel: {
    ...Typography.footnote,
    fontWeight: '600',
  },
  emptyActionsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  relativeDayPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radii.pill,
    marginBottom: Spacing.md,
  },
  relativeDayText: {
    color: '#ffffff',
    ...Typography.caption,
  },
  announcementBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: Spacing.lg,
    borderRadius: Radii.lg,
    borderWidth: 1,
    marginBottom: Spacing.xxl,
  },
  announcementText: {
    flex: 1,
    ...Typography.subhead,
    lineHeight: 22,
  },
  highlightHeader: {
    marginBottom: Spacing.md,
  },
  highlightTypeText: {
    ...Typography.title3,
    color: '#ffffff',
  },
  highlightActionsRow: {
    flexDirection: 'row',
    gap: Spacing.xs + 2,
    marginTop: Spacing.md - 2,
  },
  highlightDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  highlightDetailsText: {
    color: '#ffffff',
    ...Typography.subhead,
  },
  filterContainer: {
    flexDirection: 'row',
    marginBottom: Spacing.lg,
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
  },
  typeText: {
    ...Typography.headline,
    marginBottom: 4,
  },
  cardActionsRow: {
    flexDirection: 'row',
    gap: Spacing.xs + 2,
    marginTop: Spacing.md - 2,
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  detailsText: {
    ...Typography.footnote,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: Radii.xl,
    borderTopRightRadius: Radii.xl,
    padding: Spacing.xxl,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  modalTitle: {
    ...Typography.title2,
  },
  modalSubtitle: {
    ...Typography.subhead,
    marginBottom: Spacing.xl,
  },
  modalList: {
    marginTop: Spacing.sm,
  },
  clientOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  clientInfo: {
    flex: 1,
  },
  clientNameOption: {
    ...Typography.headline,
  },
  clientEmailOption: {
    ...Typography.footnote,
    marginTop: 2,
  },
  emptyClientsText: {
    textAlign: 'center',
    paddingVertical: 32,
    ...Typography.subhead,
  }
});
