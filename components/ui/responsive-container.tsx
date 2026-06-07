import React from 'react';
import { StyleSheet, View, ViewProps, Platform, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface ResponsiveContainerProps extends ViewProps {
  children: React.ReactNode;
  useSafeArea?: boolean;
}

export function ResponsiveContainer({ children, style, useSafeArea = true, ...props }: ResponsiveContainerProps) {
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const isLargeScreen = width > 768;

  const Container = useSafeArea ? SafeAreaView : View;

  return (
    <View style={styles.outerContainer}>
      <Container
        style={[
          styles.innerContainer,
          isWeb && isLargeScreen && styles.webContainer,
          style,
        ]}
        {...props}
      >
        {children}
      </Container>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  innerContainer: {
    flex: 1,
    width: '100%',
    maxWidth: '100%',
  },
  webContainer: {
    maxWidth: 500,
    marginHorizontal: 'auto',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#F0F0F0',
    // Shadow for a "mobile app" look on desktop
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
});
