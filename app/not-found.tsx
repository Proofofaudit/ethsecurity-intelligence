import { NotFoundNotice } from "@/components/ui/states";

export default function NotFound() {
  return <NotFoundNotice title="This page does not exist" body="The address may be mistyped, or the page may not be published yet. Use search (Command or Control + K) to find an initiative, organization or claim." />;
}
