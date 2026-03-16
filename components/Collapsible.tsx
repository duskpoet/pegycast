import { ReactNode, useEffect, useState } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

interface CollapsibleProps {
  expanded: boolean;
  collapsedHeight?: number;
  children: ReactNode;
}

const TIMING_CONFIG = {
  duration: 300,
  easing: Easing.bezier(0.25, 0.1, 0.25, 1),
};

export function Collapsible({ expanded, collapsedHeight = 0, children }: CollapsibleProps) {
  const [contentHeight, setContentHeight] = useState(collapsedHeight);
  const animatedHeight = useSharedValue(collapsedHeight);

  useEffect(() => {
    const target = expanded ? Math.max(contentHeight, collapsedHeight) : collapsedHeight;
    animatedHeight.value = withTiming(target, TIMING_CONFIG);
  }, [expanded, contentHeight, collapsedHeight, animatedHeight]);

  const animStyle = useAnimatedStyle(() => ({
    height: animatedHeight.value,
    overflow: "hidden" as const,
  }));

  return (
    <Animated.View style={animStyle}>
      <View
        style={{ position: "absolute" as const, top: 0, left: 0, right: 0 }}
        onLayout={(e) => {
          const h = Math.ceil(e.nativeEvent.layout.height);
          if (h > 0 && h !== contentHeight) setContentHeight(h);
        }}
      >
        {children}
      </View>
    </Animated.View>
  );
}
