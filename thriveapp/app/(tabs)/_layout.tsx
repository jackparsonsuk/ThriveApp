import { Tabs } from 'expo-router';
import Head from 'expo-router/head';
import React, { useState, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Platform } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/auth';
import { getUserProfile, getPendingPTRequestsForPT, UserProfile } from '@/services/bookingService';
import { Colors } from '@/constants/theme';

export default function TabLayout() {
  const colorScheme = useColorScheme() ?? 'light';
  const { user } = useAuth();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);

  useEffect(() => {
    if (user) {
      getUserProfile(user.uid).then(profile => {
        setUserProfile(profile);
        if (profile?.role === 'pt' || profile?.role === 'admin') {
          getPendingPTRequestsForPT(user.uid).then(requests => {
            setPendingRequestCount(requests.length);
          });
        }
      });
    }
  }, [user]);

  const isAdminOrPt = userProfile?.role === 'admin' || userProfile?.role === 'pt';

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
          tabBarStyle: Platform.select({
            ios: {
              // Use absolute position and transparent background on iOS for native blur effect
              position: 'absolute',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
            },
            default: {
              backgroundColor: Colors[colorScheme].card,
              borderTopColor: Colors[colorScheme].border,
            },
          }),
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
          }}
        />
        <Tabs.Screen
          name="pt"
          options={{
            title: 'PT',
            tabBarIcon: ({ color }) => <Ionicons size={24} name="body" color={color} />,
            tabBarBadge: (isAdminOrPt && pendingRequestCount > 0) ? pendingRequestCount : undefined,
          }}
        />
        <Tabs.Screen
          name="groups"
          options={{
            title: 'Groups',
            tabBarIcon: ({ color }) => <Ionicons size={24} name="people" color={color} />,
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
