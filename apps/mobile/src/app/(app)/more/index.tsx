import { Link, router } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useAuth } from "../../../auth/AuthContext";
import { styles } from "../../../theme";

export default function More() {
  const { user, logout } = useAuth();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.pad}>
      <Text style={styles.h1}>More</Text>
      <Text style={styles.muted}>
        {user?.displayName} · {user?.email}
      </Text>
      <Text style={styles.badge}>{user?.role}</Text>
      <Link href="/(app)/more/google" style={styles.navLink}>
        From Google Drive
      </Link>
      <Link href="/(app)/more/shared-with-me" style={styles.navLink}>
        Shared with me
      </Link>
      <Link href="/(app)/more/shares" style={styles.navLink}>
        Link shares
      </Link>
      <Link href="/(app)/more/starred" style={styles.navLink}>
        Starred
      </Link>
      <Link href="/(app)/more/recent" style={styles.navLink}>
        Recent
      </Link>
      <Link href="/(app)/more/trash" style={styles.navLink}>
        Trash
      </Link>
      <Link href="/(app)/more/account" style={styles.navLink}>
        Settings
      </Link>
      {user?.role === "admin" ? (
        <View>
          <Text style={styles.h2}>Admin</Text>
          <Link href="/(app)/more/admin" style={styles.navLink}>
            Overview
          </Link>
          <Link href="/(app)/more/admin-users" style={styles.navLink}>
            Users
          </Link>
          <Link href="/(app)/more/admin-audit" style={styles.navLink}>
            Audit log
          </Link>
        </View>
      ) : null}
      <Pressable
        style={styles.btnGhost}
        onPress={async () => {
          await logout();
          router.replace("/login");
        }}
      >
        <Text style={styles.btnGhostText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}
