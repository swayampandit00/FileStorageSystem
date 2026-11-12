import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import {
  api,
  fileGlyph,
  formatBytes,
  formatDate,
  type CloudFile,
  type Folder,
} from "../api/client";
import { FilePreview } from "./FilePreview";
import { colors, styles } from "../theme";

export type DriveMode = "drive" | "starred" | "recent" | "trash";

type Props = {
  mode: DriveMode;
  title: string;
  subtitle: string;
};

export function DriveList({ mode, title, subtitle }: Props) {
  const [folderId, setFolderId] = useState<string | null>(null);
  const [trail, setTrail] = useState<{ id: string | null; name: string }[]>([{ id: null, name: "My Drive" }]);
  const [files, setFiles] = useState<CloudFile[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [previewFile, setPreviewFile] = useState<CloudFile | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("mode", mode);
      if (mode === "drive" && folderId) params.set("folderId", folderId);
      if (q.trim()) params.set("q", q.trim());
      const data = await api<{ files: CloudFile[]; folders: Folder[] }>(`/api/files?${params.toString()}`);
      setFiles(data.files);
      setFolders(data.folders);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load files");
    }
  }, [folderId, mode, q]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const listedFolders = useMemo(() => [...folders].sort((a, b) => a.name.localeCompare(b.name)), [folders]);
  const listedFiles = useMemo(
    () => [...files].sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [files]
  );

  function openFolder(folder: Folder) {
    if (mode !== "drive") return;
    setFolderId(folder.id);
    setTrail((t) => [...t, { id: folder.id, name: folder.name }]);
    setQ("");
  }

  function jump(index: number) {
    const item = trail[index];
    setTrail(trail.slice(0, index + 1));
    setFolderId(item.id);
    setQ("");
  }

  async function postFiles(parts: { uri: string; name: string; type: string }[]) {
    if (!parts.length) return;
    const fd = new FormData();
    for (const part of parts) {
      fd.append("file", {
        uri: part.uri,
        name: part.name,
        type: part.type,
      } as unknown as Blob);
    }
    if (folderId) fd.append("folderId", folderId);
    setBusy(true);
    setError(null);
    try {
      await api("/api/files/upload", { method: "POST", body: fd });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function upload() {
    const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.length) return;
    await postFiles(
      result.assets.map((asset) => ({
        uri: asset.uri,
        name: asset.name,
        type: asset.mimeType ?? "application/octet-stream",
      }))
    );
  }

  async function uploadFromGallery() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Photo library permission is required");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      allowsMultipleSelection: true,
      quality: 1,
    });
    if (result.canceled || !result.assets?.length) return;
    await postFiles(
      result.assets.map((asset, i) => ({
        uri: asset.uri,
        name: asset.fileName ?? (asset.type === "video" ? `video-${i + 1}.mp4` : `photo-${i + 1}.jpg`),
        type: asset.mimeType ?? (asset.type === "video" ? "video/mp4" : "image/jpeg"),
      }))
    );
  }

  async function uploadFromCamera() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError("Camera permission is required");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 1,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    await postFiles([
      {
        uri: asset.uri,
        name: asset.fileName ?? `camera-${Date.now()}.jpg`,
        type: asset.mimeType ?? "image/jpeg",
      },
    ]);
  }

  async function newFolder() {
    const name = folderName.trim();
    if (!name) {
      setError("Enter a folder name first");
      return;
    }
    try {
      await api("/api/folders", { method: "POST", body: JSON.stringify({ name, parentId: folderId }) });
      setFolderName("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create folder");
    }
  }

  async function actFile(file: CloudFile, action: "star" | "trash" | "restore" | "purge") {
    try {
      if (action === "star") {
        await api(`/api/files/${file.id}/star`, { method: "POST", body: JSON.stringify({ starred: !file.starred }) });
      } else if (action === "restore") {
        await api(`/api/files/${file.id}/restore`, { method: "POST" });
      } else if (action === "purge") {
        await api(`/api/files/${file.id}/purge`, { method: "POST" });
      } else {
        await api(`/api/files/${file.id}`, { method: "DELETE" });
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    }
  }

  async function actFolder(folder: Folder, action: "star" | "trash" | "restore") {
    try {
      if (action === "star") {
        await api(`/api/folders/${folder.id}/star`, { method: "POST", body: JSON.stringify({ starred: !folder.starred }) });
      } else if (action === "restore") {
        await api(`/api/folders/${folder.id}/restore`, { method: "POST" });
      } else {
        await api(`/api/folders/${folder.id}`, { method: "DELETE" });
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    }
  }

  async function emptyTrash() {
    Alert.alert("Empty trash", "Permanently delete everything in trash?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await api("/api/files/empty-trash", { method: "POST" });
          await load();
        },
      },
    ]);
  }

  const inTrash = mode === "trash";

  if (previewFile) {
    return <FilePreview file={previewFile} onClose={() => setPreviewFile(null)} />;
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.pad}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={colors.accent}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
    >
      <Text style={styles.h1}>{title}</Text>
      {mode === "drive" ? (
        <View style={styles.row}>
          {trail.map((t, i) => (
            <Pressable key={`${t.id}-${i}`} onPress={() => jump(i)}>
              <Text style={styles.navLink}>{i > 0 ? `/ ${t.name}` : t.name}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <Text style={styles.muted}>{subtitle}</Text>
      )}

      <TextInput
        style={styles.input}
        placeholder="Search in MyCloud"
        placeholderTextColor={colors.muted}
        value={q}
        onChangeText={setQ}
      />

      {mode === "drive" ? (
        <View style={{ gap: 8 }}>
          <View style={styles.row}>
            <Pressable style={styles.btn} onPress={upload} disabled={busy}>
              <Text style={styles.btnText}>{busy ? "Uploading..." : "Files"}</Text>
            </Pressable>
            <Pressable style={styles.btnGhost} onPress={uploadFromGallery} disabled={busy}>
              <Text style={styles.btnGhostText}>Gallery</Text>
            </Pressable>
            <Pressable style={styles.btnGhost} onPress={uploadFromCamera} disabled={busy}>
              <Text style={styles.btnGhostText}>Camera</Text>
            </Pressable>
          </View>
          <TextInput
            style={styles.input}
            placeholder="New folder name"
            placeholderTextColor={colors.muted}
            value={folderName}
            onChangeText={setFolderName}
          />
          <Pressable style={styles.btnGhost} onPress={newFolder}>
            <Text style={styles.btnGhostText}>Create folder</Text>
          </Pressable>
        </View>
      ) : null}

      {inTrash ? (
        <Pressable style={styles.btnDanger} onPress={emptyTrash}>
          <Text style={styles.btnDangerText}>Empty trash</Text>
        </Pressable>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {listedFolders.length === 0 && listedFiles.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.muted}>
            {mode === "drive" ? "No files yet. Upload to keep bytes on this server disk." : "Nothing here yet."}
          </Text>
        </View>
      ) : null}

      {listedFolders.map((folder) => (
        <View key={folder.id} style={styles.item}>
          <Pressable onPress={() => openFolder(folder)}>
            <Text style={styles.itemTitle}>DIR {folder.name}</Text>
            <Text style={styles.muted}>{formatDate(folder.createdAt)}</Text>
          </Pressable>
          <View style={styles.row}>
            {inTrash ? (
              <Pressable style={styles.btnGhost} onPress={() => actFolder(folder, "restore")}>
                <Text style={styles.btnGhostText}>Restore</Text>
              </Pressable>
            ) : (
              <>
                <Pressable style={styles.btnGhost} onPress={() => actFolder(folder, "star")}>
                  <Text style={styles.btnGhostText}>{folder.starred ? "Unstar" : "Star"}</Text>
                </Pressable>
                <Pressable style={styles.btnDanger} onPress={() => actFolder(folder, "trash")}>
                  <Text style={styles.btnDangerText}>Trash</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      ))}

      {listedFiles.map((file) => (
        <View key={file.id} style={styles.item}>
          <Pressable onPress={() => !inTrash && setPreviewFile(file)}>
            <Text style={styles.itemTitle}>
              {fileGlyph(file.mimeType)} {file.displayName}
            </Text>
            <Text style={styles.muted}>
              {formatBytes(file.sizeBytes)} · {formatDate(file.updatedAt)}
            </Text>
          </Pressable>
          <View style={styles.row}>
            {inTrash ? (
              <>
                <Pressable style={styles.btnGhost} onPress={() => actFile(file, "restore")}>
                  <Text style={styles.btnGhostText}>Restore</Text>
                </Pressable>
                <Pressable style={styles.btnDanger} onPress={() => actFile(file, "purge")}>
                  <Text style={styles.btnDangerText}>Delete forever</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable style={styles.btnGhost} onPress={() => setPreviewFile(file)}>
                  <Text style={styles.btnGhostText}>Open</Text>
                </Pressable>
                <Pressable style={styles.btnGhost} onPress={() => actFile(file, "star")}>
                  <Text style={styles.btnGhostText}>{file.starred ? "Unstar" : "Star"}</Text>
                </Pressable>
                <Pressable style={styles.btnDanger} onPress={() => actFile(file, "trash")}>
                  <Text style={styles.btnDangerText}>Trash</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
