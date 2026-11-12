import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { api, formatBytes, type User } from "../../../api/client";
import { useAuth } from "../../../auth/AuthContext";
import { colors, styles } from "../../../theme";

type AdminUser = User & { usedBytes: number };

export default function AdminUsers() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load(query = q) {
    try {
      const params = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
      setUsers(await api<AdminUser[]>(`/api/admin/users${params}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    }
  }

  useEffect(() => {
    if (user?.role === "admin") load("");
  }, [user?.role]);

  async function patch(id: string, body: Record<string, unknown>) {
    try {
      await api(`/api/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  }

  if (user?.role !== "admin") return <Redirect href="/(app)" />;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.pad}>
      <Text style={styles.h1}>Users</Text>
      <Text style={styles.muted}>Search, set quota, disable accounts.</Text>
      <TextInput
        style={styles.input}
        placeholder="Search email or name"
        placeholderTextColor={colors.muted}
        value={q}
        onChangeText={setQ}
      />
      <Pressable style={styles.btnGhost} onPress={() => load()}>
        <Text style={styles.btnGhostText}>Search</Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {users.map((u) => (
        <View key={u.id} style={styles.item}>
          <Text style={styles.itemTitle}>{u.displayName}</Text>
          <Text style={styles.muted}>{u.email}</Text>
          <Text style={styles.muted}>
            {u.role} · {u.status} · {formatBytes(u.usedBytes)} / {formatBytes(u.quotaBytes)}
          </Text>
          <View style={styles.row}>
            <Pressable
              style={styles.btnGhost}
              onPress={() => patch(u.id, { quotaBytes: u.quotaBytes + 1024 ** 3 })}
            >
              <Text style={styles.btnGhostText}>+1 GB quota</Text>
            </Pressable>
            <Pressable
              style={styles.btnDanger}
              onPress={() => patch(u.id, { status: u.status === "active" ? "disabled" : "active" })}
            >
              <Text style={styles.btnDangerText}>{u.status === "active" ? "Disable" : "Enable"}</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
