import { useParams } from "react-router";

export function DeviceDetail() {
  const { id } = useParams<{ id: string }>();
  return (
    <div>
      <h2>Device Detail</h2>
      <p>Device ID: {id}</p>
      <p>Detail view coming in a future issue.</p>
    </div>
  );
}
