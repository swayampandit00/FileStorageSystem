import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { api, formatBytes } from "../../../api/client";
import { useAuth } from "../../../auth/AuthContext";
import { styles } from "../../../theme";

type Stats = {
  users: number;
  files: number;
  trashed: number;
  bytes: number;
  shares: number;
  collabs: number;
  breakdown: { category: string; count: number; bytes: number }[];
  topUsers: {
    id: string;
    email: string;
    display_name: string;
    quota_bytes: number;
    used_bytes: number;
    file_count: number;
  }[];
};

export default function AdminOverview() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.role !== "admin") return;
    api<Stats>("/api/admin/stats")
      .then(setStats)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, [user?.role]);

  if (user?.role !== "admin") return <Redirect href="/(app)" />;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.pad}>
      <Text style={styles.h1}>Admin overview</Text>
      <Text style={styles.muted}>Disk usage across all accounts. Files never leave this machine.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Users</Text>
          <Text style={styles.statValue}>{stats?.users ?? "..."}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Files</Text>
          <Text style={styles.statValue}>{stats?.files ?? "..."}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Stored</Text>
          <Text style={styles.statValue}>{stats ? formatBytes(stats.bytes) : "..."}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Trash / links / people</Text>
          <Text style={styles.statValue}>{stats ? `${stats.trashed} · ${stats.shares} · ${stats.collabs}` : "..."}</Text>
        </View>
      </View>
      <View style={styles.card}>
        <Text style={styles.h2}>By type</Text>
        {!stats?.breakdown?.length ? (
          <Text style={styles.muted}>No files yet.</Text>
        ) : (
          stats.breakdown.map((b) => (
            <Text key={b.category} style={styles.muted}>
              {b.category}: {formatBytes(b.bytes)} ({b.count})
            </Text>
          ))
        )}
      </View>
      <View style={styles.card}>
        <Text style={styles.h2}>Top storage users</Text>
        {!stats?.topUsers?.length ? (
          <Text style={styles.muted}>No usage yet.</Text>
        ) : (
          stats.topUsers.map((u) => (
            <Text key={u.id} style={styles.muted}>
              {u.display_name} ({u.email}) — {formatBytes(u.used_bytes)} / {formatBytes(u.quota_bytes)} · {u.file_count}{" "}
              files
            </Text>
          ))
        )}
      </View>
    </ScrollView>
  );
}
