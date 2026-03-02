import { Tabs } from 'expo-router';
import React from 'react';
import { Ionicons } from '@expo/vector-icons';

import { HapticTab } from '@/components/haptic-tab';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#F26122', // Thrive Orange
        headerShown: false,
        tabBarButton: HapticTab,
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
        name="group"
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
    </Tabs>
  );
}
