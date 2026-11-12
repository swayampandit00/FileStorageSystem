import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { api, fileGlyph, formatBytes, formatDate, type CloudFile, type Folder } from "../../../api/client";
import { styles } from "../../../theme";

export default function SharedWithMe() {
  const [files, setFiles] = useState<CloudFile[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ files: CloudFile[]; folders: Folder[] }>("/api/storage/shared-with-me")
      .then((d) => {
        setFiles(d.files);
        setFolders(d.folders);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.pad}>
      <Text style={styles.h1}>Shared with me</Text>
      <Text style={styles.muted}>Files other accounts on this server granted you.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {folders.length === 0 && files.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.muted}>Nobody has shared an item with you yet.</Text>
        </View>
      ) : null}
      {folders.map((f) => (
        <View key={f.id} style={styles.item}>
          <Text style={styles.itemTitle}>DIR {f.name}</Text>
          <Text style={styles.muted}>
            {f.ownerName} ({f.ownerEmail}) · {f.permission} · {formatDate(f.createdAt)}
          </Text>
        </View>
      ))}
      {files.map((f) => (
        <View key={f.id} style={styles.item}>
          <Text style={styles.itemTitle}>
            {fileGlyph(f.mimeType)} {f.displayName}
          </Text>
          <Text style={styles.muted}>
            {f.ownerName} ({f.ownerEmail}) · {f.permission} · {formatBytes(f.sizeBytes)}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}
