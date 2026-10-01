// Public API of the knowledge-upload feature (SP5 Task 14): add a file or a public page to the knowledge base.
export {
  AddKnowledgeDocumentDialog,
  type AddKnowledgeDocumentDialogProps,
  type KnowledgeUploadTarget,
  type StartedKnowledgeIngestion,
} from "./ui/AddKnowledgeDocumentDialog.tsx";
export type { SendBytes } from "./model/upload-knowledge-file.ts";
