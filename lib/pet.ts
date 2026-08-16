// How a species is shown, in one place. The pending list, the customer list and
// the appointment table all print it, and a 🐶 hard-coded into each of them is
// exactly how a cat ends up labelled as a dog on one screen and not another.
import type { PetSpecies } from "@prisma/client";

export const petIcon = (species: PetSpecies) => (species === "CAT" ? "🐱" : "🐶");

export const petNoun = (species: PetSpecies) => (species === "CAT" ? "cat" : "dog");
