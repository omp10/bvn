import { str } from "../strings";
import Roster from "./Roster";

/**
 * The attendant's roster. Marking is one tap per child, and tapping twice is
 * harmless — the server collapses a repeat onto the original record.
 *
 * Bulk marking and the emergency button live here rather than on the driver's
 * copy: an attendant works a queue at a stop with both hands, and has no Trip
 * screen to keep an SOS on.
 */
export default function AttendantRoster() {
  return (
    <Roster
      endpoint="/staff/attendance/roster"
      bulk
      emergency
      noTripHint={str.roster.noTripStaffHint}
    />
  );
}
