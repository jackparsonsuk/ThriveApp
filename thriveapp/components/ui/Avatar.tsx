import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radii } from '@/constants/theme';

interface AvatarProps {
  name?: string;
  size?: number;
  /** Solid brand fill for the signed-in user; soft tint for everyone else. */
  solid?: boolean;
}

/** Circle with a person's initial. */
export default function Avatar({ name, size = 40, solid = false }: AvatarProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const initial = (name?.trim()?.[0] ?? '?').toUpperCase();

  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, backgroundColor: solid ? theme.tint : theme.tintMuted },
      ]}
    >
      <Text style={{ color: solid ? theme.onTint : theme.tint, fontSize: Math.round(size * 0.4), fontWeight: '700' }}>
        {initial}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
