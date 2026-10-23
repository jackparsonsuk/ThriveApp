import { Tabs } from 'expo-router';
import Head from 'expo-router/head';
import React, { useState, useEffect } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Platform } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/auth';
import { getPendingPTRequestsForPT } from '@/services/bookingService';
import { Colors } from '@/constants/theme';

export default function TabLayout() {
  const colorScheme = useColorScheme() ?? 'light';
  const { user, profile: userProfile } = useAuth();
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const isAdminOrPt = userProfile?.role === 'admin' || userProfile?.role === 'pt';

  useEffect(() => {
    if (user && isAdminOrPt) {
      getPendingPTRequestsForPT(user.uid).then(requests => {
        setPendingRequestCount(requests.length);
      });
    }
  }, [user, isAdminOrPt]);

  return (
    <>
      <Head>
        <title>Thrive Collective</title>
      </Head>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: Colors[colorScheme].tint,
          tabBarInactiveTintColor: Colors[colorScheme].tabIconDefault,
          headerShown: false,
          tabBarButton: HapticTab,
          title: 'Thrive Collective',
          // The bar sits in the layout (not floating over content), so the last item on
          // every screen stays reachable instead of hiding underneath it.
          tabBarStyle: {
            backgroundColor: Colors[colorScheme].card,
            borderTopColor: Colors[colorScheme].border,
            ...(Platform.OS === 'web' ? { height: 64, paddingTop: 4, paddingBottom: 6 } : {}),
          },
          // An explicit line height stops the label being clipped inside its 10px box on web
          tabBarLabelStyle: { fontSize: 11, lineHeight: 14, fontWeight: '600' },
        }}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'Dashboard',
            tabBarIcon: ({ color }) => <Ionicons size={24} name="home" color={color} />,
          }}
        />
        <Tabs.Screen
          name="gym"
          options={{
            title: 'Gym',
            tabBarIcon: ({ color }) => <Ionicons size={24} name="barbell" color={color} />,
            href: null, // Reached via the dashboard's quick actions instead of a tab
          }}
        />
        <Tabs.Screen
          name="pt"
          options={{
            title: 'PT',
            tabBarIcon: ({ color }) => <Ionicons size={24} name="body" color={color} />,
            tabBarBadge: (isAdminOrPt && pendingRequestCount > 0) ? pendingRequestCount : undefined,
            href: null, // Reached via the dashboard's quick actions instead of a tab
          }}
        />
        <Tabs.Screen
          name="groups"
          options={{
            title: 'Groups',
            tabBarIcon: ({ color }) => <Ionicons size={24} name="people" color={color} />,
            href: null, // Reached via the dashboard's quick actions instead of a tab
          }}
        />

        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color }) => <Ionicons size={24} name="person" color={color} />,
          }}
        />
        <Tabs.Screen
          name="admin"
          options={{
            title: 'Admin',
            tabBarIcon: ({ color }) => <Ionicons size={24} name="list" color={color} />,
            href: isAdminOrPt ? '/(tabs)/admin' : null, // Hide tab if not admin/pt
          }}
        />
      </Tabs>
    </>
  );
}
