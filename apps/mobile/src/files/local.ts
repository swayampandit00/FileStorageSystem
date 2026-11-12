import { Platform } from "react-native";
import { downloadUrl, fetchAuthorized, previewUrl, versionDownloadUrl, versionPreviewUrl } from "../api/client";

function safeName(name: string) {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 120) || "file";
}

export async function downloadAuthorized(path: string, displayName: string): Promise<{ uri: string }> {
  const res = await fetchAuthorized(path);
  if (!res.ok) throw new Error(res.status === 415 ? "Preview not available for this type" : "Download failed");
  if (Platform.OS === "web") {
    const blob = await res.blob();
    return { uri: URL.createObjectURL(blob) };
  }
  const { File, Paths } = await import("expo-file-system");
  const dest = new File(Paths.cache, `${Date.now()}-${safeName(displayName)}`);
  if (dest.exists) dest.delete();
  dest.create();
  await dest.write(new Uint8Array(await res.arrayBuffer()));
  return { uri: dest.uri };
}

export async function cachePreview(fileId: string, displayName: string) {
  return downloadAuthorized(previewUrl(fileId), displayName);
}

export async function cacheDownload(fileId: string, displayName: string) {
  return downloadAuthorized(downloadUrl(fileId), displayName);
}

export async function cacheVersion(fileId: string, versionId: string, displayName: string, kind: "preview" | "download") {
  const path = kind === "preview" ? versionPreviewUrl(fileId, versionId) : versionDownloadUrl(fileId, versionId);
  return downloadAuthorized(path, displayName);
}

export async function readLocalText(uri: string): Promise<string> {
  if (Platform.OS === "web" || uri.startsWith("blob:")) {
    const res = await fetch(uri);
    return (await res.text()).slice(0, 20000);
  }
  const { File } = await import("expo-file-system");
  return (await new File(uri).text()).slice(0, 20000);
}

export async function openLocal(uri: string, mimeType: string, title: string) {
  if (Platform.OS === "web") {
    const a = document.createElement("a");
    a.href = uri;
    a.target = "_blank";
    a.rel = "noreferrer";
    if (!mimeType.startsWith("image/") && mimeType !== "application/pdf" && !mimeType.startsWith("text/")) {
      a.download = title;
    }
    a.click();
    return;
  }
  const { File } = await import("expo-file-system");
  const file = new File(uri);
  try {
    if (await file.canPreview({ mimeType })) {
      await file.preview({ title, mimeType });
      return;
    }
  } catch {
    // fall through to share sheet
  }
  const Sharing = await import("expo-sharing");
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: title });
    return;
  }
  throw new Error("Preview is not available for this type on this device");
}
