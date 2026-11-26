import { NotFoundNotice } from "@/components/ui/states";

export default function NotFound() {
  return <NotFoundNotice title="Entity not found" body="This organization, repository, contributor, standard or product is not in the published dataset." />;
}
