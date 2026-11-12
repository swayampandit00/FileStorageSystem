import { Link } from "expo-router";
import { Text, View } from "react-native";
import { styles } from "../theme";

export default function Welcome() {
  return (
    <View style={styles.center}>
      <View style={styles.authCard}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark} />
          <View>
            <Text style={styles.brand}>MyCloud</Text>
            <Text style={styles.brandSub}>Self-hosted Drive</Text>
          </View>
        </View>
        <Text style={styles.h1}>Your files. Your disk.</Text>
        <Text style={styles.muted}>
          Grid and list views, preview, trash, stars, people sharing, and public links — with every byte stored on this
          server, not a third-party object store.
        </Text>
        <Text style={styles.muted}>Upload, folders, move, copy, search</Text>
        <Text style={styles.muted}>Import selected files or folders from Google Drive</Text>
        <Text style={styles.muted}>Trash with restore · starred · recents</Text>
        <Link href="/login" style={styles.btn}>
          <Text style={styles.btnText}>Sign in</Text>
        </Link>
        <Link href="/register" style={styles.btnGhost}>
          <Text style={styles.btnGhostText}>Create account</Text>
        </Link>
      </View>
    </View>
  );
}
