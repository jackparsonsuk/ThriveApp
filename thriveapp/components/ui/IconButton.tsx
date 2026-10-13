import React from 'react';
import { TouchableOpacity, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radii } from '@/constants/theme';

type IconButtonTone = 'neutral' | 'tint' | 'danger' | 'subtle';

interface IconButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  /** Required: icon-only buttons have no visible text for screen readers. */
  accessibilityLabel: string;
  tone?: IconButtonTone;
  size?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Round, 40pt icon-only button (close, copy, remove…). Comfortable tap target with a visible fill. */
export default function IconButton({ icon, onPress, accessibilityLabel, tone = 'neutral', size = 40, disabled, style }: IconButtonProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  const tones: Record<IconButtonTone, { bg: string; fg: string }> = {
    neutral: { bg: theme.fill, fg: theme.textSecondary },
    tint: { bg: theme.tintMuted, fg: theme.tint },
    danger: { bg: theme.dangerMuted, fg: theme.danger },
    // No fill: for actions repeated down a long list, where filled circles would be noise
    subtle: { bg: 'transparent', fg: theme.textTertiary },
  };
  const { bg, fg } = tones[tone];

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={6}
      style={[
        styles.base,
        { width: size, height: size, backgroundColor: bg, opacity: disabled ? 0.5 : 1 },
        style,
      ]}
    >
      <Ionicons name={icon} size={Math.round(size * 0.45)} color={fg} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
