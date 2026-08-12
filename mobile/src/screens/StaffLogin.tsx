import { useState } from "react";
import { View } from "react-native";
import { api, useAction } from "../api";
import { useAuth, type Session } from "../auth";
import { normalisePhone } from "../input";
import { space } from "../theme";
import { str } from "../strings";
import { Alert, Button, Field, Muted, T } from "../ui";
import AuthLayout from "./AuthLayout";

/**
 * Everyone who signs in with a password — the same audience as the web
 * `/login`. No self-registration here: an account on a bus is created by the
 * school office, never claimed.
 */
export default function StaffLogin() {
  const { signIn } = useAuth();
  const { busy, error, run } = useAction();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  const submit = () =>
    void run(async () => {
      const session = await api<Session>("/auth/login", { body: { phone, password } });
      await signIn(session);
    });

  return (
    <AuthLayout>
      <T role="title">{str.auth.staffTitle}</T>
      <Muted role="body" style={{ marginTop: space(1), marginBottom: space(4.5) }}>
        {str.auth.staffHelp}
      </Muted>

      <View style={{ gap: space(3.5) }}>
        <Alert>{error}</Alert>
        <Field
          label={str.auth.mobile}
          placeholder={str.auth.mobileHint}
          prefix="+91"
          value={phone}
          onChangeText={(v) => setPhone(normalisePhone(v))}
          keyboardType="number-pad"
          textContentType="telephoneNumber"
          maxLength={10}
        />
        <Field
          label={str.auth.password}
          value={password}
          onChangeText={setPassword}
          reveal
          textContentType="password"
          onSubmitEditing={submit}
          returnKeyType="go"
        />
        <Button
          size="lg"
          block
          loading={busy}
          disabled={phone.length < 10 || !password}
          onPress={submit}
        >
          {str.auth.signIn}
        </Button>
        <Muted role="label" weight="400" style={{ textAlign: "center" }}>
          {str.auth.forgotten}
        </Muted>
      </View>
    </AuthLayout>
  );
}
