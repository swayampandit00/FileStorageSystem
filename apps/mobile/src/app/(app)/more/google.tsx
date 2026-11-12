import { useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { api, formatBytes, formatDate } from "../../../api/client";
import { styles } from "../../../theme";

type Status = { configured: boolean; connected: boolean; email: string | null };

type GItem = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  isFolder: boolean;
};

type Listed = { files: GItem[]; nextPageToken: string | null; parentId: string };

export default function ImportGoogle() {
  const params = useLocalSearchParams<{ folderId?: string; google?: string }>();
  const destFolderId = typeof params.folderId === "string" ? params.folderId : null;
  const [status, setStatus] = useState<Status | null>(null);
  const [items, setItems] = useState<GItem[]>([]);
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [parentId, setParentId] = useState("root");
  const [trail, setTrail] = useState<{ id: string; name: string }[]>([{ id: "root", name: "Google Drive" }]);
  const [selected, setSelected] = useState<Map<string, GItem>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadStatus = useCallback(async () => {
    const s = await api<Status>("/api/google/status");
    setStatus(s);
    return s;
  }, []);

  const loadList = useCallback(async (folder: string, page?: string, append = false) => {
    const data = await api<Listed>(
      `/api/google/files?parentId=${encodeURIComponent(folder)}${page ? `&pageToken=${encodeURIComponent(page)}` : ""}`
    );
    setItems((prev) => (append ? [...prev, ...data.files] : data.files));
    setNextPage(data.nextPageToken);
    setParentId(data.parentId);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const s = await loadStatus();
        if (s.connected) await loadList("root");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load Google Drive");
      }
    })();
  }, [loadList, loadStatus]);

  async function connect() {
    setError(null);
    try {
      const data = await api<{ url: string }>("/api/google/connect");
      await WebBrowser.openBrowserAsync(data.url);
      const s = await loadStatus();
      if (s.connected) await loadList("root");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start Google sign-in");
    }
  }

  async function onDisconnect() {
    Alert.alert("Disconnect", "Disconnect Google Drive from this account?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Disconnect",
        style: "destructive",
        onPress: async () => {
          await api("/api/google", { method: "DELETE" });
          setStatus({ configured: status?.configured ?? false, connected: false, email: null });
          setItems([]);
          setSelected(new Map());
          setOkMsg("Disconnected.");
        },
      },
    ]);
  }

  function toggle(item: GItem) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.set(item.id, item);
      return next;
    });
  }

  async function openFolder(item: GItem) {
    if (!item.isFolder) return;
    setBusy(true);
    try {
      await loadList(item.id);
      setTrail((t) => [...t, { id: item.id, name: item.name }]);
      setSelected(new Map());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open folder");
    } finally {
      setBusy(false);
    }
  }

  async function jump(index: number) {
    const item = trail[index];
    setBusy(true);
    try {
      await loadList(item.id);
      setTrail(trail.slice(0, index + 1));
      setSelected(new Map());
    } finally {
      setBusy(false);
    }
  }

  async function importSelected() {
    if (selected.size === 0) return;
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      const result = await api<{ imported: number; folders: number; skipped: { name: string; reason: string }[] }>(
        "/api/google/import",
        {
          method: "POST",
          body: JSON.stringify({
            folderId: destFolderId,
            items: [...selected.values()].map((i) => ({ id: i.id, name: i.name, mimeType: i.mimeType })),
          }),
        }
      );
      setOkMsg(`Imported ${result.imported} file(s) and ${result.folders} folder(s) onto this server.`);
      setSelected(new Map());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  const listed = useMemo(
    () => [...items].sort((a, b) => Number(b.isFolder) - Number(a.isFolder) || a.name.localeCompare(b.name)),
    [items]
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.pad}>
      <Text style={styles.h1}>Import from Google Drive</Text>
      <Text style={styles.muted}>Grant Drive permission, pick files, then copy them onto this server disk.</Text>
      {okMsg ? <Text style={styles.ok}>{okMsg}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.card}>
        <Text style={styles.muted}>Google account</Text>
        <Text style={styles.itemTitle}>
          {!status
            ? "..."
            : status.connected
              ? status.email || "Connected"
              : status.configured
                ? "Not connected"
                : "Not configured on this server"}
        </Text>
        {status?.connected ? (
          <Pressable style={styles.btnGhost} onPress={onDisconnect}>
            <Text style={styles.btnGhostText}>Disconnect</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.btn} onPress={connect} disabled={!status?.configured}>
            <Text style={styles.btnText}>Allow Google Drive access</Text>
          </Pressable>
        )}
        {status && !status.configured ? (
          <Text style={styles.muted}>Admin: set GOOGLE_CLIENT_ID in apps/server/.env. See docs/SETUP.md.</Text>
        ) : null}
      </View>
      {status?.connected ? (
        <>
          <View style={styles.row}>
            {trail.map((t, i) => (
              <Pressable key={`${t.id}-${i}`} onPress={() => jump(i)}>
                <Text style={styles.navLink}>{i > 0 ? `/ ${t.name}` : t.name}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={styles.btn} disabled={busy || selected.size === 0} onPress={importSelected}>
            <Text style={styles.btnText}>{busy ? "Importing..." : `Import selected (${selected.size})`}</Text>
          </Pressable>
          {listed.map((item) => {
            const on = selected.has(item.id);
            return (
              <Pressable
                key={item.id}
                style={[styles.item, on ? { borderColor: "#1a73e8" } : null]}
                onPress={() => (item.isFolder ? openFolder(item) : toggle(item))}
                onLongPress={() => toggle(item)}
              >
                <Text style={styles.itemTitle}>
                  {on ? "[x] " : "[ ] "}
                  {item.isFolder ? "DIR " : "G "}
                  {item.name}
                </Text>
                <Text style={styles.muted}>
                  {item.isFolder
                    ? "Folder · tap to open, long-press to select"
                    : `${item.size ? formatBytes(Number(item.size)) : "Google file"}${
                        item.modifiedTime ? ` · ${formatDate(item.modifiedTime)}` : ""
                      }`}
                </Text>
              </Pressable>
            );
          })}
          {nextPage ? (
            <Pressable style={styles.btnGhost} disabled={busy} onPress={() => loadList(parentId, nextPage, true)}>
              <Text style={styles.btnGhostText}>Load more</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}
