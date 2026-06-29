import { Suspense } from "react";
import EmployerDocumentViewer from "./EmployerDocumentViewer";

export const metadata = {
  title: "View document · Employer Dashboard · EOD HUB",
};

export default function EmployerDocumentPage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", background: "#111", color: "#f3f4f6" }}>
          Loading document…
        </div>
      }
    >
      <EmployerDocumentViewer />
    </Suspense>
  );
}
