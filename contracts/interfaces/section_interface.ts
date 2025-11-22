import SubSectionInterface from "./subsection_interface.js";

export default interface SectionInterface {
	content: string;
    subsections: SubSectionInterface[];
}