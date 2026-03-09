import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Image } from 'react-native';
import { useAuth } from '../../context/auth';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getUserBookings, getPTBookingsForInstructor, cancelBooking, Booking, getUserProfile, UserProfile } from '../../services/bookingService';
import { format } from 'date-fns';
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
    setAlertConfig({
      visible: true,
      title: 'Cancel Booking',
      message: `Are you sure you want to cancel this ${booking.type} booking on ${format(booking.startTime, 'MMM d, HH:mm')}?`,
      isDestructive: true,
      confirmText: 'Yes, Cancel',
      cancelText: 'No, Keep it',
      onConfirm: () => confirmCancellation(booking.id!)
    });
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
        onConfirm: undefined
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

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Upcoming Bookings</Text>

          {loading ? (
            <ActivityIndicator size="large" color={theme.tint} style={{ marginTop: 20 }} />
          ) : bookings.length === 0 ? (
            <View style={[styles.emptyState, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Ionicons name="calendar-outline" size={48} color={theme.icon} />
              <Text style={[styles.emptyText, { color: theme.icon }]}>You have no upcoming bookings.</Text>
            </View>
          ) : (
            <View style={[styles.list, { backgroundColor: theme.card, borderColor: theme.border }]}>
              {bookings.map((booking, index) => {
                const isLast = index === bookings.length - 1;
                return (
                  <View key={booking.id}>
                    <View style={styles.card}>
                      <View style={styles.cardHeader}>
                        <View style={{ flex: 1, paddingRight: 10 }}>
                          <Text style={[styles.typeText, { color: theme.text }]} numberOfLines={1}>{getTypeLabel(booking)}</Text>
                          <View style={styles.detailsRow}>
                            <Ionicons name="time-outline" size={15} color={theme.icon} style={{ marginRight: 6 }} />
                            <Text style={[styles.detailsText, { color: theme.icon }]}>
                              {format(booking.startTime, 'EEE, MMM d')} • {format(booking.startTime, 'HH:mm')} - {format(booking.endTime, 'HH:mm')}
                            </Text>
                          </View>
                        </View>
                        <TouchableOpacity
                          style={[styles.cancelButton, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}
                          onPress={() => handleCancel(booking)}
                          disabled={!!cancellingId}
                        >
                          {cancellingId === booking.id ? (
                            <ActivityIndicator size="small" color="#ef4444" />
                          ) : (
                            <Text style={styles.cancelButtonText}>Cancel</Text>
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

      </ScrollView>

      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        isDestructive={alertConfig.isDestructive}
        confirmText={alertConfig.confirmText || 'Confirm'}
        cancelText={alertConfig.cancelText || 'Cancel'}
        onClose={closeAlert}
        onConfirm={alertConfig.onConfirm}
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
    flex: 1,
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
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: Radii.pill,
  },
  cancelButtonText: {
    color: '#ef4444',
    fontWeight: '600',
    fontSize: 13,
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
