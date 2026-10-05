import { usePatientData } from "../../demo/PatientContext";
import { ConversationPanel } from "../../demo/ConversationPanel";
export function MessagesSection() {
  const { patientId } = usePatientData();
  return (
    <ConversationPanel key={patientId} patientId={patientId} sender="patient" />
  );
}
