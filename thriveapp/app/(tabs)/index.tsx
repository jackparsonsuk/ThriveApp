import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, RefreshControl } from 'react-native';
import { useAuth } from '../../context/auth';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getUserBookings, cancelBooking, Booking } from '../../services/bookingService';
import { format } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import CustomAlert from '../../components/CustomAlert';

export default function DashboardScreen() {
  const { user } = useAuth();
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

  const fetchBookings = async () => {
    if (!user) return;
    try {
      const userBookings = await getUserBookings(user.uid);
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
    fetchBookings();
  }, [user]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchBookings();
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
      fetchBookings();
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
          <Text style={styles.greeting}>Hello, {user?.email}</Text>
          <Text style={styles.subtitle}>Welcome to Thrive Collective</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Upcoming Bookings</Text>

          {loading ? (
            <ActivityIndicator size="large" color="#F26122" style={{ marginTop: 20 }} />
          ) : bookings.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={48} color="#ccc" />
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
    backgroundColor: '#fff',
  },
  content: {
    padding: 20,
    flexGrow: 1,
  },
  header: {
    marginBottom: 30,
  },
  greeting: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 5,
  },
  section: {
    marginTop: 10,
    flex: 1,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
  },
  emptyState: {
    padding: 30,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#eee',
    borderStyle: 'dashed',
  },
  emptyText: {
    color: '#888',
    marginTop: 10,
    fontSize: 16,
  },
  list: {
    gap: 15,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    borderWidth: 1,
    borderColor: '#eee',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  typeText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  cancelButton: {
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  cancelButtonText: {
    color: '#f44336', // Red
    fontWeight: 'bold',
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailsText: {
    fontSize: 15,
    color: '#666',
  }
});
