import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { api, formatBytes, formatDate, type ShareItem } from "../../../api/client";
import { styles } from "../../../theme";

export default function Shares() {
  const [items, setItems] = useState<ShareItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await api<ShareItem[]>("/api/shares"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load shares");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function revoke(id: string) {
    Alert.alert("Revoke", "Revoke this share link?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Revoke",
        style: "destructive",
        onPress: async () => {
          try {
            await api(`/api/shares/${id}`, { method: "DELETE" });
            await load();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Revoke failed");
          }
        },
      },
    ]);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.pad}>
      <Text style={styles.h1}>Shared files</Text>
      <Text style={styles.muted}>Links you created. Revoke anytime.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {items.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.muted}>You have not created any share links yet.</Text>
        </View>
      ) : (
        items.map((s) => (
          <View key={s.id} style={styles.item}>
            <Text style={styles.itemTitle}>
              {s.fileName} {s.sizeBytes != null ? `(${formatBytes(s.sizeBytes)})` : ""}
            </Text>
            <Text style={styles.muted}>
              {formatDate(s.createdAt)} · {s.revoked ? "revoked" : "active"} · {s.downloadCount} downloads
            </Text>
            {!s.revoked ? (
              <Pressable style={styles.btnDanger} onPress={() => revoke(s.id)}>
                <Text style={styles.btnDangerText}>Revoke</Text>
              </Pressable>
            ) : null}
          </View>
        ))
      )}
    </ScrollView>
  );
}
