import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle, StyleProp } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';

type ButtonVariant = 'primary' | 'secondary' | 'tint' | 'destructive' | 'ghost' | 'onTint';
type ButtonSize = 'md' | 'sm';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export default function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  disabled = false,
  style,
  accessibilityLabel,
}: ButtonProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  const variants: Record<ButtonVariant, { bg: string; fg: string }> = {
    primary: { bg: theme.tint, fg: theme.onTint },
    secondary: { bg: theme.fill, fg: theme.text },
    tint: { bg: theme.tintMuted, fg: theme.tint },
    destructive: { bg: theme.dangerMuted, fg: theme.danger },
    ghost: { bg: 'transparent', fg: theme.tint },
    onTint: { bg: 'rgba(255,255,255,0.2)', fg: '#ffffff' },
  };
  const isDisabled = disabled || loading;
  // A dimmed brand colour reads as muddy brown on dark backgrounds, so a disabled
  // button switches to the neutral fill instead of just fading out. Loading keeps
  // its colour so the spinner stays on the button the user just pressed.
  const { bg, fg } = disabled && variant !== 'ghost' && variant !== 'onTint'
    ? { bg: theme.fill, fg: theme.textTertiary }
    : variants[variant];

  return (
    <TouchableOpacity
      style={[
        styles.base,
        size === 'sm' ? styles.sm : styles.md,
        { backgroundColor: bg },
        disabled && (variant === 'ghost' || variant === 'onTint') && { opacity: 0.5 },
        style,
      ]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={size === 'sm' ? 15 : 18} color={fg} style={{ marginRight: Spacing.xs + 2 }} />}
          <Text style={[size === 'sm' ? styles.textSm : styles.textMd, { color: fg }]} numberOfLines={1}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radii.pill,
  },
  md: {
    minHeight: 48,
    paddingHorizontal: Spacing.xl,
  },
  sm: {
    minHeight: 36,
    paddingHorizontal: Spacing.lg - 2,
  },
  textMd: {
    ...Typography.headline,
  },
  textSm: {
    ...Typography.footnote,
    fontWeight: '600',
  },
});
