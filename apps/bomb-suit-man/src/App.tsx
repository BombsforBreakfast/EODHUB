import { BsmGamePage } from "@bsm/BsmGamePage";
import { useAuth } from "@bsm/context/AuthProvider";

export default function App() {
  const { isLoading } = useAuth();

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "#090612",
          color: "#a0a0a0",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        Loading…
      </div>
    );
  }

  return <BsmGamePage />;
}
