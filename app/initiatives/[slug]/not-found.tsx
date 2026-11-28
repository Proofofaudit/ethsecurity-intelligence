import { NotFoundNotice } from "@/components/ui/states";

export default function NotFound() {
  return <NotFoundNotice title="No initiative with this address" body="Only the initiatives in the frozen ballot cohort have dossiers. The link may be outdated if the official slug changed." />;
}
