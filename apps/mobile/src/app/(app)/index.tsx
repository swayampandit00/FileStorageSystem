import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { api, formatBytes, formatDate, type Activity, type CloudFile, type Usage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { styles } from "../../theme";

export default function Home() {
  const { user } = useAuth();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [recent, setRecent] = useState<CloudFile[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api<Usage>("/api/storage/usage"),
      api<Activity[]>("/api/storage/activity"),
      api<{ files: CloudFile[] }>("/api/files?mode=recent"),
    ])
      .then(([u, a, r]) => {
        setUsage(u);
        setActivity(a);
        setRecent(r.files.slice(0, 8));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  const pct = usage ? Math.min(100, Math.round((usage.usedBytes / Math.max(1, usage.quotaBytes)) * 100)) : 0;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.pad}>
      <Text style={styles.h1}>Home</Text>
      <Text style={styles.muted}>Welcome back, {user?.displayName}. Everything stays on this machine.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Used</Text>
          <Text style={styles.statValue}>{usage ? formatBytes(usage.usedBytes) : "..."}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Quota</Text>
          <Text style={styles.statValue}>{usage ? formatBytes(usage.quotaBytes) : "..."}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Free</Text>
          <Text style={styles.statValue}>{usage ? formatBytes(usage.remainingBytes) : "..."}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Fill</Text>
          <Text style={styles.statValue}>{pct}%</Text>
        </View>
      </View>
      <View style={styles.card}>
        <Text style={styles.h2}>Suggested</Text>
        {recent.length === 0 ? (
          <Text style={styles.muted}>Upload a file to see recents here.</Text>
        ) : (
          recent.map((f) => (
            <Text key={f.id} style={styles.itemTitle}>
              {f.displayName}{" "}
              <Text style={styles.muted}>
                {formatBytes(f.sizeBytes)} · {formatDate(f.updatedAt)}
              </Text>
            </Text>
          ))
        )}
      </View>
      <View style={styles.card}>
        <Text style={styles.h2}>Activity</Text>
        {activity.length === 0 ? (
          <Text style={styles.muted}>No recent activity.</Text>
        ) : (
          activity.slice(0, 10).map((a) => (
            <Text key={a.id} style={styles.muted}>
              {a.action}
              {a.detail ? ` — ${a.detail}` : ""} · {formatDate(a.created_at)}
            </Text>
          ))
        )}
      </View>
      <Link href="/(app)/files" style={styles.btn}>
        <Text style={styles.btnText}>Go to My Drive</Text>
      </Link>
    </ScrollView>
  );
}
