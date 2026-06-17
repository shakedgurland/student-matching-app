import { Platform } from 'react-native';

/**
 * UniMatch Design System - Soft Rose Pink Theme
 * Inspired by modern elegant dating apps (Hinge, Bumble style)
 */

const primaryRose = '#F06292'; // Main UI elements, Primary buttons
const lightRose = '#FCE4EC';    // Backgrounds, Secondary buttons
const softCoral = '#FF8A65';   // Accent elements
const deepRose = '#D81B60';    // Active states / Pressed buttons
const white = '#FFFFFF';
const offWhite = '#FFF9FB';    // Very light pink background
const darkGray = '#333333';    // Main text
const mutedGray = '#757575';   // Secondary text
const borderPink = '#F8BBD0';  // Border color

export const Colors = {
  light: {
    text: darkGray,
    background: white,
    offBackground: offWhite,
    primary: primaryRose,
    secondary: lightRose,
    accent: softCoral,
    muted: mutedGray,
    border: borderPink,
    card: white,
    error: '#E53E3E',
    tint: primaryRose,
    tabIconDefault: '#BDBDBD',
    tabIconSelected: primaryRose,
  },
  dark: {
    // Elegant dark mode with rose accents
    text: '#FCE4EC',
    background: '#121212',
    offBackground: '#1A1A1A',
    primary: primaryRose,
    secondary: '#2C1C21',
    accent: softCoral,
    muted: '#9E9E9E',
    border: '#332328',
    card: '#1E1E1E',
    error: '#CF6679',
    tint: primaryRose,
    tabIconDefault: '#757575',
    tabIconSelected: primaryRose,
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  huge: 64,
};

export const BorderRadius = {
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  full: 9999,
};

export const Shadow = {
  soft: {
    shadowColor: primaryRose,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 8,
  },
};

export const Typography = {
  h1: {
    fontSize: 32,
    fontWeight: '800' as const,
    lineHeight: 40,
  },
  h2: {
    fontSize: 24,
    fontWeight: '700' as const,
    lineHeight: 30,
  },
  body: {
    fontSize: 16,
    fontWeight: '400' as const,
    lineHeight: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
};
