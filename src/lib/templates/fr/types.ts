export interface LegalTemplateField {
  name: string;
  fieldType: "signature" | "initials" | "date" | "text" | "checkbox";
  pageNumber: number;
  required: boolean;
  label: string;
}

export interface LegalTemplateDefinition {
  libraryKey: string;
  name: string;
  description: string;
  category: string;
  folder: string;
  pages: number;
  locale: string;
  jurisdiction: string;
  version: string;
  sourceNotes: string;
  fields: LegalTemplateField[];
  bodyMarkdown: string;
}
