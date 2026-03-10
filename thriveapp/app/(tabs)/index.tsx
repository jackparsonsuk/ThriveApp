import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Image } from 'react-native';
import { useAuth } from '../../context/auth';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getUserBookings, getPTBookingsForInstructor, cancelBooking, cancelRecurringSeries, Booking, getUserProfile, UserProfile } from '../../services/bookingService';
import { format, isSameDay } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import CustomAlert from '../../components/CustomAlert';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radii } from '@/constants/theme';

export default function DashboardScreen() {
  const { user } = useAuth();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  type ExtendedBooking = Booking & { clientName?: string };
  const [bookings, setBookings] = useState<ExtendedBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'today' | 'upcoming'>('today');

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
      const profile = await getUserProfile(user.uid);
      setUserProfile(profile);

      const userBookings = await getUserBookings(user.uid);
      let allBookings: Booking[] = [...userBookings];

      if (profile?.role === 'pt') {
        const ptBookings = await getPTBookingsForInstructor(user.uid);
        // Combine and deduplicate
        const combined = [...userBookings, ...ptBookings];
        allBookings = Array.from(new Map(combined.map(b => [b.id, b])).values());
      }

      // Filter out past bookings to only show upcoming
      const upcoming = allBookings.filter(b => b.endTime > new Date() && b.status === 'confirmed');

      // Fetch client names for PT bookings where the PT is the instructor
      const bookingsWithNames: ExtendedBooking[] = await Promise.all(upcoming.map(async (b) => {
        if (b.type === 'pt' && profile?.role === 'pt' && b.ptId === user.uid && b.userId !== user.uid) {
          const clientProfile = await getUserProfile(b.userId);
          return { ...b, clientName: clientProfile?.name || 'Unknown Client' };
        }
        return b;
      }));

      // Sort upcoming first
      const sorted = bookingsWithNames.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

      setBookings(sorted);
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
    if (booking.recurringTemplateId) {
      setAlertConfig({
        visible: true,
        title: 'Cancel Recurring Booking',
        message: `Do you want to cancel just this session on ${format(booking.startTime, 'MMM d, HH:mm')}, or this and all future sessions in the series?`,
        isDestructive: true,
        confirmText: 'Cancel This Session',
        onConfirm: () => confirmCancellation(booking.id!),
        secondaryConfirmText: 'Cancel Entire Series',
        onSecondaryConfirm: () => confirmRecurringCancellation(booking.recurringTemplateId!, booking.startTime),
        cancelText: 'Keep it'
      });
    } else {
      setAlertConfig({
        visible: true,
        title: 'Cancel Booking',
        message: `Are you sure you want to cancel this ${booking.type} booking on ${format(booking.startTime, 'MMM d, HH:mm')}?`,
        isDestructive: true,
        confirmText: 'Yes, Cancel',
        cancelText: 'No, Keep it',
        onConfirm: () => confirmCancellation(booking.id!)
      });
    }
  };

  const confirmCancellation = async (id: string) => {
    setCancellingId(id);
    try {
      await cancelBooking(id);
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

  const confirmRecurringCancellation = async (templateId: string, fromDate: Date) => {
    setCancellingId(templateId); // Using templateId as temporary cancellingId to show loader
    try {
      await cancelRecurringSeries(templateId, fromDate);
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
    if (booking.type === 'pt' && booking.clientName) {
      return `PT Session with ${booking.clientName}`;
    }
    switch (booking.type) {
      case 'gym': return 'Gym Session';
      case 'pt': return 'Personal Training';
      case 'group': return 'Group Class';
      default: return booking.type;
    }
  };

  const now = new Date();
  const nextBooking = bookings.length > 0 ? bookings[0] : null;
  const remainingBookings = bookings.slice(1);
  
  const displayedBookings = remainingBookings.filter(b => {
    if (filter === 'today') {
      return isSameDay(b.startTime, now);
    }
    return true;
  });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.tint} />}
      >
        <View style={styles.header}>
          <Image
            source={require('../../assets/images/TC_Monogram_White.png')}
            style={[styles.logo, colorScheme === 'light' && { tintColor: '#000' }]}
            resizeMode="contain"
          />
          <Text style={[styles.greeting, { color: theme.text }]}>Hello, {userProfile?.name?.split(' ')[0] || 'there'}</Text>
          <Text style={[styles.subtitle, { color: theme.icon }]}>Welcome to Thrive Collective</Text>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={theme.tint} style={{ marginTop: 40 }} />
        ) : !nextBooking ? (
          <View style={[styles.emptyState, { backgroundColor: theme.card, borderColor: theme.border, marginTop: 20 }]}>
            <Ionicons name="calendar-outline" size={48} color={theme.icon} />
            <Text style={[styles.emptyText, { color: theme.icon }]}>You have no upcoming bookings.</Text>
          </View>
        ) : (
          <>
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Next Session</Text>
              <View style={[styles.highlightCard, { backgroundColor: theme.tint }]}>
                <View style={styles.highlightHeader}>
                  <Text style={styles.highlightTypeText} numberOfLines={1}>
                    {nextBooking.recurringTemplateId && (
                      <Ionicons name="repeat-outline" size={16} color="#ffffff" style={{ marginRight: 4 }} />
                    )}
                    {getTypeLabel(nextBooking)}
                  </Text>
                  <TouchableOpacity
                    style={styles.highlightCancelButton}
                    onPress={() => handleCancel(nextBooking)}
                    disabled={!!cancellingId}
                  >
                    {cancellingId === nextBooking.id ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <>
                        <Ionicons 
                          name={nextBooking.recurringTemplateId ? "settings-outline" : "close-circle-outline"} 
                          size={14} 
                          color="#ffffff" 
                          style={{ marginRight: 4 }} 
                        />
                        <Text style={styles.highlightCancelText}>
                          {nextBooking.recurringTemplateId ? 'Manage' : 'Cancel'}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
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
              </View>
            </View>

            {(bookings.length > 1 || filter === 'upcoming') && (
              <View style={styles.section}>
                <View style={styles.filterContainer}>
                  <TouchableOpacity 
                    style={[styles.filterTab, filter === 'today' && { backgroundColor: theme.tint, borderColor: theme.tint }]} 
                    onPress={() => setFilter('today')}
                  >
                    <Text style={[styles.filterText, filter === 'today' ? { color: '#ffffff' } : { color: theme.icon }]}>Later Today</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.filterTab, filter === 'upcoming' && { backgroundColor: theme.tint, borderColor: theme.tint }]} 
                    onPress={() => setFilter('upcoming')}
                  >
                    <Text style={[styles.filterText, filter === 'upcoming' ? { color: '#ffffff' } : { color: theme.icon }]}>Following Schedule</Text>
                  </TouchableOpacity>
                </View>

                {displayedBookings.length === 0 ? (
                  <View style={[styles.emptyState, { backgroundColor: theme.card, borderColor: theme.border, padding: 30, marginTop: 10 }]}>
                    <Ionicons name="calendar-clear-outline" size={32} color={theme.icon} />
                    <Text style={[styles.emptyText, { color: theme.icon, fontSize: 14 }]}>
                      No more sessions {filter === 'today' ? 'today' : 'scheduled'}.
                    </Text>
                  </View>
                ) : (
                  <View style={[styles.list, { backgroundColor: theme.card, borderColor: theme.border, marginTop: 10 }]}>
                    {displayedBookings.map((booking, index) => {
                      const isLast = index === displayedBookings.length - 1;
                      return (
                        <View key={booking.id}>
                          <View style={styles.card}>
                            <View style={styles.cardHeader}>
                              <View style={{ flex: 1, paddingRight: 10 }}>
                                <Text style={[styles.typeText, { color: theme.text }]} numberOfLines={1}>
                                  {booking.recurringTemplateId && (
                                    <Ionicons name="repeat-outline" size={15} color={theme.icon} style={{ marginRight: 4 }} />
                                  )}
                                  {getTypeLabel(booking)}
                                </Text>
                                <View style={styles.detailsRow}>
                                  <Ionicons name="time-outline" size={15} color={theme.icon} style={{ marginRight: 6 }} />
                                  <Text style={[styles.detailsText, { color: theme.icon }]}>
                                    {format(booking.startTime, 'EEE, MMM d')} • {format(booking.startTime, 'HH:mm')} - {format(booking.endTime, 'HH:mm')}
                                  </Text>
                                </View>
                              </View>
                              <TouchableOpacity
                                style={styles.cancelButton}
                                onPress={() => handleCancel(booking)}
                                disabled={!!cancellingId}
                              >
                                {cancellingId === booking.id ? (
                                  <ActivityIndicator size="small" color={theme.icon} />
                                ) : (
                                  <>
                                    <Ionicons 
                                      name={booking.recurringTemplateId ? "settings-outline" : "close-circle-outline"} 
                                      size={14} 
                                      color={theme.icon} 
                                      style={{ marginRight: 4 }} 
                                    />
                                    <Text style={[styles.cancelButtonText, { color: theme.text }]}>
                                      {booking.recurringTemplateId ? 'Manage' : 'Cancel'}
                                    </Text>
                                  </>
                                )}
                              </TouchableOpacity>
                            </View>
                          </View>
                          {!isLast && <View style={[styles.separator, { backgroundColor: theme.border }]} />}
                        </View>
                      );
                    })}
                  </View>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
    flexGrow: 1,
  },
  header: {
    marginBottom: 30,
    alignItems: 'flex-start',
    paddingVertical: 10,
  },
  logo: {
    width: 48,
    height: 48,
    marginBottom: 16,
  },
  greeting: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    marginTop: 4,
  },
  section: {
    marginTop: 10,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 15,
    letterSpacing: -0.5,
  },
  emptyState: {
    padding: 40,
    borderRadius: Radii.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
  },
  emptyText: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  highlightCard: {
    borderRadius: Radii.xl,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  highlightHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  highlightTypeText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    flex: 1,
    paddingRight: 10,
    letterSpacing: -0.5,
  },
  highlightCancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: Radii.pill,
  },
  highlightCancelText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 12,
  },
  highlightDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  highlightDetailsText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '500',
  },
  filterContainer: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  filterTab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: Radii.pill,
    borderWidth: 1,
    borderColor: 'transparent',
    marginRight: 10,
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600',
  },
  list: {
    borderRadius: Radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  card: {
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  typeText: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 4,
    letterSpacing: -0.4,
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: Radii.pill,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  cancelButtonText: {
    fontWeight: '600',
    fontSize: 12,
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  detailsText: {
    fontSize: 14,
    fontWeight: '500',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
  }
});
