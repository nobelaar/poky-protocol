import { Section } from "./section.js";

export default interface ModuleInterface {
  title: string;
  description: string;
  image?: string;
  sections: Section[];
}
