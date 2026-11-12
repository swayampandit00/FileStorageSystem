import { DriveList } from "../../../components/DriveList";

export default function Trash() {
  return (
    <DriveList
      mode="trash"
      title="Trash"
      subtitle="Restore or delete forever. Bytes leave disk only on permanent delete."
    />
  );
}
