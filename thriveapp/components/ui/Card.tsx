import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radii, Shadows } from '@/constants/theme';

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padding?: number;
  elevated?: boolean;
  tinted?: boolean;
}

/** Standard rounded, bordered surface used for grouping content. Set `elevated` for a floating/highlight card. */
export default function Card({ children, style, padding = 16, elevated = false, tinted = false }: CardProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: tinted ? theme.tint : theme.card,
          borderColor: theme.border,
          borderWidth: tinted ? 0 : StyleSheet.hairlineWidth,
          padding,
        },
        elevated && Shadows.md,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radii.xl,
  },
});
