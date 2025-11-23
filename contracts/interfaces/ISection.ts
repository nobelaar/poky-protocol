


enum SubsectionType {
    INFO,
    SIMPLE_SELECTION,
    MULTIPLE_SELECTION,
    
}

export default interface Subsection {
    title: string;
    type: SubsectionType;
    content: string;
}
export default interface Section {
    title: string;
    description: string;
    subsections: Subsection[];
}

interface SimpleSelectionSubsection extends Subsection {
    options: string[];
}
interface MultipleSelectionSubsection extends Subsection {
    options: string[];
}    