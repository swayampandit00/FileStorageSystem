import { DriveExplorer } from "../../components/DriveExplorer";

export function TrashView() {
  return (
    <DriveExplorer
      mode="trash"
      title="Trash"
      subtitle="Restore or delete forever. Bytes leave disk only on permanent delete."
    />
  );
}
