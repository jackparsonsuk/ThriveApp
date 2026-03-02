import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, RefreshControl, Image } from 'react-native';
import { useAuth } from '../../context/auth';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getUserBookings, cancelBooking, Booking, getUserProfile, UserProfile } from '../../services/bookingService';
import { format } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import CustomAlert from '../../components/CustomAlert';

export default function DashboardScreen() {
  const { user } = useAuth();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
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

  const fetchBookingsAndProfile = async () => {
    if (!user) return;
    try {
      const [userBookings, profile] = await Promise.all([
        getUserBookings(user.uid),
        getUserProfile(user.uid)
      ]);

      setUserProfile(profile);

      // Sort upcoming first
      const sorted = userBookings.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

      // Filter out past bookings to only show upcoming
      const upcoming = sorted.filter(b => b.endTime > new Date() && b.status === 'confirmed');

      setBookings(upcoming);
    } catch (error) {
      console.error('Error fetching bookings:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchBookingsAndProfile();
  }, [user]);

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

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'gym': return 'Gym Session';
      case 'pt': return 'Personal Training';
      case 'group': return 'Group Class';
      default: return type;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <Image source={require('../../assets/images/TC_Monogram_White.png')} style={styles.logo} />
          <Text style={styles.greeting}>Hello, {userProfile?.name || 'there'}</Text>
          <Text style={styles.subtitle}>Welcome to Thrive Collective</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Upcoming Bookings</Text>

          {loading ? (
            <ActivityIndicator size="large" color="#FF5A00" style={{ marginTop: 20 }} />
          ) : bookings.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={48} color="#a3a3a3" />
              <Text style={styles.emptyText}>You have no upcoming bookings.</Text>
            </View>
          ) : (
            <View style={styles.list}>
              {bookings.map((booking) => (
                <View key={booking.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.typeText}>{getTypeLabel(booking.type)}</Text>
                    <TouchableOpacity
                      style={styles.cancelButton}
                      onPress={() => handleCancel(booking)}
                      disabled={!!cancellingId}
                    >
                      {cancellingId === booking.id ? (
                        <ActivityIndicator size="small" color="#f44336" />
                      ) : (
                        <Text style={styles.cancelButtonText}>Cancel</Text>
                      )}
                    </TouchableOpacity>
                  </View>

                  <View style={styles.detailsRow}>
                    <Ionicons name="time-outline" size={16} color="#666" style={{ marginRight: 5 }} />
                    <Text style={styles.detailsText}>
                      {format(booking.startTime, 'EEE, MMM d')} • {format(booking.startTime, 'HH:mm')} - {format(booking.endTime, 'HH:mm')}
                    </Text>
                  </View>

                </View>
              ))}
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
    backgroundColor: '#0a0a0a',
  },
  content: {
    padding: 20,
    flexGrow: 1,
  },
  header: {
    marginBottom: 30,
    alignItems: 'center',
    paddingVertical: 10,
  },
  logo: {
    width: 60,
    height: 60,
    marginBottom: 15,
  },
  greeting: {
    fontSize: 28,
    fontWeight: '800', // Matches website
    color: '#ffffff',
  },
  subtitle: {
    fontSize: 16,
    color: '#a3a3a3',
    marginTop: 5,
  },
  section: {
    marginTop: 10,
    flex: 1,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 15,
    color: '#ffffff',
  },
  emptyState: {
    padding: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  emptyText: {
    color: '#a3a3a3',
    marginTop: 10,
    fontSize: 16,
    fontWeight: '600',
  },
  list: {
    gap: 15,
  },
  card: {
    backgroundColor: '#121212',
    borderRadius: 16, // --radius-md
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15, // slightly more breathing room
  },
  typeText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
  },
  cancelButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 9999,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.5)',
  },
  cancelButtonText: {
    color: '#ef4444', // Red 500 equivalent
    fontWeight: '700',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailsText: {
    fontSize: 15,
    color: '#a3a3a3',
    fontWeight: '500', // matches secondary text weight
  }
});
