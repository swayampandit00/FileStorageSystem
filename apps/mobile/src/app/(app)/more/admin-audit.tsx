import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { api, formatDate } from "../../../api/client";
import { useAuth } from "../../../auth/AuthContext";
import { styles } from "../../../theme";

type EventRow = {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  ip: string | null;
  detail: string | null;
  created_at: string;
};

export default function AdminAudit() {
  const { user } = useAuth();
  const [rows, setRows] = useState<EventRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.role !== "admin") return;
    api<EventRow[]>("/api/admin/audit")
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, [user?.role]);

  if (user?.role !== "admin") return <Redirect href="/(app)" />;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.pad}>
      <Text style={styles.h1}>Audit log</Text>
      <Text style={styles.muted}>Recent security-relevant actions. Secrets are never stored here.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {rows.map((r) => (
        <View key={r.id} style={styles.item}>
          <Text style={styles.itemTitle}>{r.action}</Text>
          <Text style={styles.muted}>
            {formatDate(r.created_at)} · {r.actor_email ?? r.actor_id ?? "system"}
          </Text>
          <Text style={styles.muted}>
            {r.target_type} {r.target_id?.slice(0, 8)} {r.detail ?? ""}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}
