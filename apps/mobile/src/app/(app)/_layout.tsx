import { Redirect, Tabs } from "expo-router";
import { useAuth } from "../../auth/AuthContext";
import { colors } from "../../theme";

export default function AppLayout() {
  const { user } = useAuth();
  if (!user) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerTitle: "MyCloud",
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.line,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarLabel: "Home" }} />
      <Tabs.Screen name="files" options={{ title: "My Drive", tabBarLabel: "Drive" }} />
      <Tabs.Screen name="more" options={{ title: "More", tabBarLabel: "More", headerShown: false }} />
      <Tabs.Screen name="file/[id]" options={{ href: null, title: "File" }} />
    </Tabs>
  );
}
