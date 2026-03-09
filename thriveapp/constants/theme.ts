/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColorLight = '#F26122'; // Thrive Orange
const tintColorDark = '#F26122';

export const Colors = {
  light: {
    text: '#000000',
    background: '#F2F2F7', // iOS Grouped Background Light
    card: '#FFFFFF',       // Card Background Light
    tint: tintColorLight,
    icon: '#8E8E93',       // iOS Secondary Text/Icon Light
    tabIconDefault: '#8E8E93',
    tabIconSelected: tintColorLight,
    border: '#E5E5EA',     // iOS Separator Light
  },
  dark: {
    text: '#FFFFFF',
    background: '#000000', // iOS Pure Black Background Dark
    card: '#1C1C1E',       // Card Background/Grouped Background Dark
    tint: tintColorDark,
    icon: '#8E8E93',       // iOS Secondary Text/Icon Dark
    tabIconDefault: '#8E8E93',
    tabIconSelected: tintColorDark,
    border: '#38383A',     // iOS Separator Dark
  },
};

export const Radii = {
  sm: 8,
  md: 12, // Standard Apple Card Radius
  lg: 16,
  xl: 24,
  pill: 9999,
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
