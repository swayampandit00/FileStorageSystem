import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const ACCESS = "mc_access";
const REFRESH = "mc_refresh";

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

async function setItem(key: string, value: string | null) {
  if (Platform.OS === "web") {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
    return;
  }
  if (value === null) await SecureStore.deleteItemAsync(key);
  else await SecureStore.setItemAsync(key, value);
}

export async function loadStoredTokens(): Promise<{ access: string | null; refresh: string | null }> {
  const [access, refresh] = await Promise.all([getItem(ACCESS), getItem(REFRESH)]);
  return { access, refresh };
}

export async function saveStoredTokens(access: string | null, refresh: string | null) {
  await Promise.all([setItem(ACCESS, access), setItem(REFRESH, refresh)]);
}
