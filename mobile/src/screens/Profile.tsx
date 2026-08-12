import { useState } from "react";
import { Linking, View } from "react-native";
import Constants from "expo-constants";
import { useNavigation } from "@react-navigation/native";
import { api, useAction, useQuery } from "../api";
import { ROLE_LABEL, useAuth } from "../auth";
import { colors, space, tone, VARIANT } from "../theme";
import { useBrand } from "../brand";
import { str } from "../strings";
import {
  Alert, Avatar, Button, Card, Confirm, Divider, Field, IconChip, ListRow, Modal, Muted, Screen,
  SchoolLogo, SectionHeader, T,
} from "../ui";
import {
  IconBus, IconCheck, IconHistory, IconPhone, IconSchool, IconShield,
} from "../icons";

/**
 * Account screen.
 *
 * Signing out lives here rather than in the header: on a moving bus the header
 * is exactly where a thumb lands, and a driver mid-trip logging out by accident
 * stops the school seeing the bus.
 *
 * It is also where the destinations that lost their tab went. History is a
 * "what happened last week" question, not a mid-shift one, and the battery
 * exemption is a thing a driver is sent back to weeks after onboarding — both
 * belong somewhere findable rather than somewhere permanent.
 */
export default function Profile() {
  const navigation = useNavigation<any>();
  const { user, school, signOut } = useAuth();
  const { appName, primary, tint } = useBrand();
  const [changing, setChanging] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);

  /* Only parents have this endpoint — it is on the parent router. Gating the
     path to null means staff simply never make the request rather than
     collecting a 403 on every visit to their own account screen. */
  const contacts = useQuery<any>(user?.role === "parent" ? "/parent/emergency-contacts" : null);

  if (!user) return null;

  const isDriver = user.role === "driver";
  const office = contacts.data?.transportOffice?.phone ?? contacts.data?.school?.phone ?? null;
  // 112 is India's single emergency number, so it is a genuine constant rather
  // than a setting — but the school may still name its own, so the endpoint
  // wins when it answers.
  const helpline = contacts.data?.helpline ?? str.profile.defaultHelpline;

  return (
    <Screen>
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space(4) }}>
          <Avatar name={user.name} photoUrl={user.photoUrl} size={64} />
          <View style={{ flex: 1, minWidth: 0, gap: space(1) }}>
            <T role="title" size={20} numberOfLines={1}>
              {user.name}
            </T>
            <View style={{ flexDirection: "row" }}>
              <View
                style={{
                  backgroundColor: tint,
                  paddingHorizontal: space(2.5),
                  paddingVertical: space(1),
                  borderRadius: 999,
                }}
              >
                <T role="caption" weight="700" color={primary}>
                  {ROLE_LABEL[user.role]}
                </T>
              </View>
            </View>
            <Muted role="label" weight="400">
              {user.phone}
            </Muted>
          </View>
        </View>
      </Card>

      {!!school && (
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space(3) }}>
            <SchoolLogo size={40} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <T role="body" weight="700" numberOfLines={1}>
                {school.name}
              </T>
              <Muted>{str.profile.schoolCode(school.code)}</Muted>
            </View>
          </View>
        </Card>
      )}

      <SectionHeader>{str.profile.account}</SectionHeader>

      <Card padded={false}>
        {isDriver && (
          <>
            <ListRow
              icon={
                <IconChip bg={colors.brand50}>
                  <IconHistory size={18} color={colors.brand600} />
                </IconChip>
              }
              title={str.profile.myTrips}
              subtitle={str.profile.myTripsHint}
              onPress={() => navigation.navigate("TripHistory")}
            />
            <Divider />
          </>
        )}

        {/* Parents have no password — they sign in with an OTP every time. */}
        {VARIANT === "staff" && (
          <>
            <ListRow
              icon={
                <IconChip bg={colors.brand50}>
                  <IconShield size={18} color={colors.brand600} />
                </IconChip>
              }
              title={str.profile.changePassword}
              onPress={() => setChanging(true)}
            />
            <Divider />
          </>
        )}

        {/* Drivers change and phones get replaced. The walkthrough that was
            shown once at install has to be reachable forever after. */}
        <ListRow
          icon={
            <IconChip bg={colors.leaf50}>
              <IconCheck size={18} color={tone.success} />
            </IconChip>
          }
          title={str.profile.howItWorks}
          subtitle={str.profile.howItWorksHint}
          onPress={() => navigation.navigate("Onboarding")}
        />

        {isDriver && (
          <>
            <Divider />
            <ListRow
              icon={
                <IconChip bg={colors.amber50}>
                  <IconBus size={18} color={colors.amber600} />
                </IconChip>
              }
              title={str.profile.batterySettings}
              subtitle={str.profile.batteryHint}
              onPress={() => void Linking.openSettings()}
            />
          </>
        )}

        {/* The school office, when we have a number for it. Parents get it from
            their own contacts endpoint; staff already know where the office is. */}
        {!!office && (
          <>
            <Divider />
            <ListRow
              icon={
                <IconChip bg={colors.brand50}>
                  <IconSchool size={18} color={colors.brand600} />
                </IconChip>
              }
              title={str.profile.schoolOffice}
              value={office}
              onPress={() => void Linking.openURL(`tel:${office}`)}
            />
          </>
        )}

        <Divider />
        <ListRow
          icon={
            <IconChip bg={colors.red50}>
              <IconPhone size={18} color={tone.danger} />
            </IconChip>
          }
          title={str.profile.helpline}
          value={helpline}
          onPress={() => void Linking.openURL(`tel:${helpline}`)}
        />
      </Card>

      <Button variant="dangerOutline" block onPress={() => setConfirmOut(true)}>
        {str.common.signOut}
      </Button>

      <View style={{ alignItems: "center", gap: 2, paddingTop: space(1) }}>
        <Muted>
          {appName} · {str.common.appTagline}
        </Muted>
        <Muted>{str.profile.version(Constants.expoConfig?.version ?? "1.0.0")}</Muted>
      </View>

      <ChangePassword open={changing} onClose={() => setChanging(false)} />

      <Confirm
        open={confirmOut}
        onClose={() => setConfirmOut(false)}
        onConfirm={signOut}
        title={str.profile.signOutTitle}
        confirmLabel={str.common.signOut}
        body={
          isDriver
            ? str.profile.signOutDriver
            : user.role === "parent"
              ? str.profile.signOutParent
              : str.profile.signOutStaff
        }
      />
    </Screen>
  );
}

function ChangePassword({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { busy, error, run } = useAction();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [done, setDone] = useState(false);

  const close = () => {
    setDone(false);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={str.profile.changePassword}
      footer={
        done ? (
          <Button onPress={close}>{str.common.close}</Button>
        ) : (
          <>
            <Button variant="secondary" onPress={onClose}>
              {str.common.cancel}
            </Button>
            <Button
              loading={busy}
              disabled={!current || next.length < 6}
              onPress={() =>
                void run(
                  () => api("/auth/change-password", { body: { currentPassword: current, newPassword: next } }),
                  () => {
                    setCurrent("");
                    setNext("");
                    setDone(true);
                  }
                )
              }
            >
              {str.profile.change}
            </Button>
          </>
        )
      }
    >
      {done ? (
        <T role="body" color={tone.textSecondary} style={{ paddingVertical: space(1) }}>
          {str.profile.passwordChanged}
        </T>
      ) : (
        <View style={{ gap: space(3.5) }}>
          <Alert>{error}</Alert>
          <Field
            label={str.profile.currentPassword}
            value={current}
            onChangeText={setCurrent}
            secureTextEntry
          />
          <Field
            label={str.profile.newPassword}
            hint={str.profile.newPasswordHint}
            value={next}
            onChangeText={setNext}
            secureTextEntry
          />
        </View>
      )}
    </Modal>
  );
}
