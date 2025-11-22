enum SubSectionType {
    INFO,
    MULTIPLE_SELECTION
}

export default interface SubSectionInterface {
	content: string;
    options?: string[];
    type: SubSectionType;
}