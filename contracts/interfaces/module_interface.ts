import SectionInterface from "./section_interface";

export default interface ModuleInterface {
	title: string;
    description: string;
    image?: string;
    sections: SectionInterface[];
}