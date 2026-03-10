import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { getAnalyticsData, AnalyticsData } from '../services/bookingService';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radii } from '@/constants/theme';
import { format } from 'date-fns';

export default function AnalyticsScreen() {
    const router = useRouter();
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];
    const [data, setData] = useState<AnalyticsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchData = useCallback(async () => {
        try {
            const result = await getAnalyticsData();
            setData(result);
        } catch (error) {
            console.error('Error fetching analytics:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const onRefresh = () => {
        setRefreshing(true);
        fetchData();
    };

    if (loading && !refreshing) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
                <ActivityIndicator size="large" color={theme.tint} style={{ marginTop: 50 }} />
            </SafeAreaView>
        );
    }

    const StatCard = ({ title, value, subValue, icon, color }: { title: string, value: number, subValue?: string, icon: any, color: string }) => (
        <View style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={[styles.iconContainer, { backgroundColor: color + '20' }]}>
                <Ionicons name={icon} size={24} color={color} />
            </View>
            <View style={styles.statInfo}>
                <Text style={[styles.statTitle, { color: theme.icon }]}>{title}</Text>
                <Text style={[styles.statValue, { color: theme.text }]}>{value}</Text>
                {subValue && <Text style={[styles.statSubValue, { color: theme.icon }]}>{subValue}</Text>}
            </View>
        </View>
    );

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            <View style={[styles.header, { borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="chevron-back" size={28} color={theme.text} />
                </TouchableOpacity>
                <Text style={[styles.title, { color: theme.text }]}>Analytics</Text>
                <View style={{ width: 28 }} />
            </View>

            <ScrollView 
                contentContainerStyle={styles.scrollContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.tint} />}
            >
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Today's Snapshot</Text>
                <View style={styles.statsGrid}>
                    <StatCard 
                        title="Bookings" 
                        value={data?.bookingsToday || 0} 
                        icon="calendar" 
                        color="#3b82f6" 
                    />
                    <StatCard 
                        title="PT Sessions" 
                        value={data?.ptSessionsToday || 0} 
                        icon="person" 
                        color="#10b981" 
                    />
                    <StatCard 
                        title="Cancellations" 
                        value={data?.cancelledToday || 0} 
                        icon="close-circle" 
                        color="#ef4444" 
                    />
                </View>

                <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 24 }]}>Weekly Performance</Text>
                <View style={styles.statsGrid}>
                    <StatCard 
                        title="Total Bookings" 
                        value={data?.bookingsThisWeek || 0} 
                        icon="bar-chart" 
                        color={theme.tint} 
                    />
                    <StatCard 
                        title="PT Total" 
                        value={data?.ptSessionsThisWeek || 0} 
                        icon="fitness" 
                        color="#8b5cf6" 
                    />
                    <StatCard 
                        title="Cancelled" 
                        value={data?.cancelledThisWeek || 0} 
                        icon="trash" 
                        color="#f59e0b" 
                    />
                </View>

                <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 24 }]}>PT Breakdown (Today)</Text>
                <View style={[styles.breakdownCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    {data?.ptBreakdown.map((pt, index) => (
                        <View key={pt.ptId} style={[styles.breakdownRow, index !== data.ptBreakdown.length - 1 && { borderBottomColor: theme.border }]}>
                            <View style={styles.ptInfo}>
                                <View style={[styles.avatar, { backgroundColor: theme.tint + '20' }]}>
                                    <Text style={[styles.avatarText, { color: theme.tint }]}>{pt.ptName.charAt(0)}</Text>
                                </View>
                                <Text style={[styles.ptName, { color: theme.text }]}>{pt.ptName}</Text>
                            </View>
                            <View style={styles.ptCount}>
                                <Text style={[styles.ptCountText, { color: theme.text }]}>{pt.count}</Text>
                                <Text style={[styles.ptCountLabel, { color: theme.icon }]}>sessions</Text>
                            </View>
                        </View>
                    ))}
                    {(!data?.ptBreakdown || data.ptBreakdown.length === 0) && (
                        <Text style={[styles.emptyText, { color: theme.icon }]}>No PT sessions recorded today.</Text>
                    )}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        paddingHorizontal: 16, 
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth 
    },
    backButton: { padding: 4 },
    title: { fontSize: 20, fontWeight: '700' },
    scrollContent: { padding: 20, paddingBottom: 40 },
    sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 16, letterSpacing: -0.5 },
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    statCard: { 
        flex: 1, 
        minWidth: '45%', 
        padding: 16, 
        borderRadius: Radii.lg, 
        borderWidth: StyleSheet.hairlineWidth, 
        flexDirection: 'row', 
        alignItems: 'center',
        gap: 12
    },
    iconContainer: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    statInfo: { flex: 1 },
    statTitle: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 },
    statValue: { fontSize: 24, fontWeight: '700' },
    statSubValue: { fontSize: 10, marginTop: 2 },
    breakdownCard: { borderRadius: Radii.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
    breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
    ptInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    avatar: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
    avatarText: { fontSize: 16, fontWeight: '700' },
    ptName: { fontSize: 16, fontWeight: '600' },
    ptCount: { alignItems: 'flex-end' },
    ptCountText: { fontSize: 18, fontWeight: '700' },
    ptCountLabel: { fontSize: 10, fontWeight: '500' },
    emptyText: { padding: 20, textAlign: 'center', fontStyle: 'italic' }
});
