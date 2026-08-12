import { useState } from "react";
import { View } from "react-native";
import { api, useAction } from "../api";
import { useAuth, type School, type Session } from "../auth";
import { previewBrand } from "../Branded";
import { normaliseCode, normaliseOtp, normalisePhone } from "../input";
import { space } from "../theme";
import { str } from "../strings";
import { Alert, Button, Field, Muted, SchoolLogo, T } from "../ui";
import AuthLayout from "./AuthLayout";
import QrScanner from "./QrScanner";

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
  const [scanning, setScanning] = useState(false);

  const requestOtp = () =>
    void run(async () => {
      const res = await api<{ school: School; devOtp?: string }>("/auth/parent/request-otp", {
        body: { schoolCode, phone },
      });
      setSchoolName(res.school.name);
      // The school's own logo and colour, before the OTP is even typed.
      previewBrand(res.school);
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
          <T role="title">{str.auth.parentTitle}</T>
          <Muted role="body" style={{ marginTop: space(1), marginBottom: space(4.5) }}>
            {str.auth.parentHelp}
          </Muted>

          <View style={{ gap: space(3.5) }}>
            <Alert>{error}</Alert>
            <Field
              label={str.auth.schoolCode}
              placeholder={str.auth.schoolCodePlaceholder}
              value={schoolCode}
              onChangeText={(v) => setSchoolCode(normaliseCode(v))}
              autoCapitalize="characters"
              autoCorrect={false}
              inputStyle={{ letterSpacing: 6, fontWeight: "700", textAlign: "center", fontSize: 20 }}
              maxLength={6}
            />
            <Field
              label={str.auth.mobile}
              placeholder={str.auth.mobileRegistered}
              prefix="+91"
              value={phone}
              onChangeText={(v) => setPhone(normalisePhone(v))}
              keyboardType="number-pad"
              textContentType="telephoneNumber"
              hint={str.auth.mobileHint}
              maxLength={10}
            />
            <Button
              size="lg"
              block
              loading={busy}
              disabled={schoolCode.length < 6 || phone.length < 10}
              onPress={requestOtp}
            >
              {str.auth.sendOtp}
            </Button>

            {/* FRD §16.2 — scanning beats typing six characters off a printed
                circular, which is where mistyped codes come from. */}
            <Button variant="secondary" block onPress={() => setScanning(true)}>
              {str.auth.scanQr}
            </Button>
          </View>
        </>
      ) : (
        <>
          {/* The school's own mark, so a mistyped code is obvious here rather
              than after sign-in. FRD §8.2. */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: space(3), marginBottom: space(3.5) }}>
            <SchoolLogo size={44} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <T role="heading" numberOfLines={2}>
                {schoolName}
              </T>
              <Muted>{str.profile.schoolCode(schoolCode)}</Muted>
            </View>
          </View>

          <T role="title">{str.auth.otpTitle}</T>
          <Muted role="body" style={{ marginTop: space(1), marginBottom: space(4.5) }}>
            {str.auth.otpSentTo(phone)}
          </Muted>

          <View style={{ gap: space(3.5) }}>
            <Alert>{error}</Alert>
            <Field
              label={str.auth.otpLabel}
              value={otp}
              onChangeText={(v) => setOtp(normaliseOtp(v))}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              maxLength={6}
              inputStyle={{ letterSpacing: 10, fontWeight: "700", textAlign: "center", fontSize: 22 }}
            />
            <Button size="lg" block loading={busy} disabled={otp.length < 6} onPress={verify}>
              {str.auth.verify}
            </Button>
            <Button
              variant="ghost"
              block
              onPress={() => {
                setStep("identify");
                setOtp("");
                setError(null);
              }}
            >
              {str.auth.changeNumber}
            </Button>
          </View>
        </>
      )}

      <QrScanner
        open={scanning}
        onClose={() => setScanning(false)}
        onCode={(code) => {
          setSchoolCode(code);
          setError(null);
        }}
      />
    </AuthLayout>
  );
}
