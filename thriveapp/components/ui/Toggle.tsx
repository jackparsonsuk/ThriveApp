import React from 'react';
import { Switch, Platform } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

interface ToggleProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}

/** Brand-coloured switch. Sets the thumb explicitly so web doesn't fall back to its default teal. */
export default function Toggle({ value, onValueChange, disabled, accessibilityLabel }: ToggleProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      trackColor={{ false: theme.fill, true: theme.tint }}
      thumbColor="#FFFFFF"
      ios_backgroundColor={theme.fill}
      {...(Platform.OS === 'web' ? { activeThumbColor: '#FFFFFF' } : {})}
    />
  );
}
