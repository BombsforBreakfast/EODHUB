import MasterShell from "../components/master/MasterShell";

export default function SidebarLayout({ children }: { children: React.ReactNode }) {
  return <MasterShell>{children}</MasterShell>;
}
