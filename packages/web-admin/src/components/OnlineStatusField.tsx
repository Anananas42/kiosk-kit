import { type FieldProps, useRecordContext } from "react-admin";

export function OnlineStatusField(_props: FieldProps) {
  const record = useRecordContext<{ online?: boolean }>();
  const online = record?.online ?? false;
  return (
    <span
      style={{
        display: "inline-block",
        width: 10,
        height: 10,
        borderRadius: "50%",
        backgroundColor: online ? "#4caf50" : "#f44336",
      }}
      title={online ? "Online" : "Offline"}
    />
  );
}

OnlineStatusField.defaultProps = { label: "Status" };
