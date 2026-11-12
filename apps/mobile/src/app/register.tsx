import { Link, router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useAuth } from "../auth/AuthContext";
import { colors, styles } from "../theme";

export default function Register() {
  const { register } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setBusy(true);
    setError(null);
    try {
      await register(email.trim(), password, displayName.trim());
      router.replace("/(app)");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.center}>
      <View style={styles.authCard}>
        <Text style={styles.h1}>Create account</Text>
        <Text style={styles.muted}>Password needs 10+ characters, upper, lower, and a number.</Text>
        <Text style={styles.muted}>Display name</Text>
        <TextInput
          style={styles.input}
          placeholder="Display name"
          placeholderTextColor={colors.muted}
          value={displayName}
          onChangeText={setDisplayName}
        />
        <Text style={styles.muted}>Email</Text>
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <Text style={styles.muted}>Password</Text>
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={colors.muted}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={styles.btn} onPress={onSubmit} disabled={busy}>
          <Text style={styles.btnText}>{busy ? "Creating..." : "Register"}</Text>
        </Pressable>
        <Link href="/login">
          <Text style={styles.muted}>Already registered? Sign in</Text>
        </Link>
      </View>
    </View>
  );
}
