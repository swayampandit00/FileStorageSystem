import { Stack } from "expo-router";
import { colors } from "../../../theme";

export default function MoreLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="index" options={{ title: "More" }} />
      <Stack.Screen name="google" options={{ title: "Google Drive" }} />
      <Stack.Screen name="shared-with-me" options={{ title: "Shared with me" }} />
      <Stack.Screen name="shares" options={{ title: "Link shares" }} />
      <Stack.Screen name="starred" options={{ title: "Starred" }} />
      <Stack.Screen name="recent" options={{ title: "Recent" }} />
      <Stack.Screen name="trash" options={{ title: "Trash" }} />
      <Stack.Screen name="account" options={{ title: "Settings" }} />
      <Stack.Screen name="admin" options={{ title: "Admin" }} />
      <Stack.Screen name="admin-users" options={{ title: "Users" }} />
      <Stack.Screen name="admin-audit" options={{ title: "Audit log" }} />
    </Stack>
  );
}
