import type { ReactNode } from "react";
import JobReportShell from "./JobReportShell";

export default function JobReportLayout({ children }: { children: ReactNode }) {
  return <JobReportShell>{children}</JobReportShell>;
}
