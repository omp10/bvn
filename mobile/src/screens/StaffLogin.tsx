import { useState } from "react";
import { View } from "react-native";
import { api, useAction } from "../api";
import { useAuth, type Session } from "../auth";
import { normalisePhone } from "../input";
import { Alert, Button, Field, Muted, T } from "../ui";
import AuthLayout from "./AuthLayout";

/**
 * Drivers and attendants sign in with the mobile number and password the school
 * office issued them. No self-registration here — an account on a bus is created
 * by the school, never claimed.
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
      <T size={22} weight="800">Sign in</T>
      <Muted size={13} style={{ marginTop: 4, marginBottom: 18, lineHeight: 18 }}>
        Use the mobile number and password your school gave you.
      </Muted>

      <View style={{ gap: 14 }}>
        <Alert>{error}</Alert>
        <Field
          label="Mobile number"
          placeholder="10 digits"
          value={phone}
          onChangeText={(v) => setPhone(normalisePhone(v))}
          keyboardType="number-pad"
          textContentType="telephoneNumber"
          maxLength={10}
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
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
          Sign in
        </Button>
        <Muted style={{ textAlign: "center", lineHeight: 17 }}>
          Forgotten your password? Ask the school office to reset it.
        </Muted>
      </View>
    </AuthLayout>
  );
}
