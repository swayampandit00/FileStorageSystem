import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Image, Platform, Pressable, ScrollView, Text, View } from "react-native";
import {
  api,
  fileGlyph,
  formatBytes,
  formatDate,
  type CloudFile,
  type FileVersion,
} from "../../../api/client";
import { cacheDownload, cachePreview, cacheVersion, openLocal } from "../../../files/local";
import { colors, styles } from "../../../theme";

export default function FileDetail() {
  const rawId = useLocalSearchParams<{ id: string | string[] }>().id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const [file, setFile] = useState<CloudFile | null>(null);
  const [versions, setVersions] = useState<FileVersion[]>([]);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const meta = await api<CloudFile>(`/api/files/${id}`);
      setFile(meta);
      const hist = await api<{ current: CloudFile; versions: FileVersion[] }>(`/api/files/${id}/versions`);
      setVersions(hist.versions);
      const image = meta.mimeType.startsWith("image/");
      const txt = meta.mimeType.startsWith("text/") || meta.mimeType === "application/json";
      if (image || txt) {
        const local = await cachePreview(meta.id, meta.displayName);
        setPreviewUri(local.uri);
        if (txt) {
          if (Platform.OS === "web") {
            const res = await fetch(local.uri);
            setText((await res.text()).slice(0, 20000));
          } else {
            setText((await new File(local.uri).text()).slice(0, 20000));
          }
        }
      } else {
        setPreviewUri(null);
        setText(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open file");
    }
  }, [id]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function download() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const local = await cacheDownload(file.id, file.displayName);
      await openLocal(local.uri, file.mimeType, file.displayName);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusy(false);
    }
  }

  async function previewNative() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const local = await cachePreview(file.id, file.displayName);
      await openLocal(local.uri, file.mimeType, file.displayName);
    } catch {
      try {
        const local = await cacheDownload(file.id, file.displayName);
        await openLocal(local.uri, file.mimeType, file.displayName);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Preview failed");
      }
    } finally {
      setBusy(false);
    }
  }

  async function restore(version: FileVersion) {
    if (!file) return;
    Alert.alert("Restore version", `Make v${version.versionNumber} the current file? The current file is kept as a version.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Restore",
        onPress: async () => {
          try {
            await api(`/api/files/${file.id}/versions/${version.id}/restore`, { method: "POST" });
            await load();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Restore failed");
          }
        },
      },
    ]);
  }

  async function replaceVersion() {
    if (!file) return;
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    const fd = new FormData();
    fd.append("file", {
      uri: asset.uri,
      name: asset.name,
      type: asset.mimeType ?? "application/octet-stream",
    } as unknown as Blob);
    setBusy(true);
    setError(null);
    try {
      await api(`/api/files/${file.id}/replace`, { method: "POST", body: fd });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Replace failed");
    } finally {
      setBusy(false);
    }
  }

  async function openVersion(version: FileVersion, kind: "preview" | "download") {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const name = `${file.displayName}.v${version.versionNumber}`;
      const local = await cacheVersion(file.id, version.id, name, kind);
      await openLocal(local.uri, version.mimeType, name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open version");
    } finally {
      setBusy(false);
    }
  }

  if (!file) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{error ?? "Loading..."}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.pad}>
      <Pressable onPress={() => router.back()}>
        <Text style={styles.navLink}>Back</Text>
      </Pressable>
      <Text style={styles.h1}>
        {fileGlyph(file.mimeType)} {file.displayName}
      </Text>
      <Text style={styles.muted}>
        {file.mimeType} · {formatBytes(file.sizeBytes)} · {formatDate(file.updatedAt)}
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {previewUri && file.mimeType.startsWith("image/") ? (
        <Image source={{ uri: previewUri }} style={{ width: "100%", height: 280, borderRadius: 12, backgroundColor: colors.soft }} resizeMode="contain" />
      ) : null}
      {text != null ? (
        <View style={styles.card}>
          <Text style={{ color: colors.text, fontFamily: "monospace", fontSize: 12 }}>{text}</Text>
        </View>
      ) : null}

      <View style={styles.row}>
        <Pressable style={styles.btn} onPress={previewNative} disabled={busy}>
          <Text style={styles.btnText}>{busy ? "Working..." : "Preview"}</Text>
        </Pressable>
        <Pressable style={styles.btnGhost} onPress={download} disabled={busy}>
          <Text style={styles.btnGhostText}>Download</Text>
        </Pressable>
        <Pressable style={styles.btnGhost} onPress={replaceVersion} disabled={busy}>
          <Text style={styles.btnGhostText}>New version</Text>
        </Pressable>
      </View>

      <Text style={styles.h2}>Version history</Text>
      <Text style={styles.muted}>Replacing or restoring keeps the current bytes as a previous version (up to 20). Bytes stay on the server disk.</Text>
      {versions.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.muted}>No previous versions yet. Upload a replacement from My Drive to start history.</Text>
        </View>
      ) : (
        versions.map((v) => (
          <View key={v.id} style={styles.item}>
            <Text style={styles.itemTitle}>v{v.versionNumber}</Text>
            <Text style={styles.muted}>
              {formatBytes(v.sizeBytes)} · {formatDate(v.createdAt)}
            </Text>
            <View style={styles.row}>
              <Pressable style={styles.btnGhost} onPress={() => openVersion(v, "preview")}>
                <Text style={styles.btnGhostText}>Preview</Text>
              </Pressable>
              <Pressable style={styles.btnGhost} onPress={() => openVersion(v, "download")}>
                <Text style={styles.btnGhostText}>Download</Text>
              </Pressable>
              <Pressable style={styles.btn} onPress={() => restore(v)}>
                <Text style={styles.btnText}>Restore</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}
