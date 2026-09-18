import { TripUnavailable } from "@/components/shell/TripUnavailable";

export default function TripNotFound() {
  return <TripUnavailable message="that trip does not exist. check the link, or start a new chat and huddle will make one." />;
}
