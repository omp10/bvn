import { useState } from "react";
import { Pressable, View } from "react-native";
import { api, useAction } from "../api";
import { useAuth, type Session } from "../auth";
import { normaliseCode, normaliseOtp, normalisePhone } from "../input";
import { colors } from "../theme";
import { Alert, Button, Field, Muted, T } from "../ui";
import AuthLayout from "./AuthLayout";

/**
 * Parents prove which school they belong to before anything else — the school
 * code is what binds the account to exactly one school's data.
 */
export default function ParentLogin() {
  const { signIn } = useAuth();
  const { busy, error, setError, run } = useAction();

  const [step, setStep] = useState<"identify" | "verify">("identify");
  const [schoolCode, setSchoolCode] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [schoolName, setSchoolName] = useState("");

  const requestOtp = () =>
    void run(async () => {
      const res = await api<{ school: { name: string }; devOtp?: string }>("/auth/parent/request-otp", {
        body: { schoolCode, phone },
      });
      setSchoolName(res.school.name);
      // Development convenience — the real gateway sends this by SMS.
      if (res.devOtp) setOtp(res.devOtp);
      setStep("verify");
    });

  const verify = () =>
    void run(async () => {
      const session = await api<Session>("/auth/parent/verify", { body: { schoolCode, phone, otp } });
      await signIn(session);
    });

  return (
    <AuthLayout>
      {step === "identify" ? (
        <>
          <T size={22} weight="800">Track your child's bus</T>
          <Muted size={13} style={{ marginTop: 4, marginBottom: 18, lineHeight: 18 }}>
            Enter the school code printed on the circular from your school.
          </Muted>

          <View style={{ gap: 14 }}>
            <Alert>{error}</Alert>
            <Field
              label="School code"
              placeholder="ABC123"
              value={schoolCode}
              onChangeText={(v) => setSchoolCode(normaliseCode(v))}
              autoCapitalize="characters"
              autoCorrect={false}
              inputStyle={{ letterSpacing: 6, fontWeight: "700", textAlign: "center", fontSize: 20 }}
              maxLength={6}
            />
            <Field
              label="Mobile number"
              placeholder="The number registered with school"
              value={phone}
              onChangeText={(v) => setPhone(normalisePhone(v))}
              keyboardType="number-pad"
              textContentType="telephoneNumber"
              hint="10 digits — +91 and spaces are fine"
              maxLength={10}
            />
            <Button
              size="lg"
              block
              loading={busy}
              disabled={schoolCode.length < 6 || phone.length < 10}
              onPress={requestOtp}
            >
              Send OTP
            </Button>
          </View>
        </>
      ) : (
        <>
          <T size={22} weight="800">Enter the OTP</T>
          <Muted size={13} style={{ marginTop: 4, marginBottom: 18, lineHeight: 18 }}>
            Sent to {phone} for {schoolName}.
          </Muted>

          <View style={{ gap: 14 }}>
            <Alert>{error}</Alert>
            <Field
              label="6-digit OTP"
              value={otp}
              onChangeText={(v) => setOtp(normaliseOtp(v))}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              maxLength={6}
              inputStyle={{ letterSpacing: 10, fontWeight: "700", textAlign: "center", fontSize: 22 }}
            />
            <Button size="lg" block loading={busy} disabled={otp.length < 6} onPress={verify}>
              Verify and continue
            </Button>
            <Pressable
              onPress={() => {
                setStep("identify");
                setOtp("");
                setError(null);
              }}
              style={{ paddingVertical: 8 }}
            >
              <T size={13} weight="600" color={colors.slate500} style={{ textAlign: "center" }}>
                Change number or school code
              </T>
            </Pressable>
          </View>
        </>
      )}
    </AuthLayout>
  );
}
