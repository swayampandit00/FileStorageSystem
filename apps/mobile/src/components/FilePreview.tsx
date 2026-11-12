import * as DocumentPicker from "expo-document-picker";
import { createElement, useCallback, useEffect, useState } from "react";
import { Alert, Image, Platform, Pressable, ScrollView, Text, View } from "react-native";
import {
  api,
  fileGlyph,
  formatBytes,
  formatDate,
  type CloudFile,
  type FileVersion,
} from "../api/client";
import { cacheDownload, cachePreview, cacheVersion, openLocal, readLocalText } from "../files/local";
import { colors, styles } from "../theme";

function Media({ mime, uri, name }: { mime: string; uri: string; name: string }) {
  if (mime.startsWith("image/")) {
    if (Platform.OS === "web") {
      return createElement("img", {
        src: uri,
        alt: name,
        style: { width: "100%", maxHeight: 380, objectFit: "contain", borderRadius: 12, background: colors.soft },
      });
    }
    return (
      <Image
        source={{ uri }}
        style={{ width: "100%", height: 280, borderRadius: 12, backgroundColor: colors.soft }}
        resizeMode="contain"
      />
    );
  }
  if (Platform.OS !== "web") return null;
  if (mime.startsWith("video/")) {
    return createElement("video", { src: uri, controls: true, style: { width: "100%", maxHeight: 320, borderRadius: 12 } });
  }
  if (mime.startsWith("audio/")) {
    return createElement("audio", { src: uri, controls: true, style: { width: "100%", marginTop: 8 } });
  }
  if (mime === "application/pdf") {
    return createElement("iframe", { src: uri, title: name, style: { width: "100%", height: 420, border: 0, borderRadius: 12 } });
  }
  return null;
}

export function FilePreview({ file, onClose }: { file: CloudFile; onClose: () => void }) {
  const [uri, setUri] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [versions, setVersions] = useState<FileVersion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState(file);

  const load = useCallback(async () => {
    setError(null);
    setText(null);
    setUri(null);
    try {
      const latest = await api<CloudFile>(`/api/files/${file.id}`);
      setMeta(latest);
      try {
        const hist = await api<{ versions: FileVersion[] }>(`/api/files/${file.id}/versions`);
        setVersions(hist.versions);
      } catch {
        setVersions([]);
      }
      let local: { uri: string };
      try {
        local = await cachePreview(latest.id, `${latest.id}-${latest.displayName}`);
      } catch {
        local = await cacheDownload(latest.id, `${latest.id}-${latest.displayName}`);
      }
      setUri(local.uri);
      if (latest.mimeType.startsWith("text/") || latest.mimeType === "application/json") {
        setText(await readLocalText(local.uri));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open file");
    }
  }, [file.id]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function runOpen(kind: "preview" | "download") {
    setBusy(true);
    setError(null);
    try {
      const local =
        kind === "preview"
          ? await cachePreview(meta.id, `${meta.id}-${meta.displayName}`).catch(() =>
              cacheDownload(meta.id, `${meta.id}-${meta.displayName}`)
            )
          : await cacheDownload(meta.id, `${meta.id}-${meta.displayName}`);
      setUri(local.uri);
      await openLocal(local.uri, meta.mimeType, meta.displayName);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open file");
    } finally {
      setBusy(false);
    }
  }

  async function replaceVersion() {
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
      await api(`/api/files/${meta.id}/replace`, { method: "POST", body: fd });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Replace failed");
    } finally {
      setBusy(false);
    }
  }

  async function restore(version: FileVersion) {
    const ok =
      Platform.OS === "web"
        ? window.confirm(`Make v${version.versionNumber} the current file?`)
        : await new Promise<boolean>((resolve) => {
            Alert.alert("Restore version", `Make v${version.versionNumber} the current file?`, [
              { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
              { text: "Restore", onPress: () => resolve(true) },
            ]);
          });
    if (!ok) return;
    try {
      await api(`/api/files/${meta.id}/versions/${version.id}/restore`, { method: "POST" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Restore failed");
    }
  }

  async function openVersion(version: FileVersion, kind: "preview" | "download") {
    setBusy(true);
    setError(null);
    try {
      const name = `${meta.displayName}.v${version.versionNumber}`;
      const local = await cacheVersion(meta.id, version.id, `${meta.id}-${name}`, kind);
      await openLocal(local.uri, version.mimeType, name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open version");
    } finally {
      setBusy(false);
    }
  }

  const inline =
    meta.mimeType.startsWith("image/") ||
    meta.mimeType.startsWith("text/") ||
    meta.mimeType === "application/json" ||
    (Platform.OS === "web" &&
      (meta.mimeType.startsWith("video/") || meta.mimeType.startsWith("audio/") || meta.mimeType === "application/pdf"));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.pad}>
      <Pressable onPress={onClose}>
        <Text style={styles.navLink}>Close</Text>
      </Pressable>
      <Text style={styles.h1}>
        {fileGlyph(meta.mimeType)} {meta.displayName}
      </Text>
      <Text style={styles.muted}>
        {meta.mimeType} · {formatBytes(meta.sizeBytes)} · {formatDate(meta.updatedAt)}
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {uri && inline ? <Media mime={meta.mimeType} uri={uri} name={meta.displayName} /> : null}
      {text != null ? (
        <View style={styles.card}>
          <Text selectable style={{ color: colors.text, fontSize: 12, lineHeight: 18 }}>
            {text}
          </Text>
        </View>
      ) : null}
      {!uri && !error ? <Text style={styles.muted}>Loading preview...</Text> : null}
      {uri && !inline ? (
        <View style={styles.card}>
          <Text style={styles.muted}>Tap Preview to open this type in the device viewer.</Text>
        </View>
      ) : null}

      <View style={styles.row}>
        <Pressable style={styles.btn} onPress={() => runOpen("preview")} disabled={busy}>
          <Text style={styles.btnText}>{busy ? "Working..." : "Preview"}</Text>
        </Pressable>
        <Pressable style={styles.btnGhost} onPress={() => runOpen("download")} disabled={busy}>
          <Text style={styles.btnGhostText}>Download</Text>
        </Pressable>
        <Pressable style={styles.btnGhost} onPress={replaceVersion} disabled={busy}>
          <Text style={styles.btnGhostText}>New version</Text>
        </Pressable>
      </View>

      <Text style={styles.h2}>Version history</Text>
      <Text style={styles.muted}>Replace or restore keeps the current bytes as a previous version (up to 20).</Text>
      {versions.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.muted}>No previous versions yet.</Text>
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
