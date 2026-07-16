/**
 * Design tokens for the app: colors (light/dark), spacing, typography, radii, and shadows.
 * Brand anchor is Thrive Orange (#F26122); everything else is tuned to sit quietly behind it.
 */

import { Platform } from 'react-native';

const tintColorLight = '#F26122'; // Thrive Orange
const tintColorDark = '#FF7A3D'; // Slightly brighter on dark backgrounds so it doesn't feel muddy

export const Colors = {
  light: {
    text: '#0B0B0C',
    textSecondary: '#6B6B70',
    textTertiary: '#9A9AA0',
    background: '#F2F2F7', // iOS Grouped Background Light
    card: '#FFFFFF',       // Card Background Light
    cardAlt: '#F7F7F9',    // Nested/inset surface on top of a card
    tint: tintColorLight,
    tintMuted: 'rgba(242, 97, 34, 0.12)',
    icon: '#6B6B70',       // Secondary text/icon
    tabIconDefault: '#9A9AA0',
    tabIconSelected: tintColorLight,
    border: '#E5E5EA',     // iOS Separator Light
    overlay: 'rgba(15, 15, 18, 0.5)',
    success: '#1D9A6C',
    danger: '#E5484D',
    dangerMuted: 'rgba(229, 72, 77, 0.1)',
    warning: '#C77800',
    info: '#3E7BFA',
    onTint: '#FFFFFF',
  },
  dark: {
    text: '#F5F5F7',
    textSecondary: '#A0A0A6',
    textTertiary: '#7A7A80',
    background: '#000000', // iOS Pure Black Background Dark
    card: '#1C1C1E',       // Card Background/Grouped Background Dark
    cardAlt: '#242426',    // Nested/inset surface on top of a card
    tint: tintColorDark,
    tintMuted: 'rgba(255, 122, 61, 0.16)',
    icon: '#A0A0A6',       // Secondary text/icon
    tabIconDefault: '#7A7A80',
    tabIconSelected: tintColorDark,
    border: '#302F31',     // iOS Separator Dark
    overlay: 'rgba(0, 0, 0, 0.6)',
    success: '#33C88C',
    danger: '#FF6369',
    dangerMuted: 'rgba(255, 99, 105, 0.16)',
    warning: '#E5A339',
    info: '#6E9EFF',
    onTint: '#FFFFFF',
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
};

export const Radii = {
  sm: 8,
  md: 12, // Standard Apple Card Radius
  lg: 16,
  xl: 24,
  pill: 9999,
};

// A small, HIG-inspired type scale so every screen picks from the same sizes/weights.
export const Typography = {
  largeTitle: { fontSize: 34, fontWeight: '700' as const, letterSpacing: -0.5 },
  title1: { fontSize: 24, fontWeight: '700' as const, letterSpacing: -0.4 },
  title2: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.4 },
  title3: { fontSize: 20, fontWeight: '700' as const, letterSpacing: -0.3 },
  headline: { fontSize: 17, fontWeight: '600' as const, letterSpacing: -0.2 },
  body: { fontSize: 16, fontWeight: '400' as const },
  bodyMedium: { fontSize: 16, fontWeight: '500' as const },
  subhead: { fontSize: 15, fontWeight: '500' as const },
  footnote: { fontSize: 13, fontWeight: '500' as const },
  caption: { fontSize: 12, fontWeight: '600' as const },
  caption2: { fontSize: 11, fontWeight: '600' as const },
};

const shadow = (opacity: number, radius: number, elevation: number) => ({
  shadowColor: '#000',
  shadowOffset: { width: 0, height: Math.ceil(radius / 3) },
  shadowOpacity: opacity,
  shadowRadius: radius,
  elevation,
});

export const Shadows = {
  none: {},
  sm: shadow(0.04, 6, 1),
  md: shadow(0.08, 12, 3),
  lg: shadow(0.12, 20, 6),
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
