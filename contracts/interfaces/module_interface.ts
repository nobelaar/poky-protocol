import SectionInterface from "./section_interface.js";

export default interface ModuleInterface {
	title: string;
    description: string;
    image?: string;
    sections: SectionInterface[];
}