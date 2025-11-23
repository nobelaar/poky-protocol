export enum SubsectionType {
  INFO = "INFO",
  SIMPLE_SELECTION = "SIMPLE_SELECTION",
  MULTIPLE_SELECTION = "MULTIPLE_SELECTION",
}

interface BaseSubsection {
  title: string;
  content: string;
  type: SubsectionType;
}

export interface InfoSubsection extends BaseSubsection {
  type: SubsectionType.INFO;
  answerHash: string;
}

export interface SimpleSelectionSubsection extends BaseSubsection {
  type: SubsectionType.SIMPLE_SELECTION;
  options: string[];
  answerHash: string;
}

export interface MultipleSelectionSubsection extends BaseSubsection {
  type: SubsectionType.MULTIPLE_SELECTION;
  options: string[];
  answersHash: string[];
}

export type Subsection =
  | InfoSubsection
  | SimpleSelectionSubsection
  | MultipleSelectionSubsection;

export interface Section {
  title: string;
  description?: string;
  content?: string;
  subsections: Subsection[];
}
