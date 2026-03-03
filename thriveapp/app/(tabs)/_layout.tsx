import { Tabs } from 'expo-router';
import Head from 'expo-router/head';
import React, { useState, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';

import { HapticTab } from '@/components/haptic-tab';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/auth';
import { getUserProfile, UserProfile } from '@/services/bookingService';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { user } = useAuth();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (user) {
      getUserProfile(user.uid).then(setUserProfile);
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
          tabBarActiveTintColor: '#F26122', // Thrive Orange
          headerShown: false,
          tabBarButton: HapticTab,
          title: 'Thrive Collective',
          tabBarStyle: {
            backgroundColor: colorScheme === 'dark' ? '#333' : '#fff', // Charcoal or white
          },
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
