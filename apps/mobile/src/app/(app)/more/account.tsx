import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { api, formatBytes, type Usage } from "../../../api/client";
import { useAuth } from "../../../auth/AuthContext";
import { colors, styles } from "../../../theme";

export default function Account() {
  const { user, refreshMe } = useAuth();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Usage>("/api/storage/usage")
      .then(setUsage)
      .catch(() => undefined);
  }, []);

  async function onSave() {
    setError(null);
    setMsg(null);
    try {
      const body: Record<string, string> = { displayName };
      if (newPassword) {
        body.currentPassword = currentPassword;
        body.newPassword = newPassword;
      }
      await api("/api/auth/me", { method: "PATCH", body: JSON.stringify(body) });
      await refreshMe();
      setCurrentPassword("");
      setNewPassword("");
      setMsg("Saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.pad}>
      <Text style={styles.h1}>Settings</Text>
      <View style={styles.card}>
        <Text style={styles.muted}>Display name</Text>
        <TextInput
          style={styles.input}
          placeholderTextColor={colors.muted}
          value={displayName}
          onChangeText={setDisplayName}
        />
        <Text style={styles.muted}>Email</Text>
        <Text style={styles.itemTitle}>{user?.email}</Text>
        <TextInput
          style={styles.input}
          placeholder="Current password"
          placeholderTextColor={colors.muted}
          secureTextEntry
          value={currentPassword}
          onChangeText={setCurrentPassword}
        />
        <TextInput
          style={styles.input}
          placeholder="New password"
          placeholderTextColor={colors.muted}
          secureTextEntry
          value={newPassword}
          onChangeText={setNewPassword}
        />
        {msg ? <Text style={styles.ok}>{msg}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={styles.btn} onPress={onSave}>
          <Text style={styles.btnText}>Save</Text>
        </Pressable>
      </View>
      <View style={styles.card}>
        <Text style={styles.muted}>Role</Text>
        <Text style={styles.badge}>{user?.role}</Text>
        <Text style={styles.muted}>Quota</Text>
        <Text style={styles.itemTitle}>
          {usage ? `${formatBytes(usage.usedBytes)} / ${formatBytes(usage.quotaBytes)}` : "..."}
        </Text>
      </View>
    </ScrollView>
  );
}
