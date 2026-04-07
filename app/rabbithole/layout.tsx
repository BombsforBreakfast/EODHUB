import NavBar from "../components/NavBar";

export default function RabbitholeLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NavBar />
      {children}
    </>
  );
}
