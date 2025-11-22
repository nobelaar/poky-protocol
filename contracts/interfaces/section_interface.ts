import SubSectionInterface from "./subsection_interface";

export default interface SectionInterface {
	content: string;
    subsections: SubSectionInterface[];
}