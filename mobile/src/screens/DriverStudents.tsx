import { str } from "../strings";
import Roster from "./Roster";

/**
 * The driver's roster.
 *
 * The attendance API has always accepted the trip's driver as well as its
 * attendant — plenty of buses run without an attendant — but there was no screen
 * for it, so a driver could see a student *count* and nothing behind it.
 *
 * No bulk marking here: a driver marking sixty children is a driver not
 * driving. That belongs to the attendant, who has both hands free.
 */
export default function DriverStudents() {
  return <Roster endpoint="/driver/students" noTripHint={str.roster.noTripDriverHint} />;
}
