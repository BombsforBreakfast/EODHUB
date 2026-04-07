import NewThreadForm from "../components/NewThreadForm";
import RabbitholeShell from "../components/RabbitholeShell";

export default function NewThreadPage() {
  return (
    <RabbitholeShell
      title="Create Rabbithole Thread"
      description="Start a durable thread with topic, optional subtopic, and tags."
    >
      <NewThreadForm />
    </RabbitholeShell>
  );
}
