/**
 * Syllabus structure: unit (and some topic) names in official order, used to
 * auto-create Study Hub folders (Subject → Unit → Topic, section 6.1) and to help
 * the AI tag files. Names only: no syllabus text is copied (section 3A).
 * Keyed by "<pack id>:<subject id>".
 */
export interface UnitDef {
  name: string;
  topics?: string[];
}

export const UNITS: Record<string, UnitDef[]> = {
  "ib-dp:phys": [
    { name: "Theme A: Space, time and motion", topics: ["A.1 Kinematics", "A.2 Forces and momentum", "A.3 Work, energy and power", "A.4 Rigid body mechanics", "A.5 Galilean and special relativity"] },
    { name: "Theme B: The particulate nature of matter", topics: ["B.1 Thermal energy transfers", "B.2 Greenhouse effect", "B.3 Gas laws", "B.4 Thermodynamics", "B.5 Current and circuits"] },
    { name: "Theme C: Wave behaviour", topics: ["C.1 Simple harmonic motion", "C.2 Wave model", "C.3 Wave phenomena", "C.4 Standing waves and resonance", "C.5 Doppler effect"] },
    { name: "Theme D: Fields", topics: ["D.1 Gravitational fields", "D.2 Electric and magnetic fields", "D.3 Motion in electromagnetic fields", "D.4 Induction"] },
    { name: "Theme E: Nuclear and quantum physics", topics: ["E.1 Structure of the atom", "E.2 Quantum physics", "E.3 Radioactive decay", "E.4 Fission", "E.5 Fusion and stars"] },
  ],
  "ib-dp:chem": [
    { name: "Structure 1: Models of the particulate nature of matter" },
    { name: "Structure 2: Models of bonding and structure" },
    { name: "Structure 3: Classification of matter" },
    { name: "Reactivity 1: What drives chemical reactions?" },
    { name: "Reactivity 2: How much, how fast and how far?" },
    { name: "Reactivity 3: What are the mechanisms of chemical change?" },
  ],
  "ib-dp:bio": [
    { name: "Theme A: Unity and diversity" },
    { name: "Theme B: Form and function" },
    { name: "Theme C: Interaction and interdependence" },
    { name: "Theme D: Continuity and change" },
  ],
  "ib-dp:math-aa": [
    { name: "Topic 1: Number and algebra" },
    { name: "Topic 2: Functions" },
    { name: "Topic 3: Geometry and trigonometry" },
    { name: "Topic 4: Statistics and probability" },
    { name: "Topic 5: Calculus" },
  ],
  "ib-dp:math-ai": [
    { name: "Topic 1: Number and algebra" },
    { name: "Topic 2: Functions" },
    { name: "Topic 3: Geometry and trigonometry" },
    { name: "Topic 4: Statistics and probability" },
    { name: "Topic 5: Calculus" },
  ],
  "ib-dp:econ": [
    { name: "Unit 1: Introduction to economics" },
    { name: "Unit 2: Microeconomics" },
    { name: "Unit 3: Macroeconomics" },
    { name: "Unit 4: The global economy" },
  ],
  "ib-dp:bm": [
    { name: "Unit 1: Introduction to business management" },
    { name: "Unit 2: Human resource management" },
    { name: "Unit 3: Finance and accounts" },
    { name: "Unit 4: Marketing" },
    { name: "Unit 5: Operations management" },
  ],
  "ib-dp:psych": [
    { name: "Biological approach" },
    { name: "Cognitive approach" },
    { name: "Sociocultural approach" },
    { name: "Research methods" },
  ],
  "ib-dp:cs": [
    { name: "Theme A: Concepts of computer science" },
    { name: "Theme B: Computational thinking and problem-solving" },
  ],
  "ib-dp:eng-a-langlit": [
    { name: "Readers, writers and texts" },
    { name: "Time and space" },
    { name: "Intertextuality: connecting texts" },
  ],
  "ib-dp:eng-a-lit": [
    { name: "Readers, writers and texts" },
    { name: "Time and space" },
    { name: "Intertextuality: connecting texts" },
  ],
  "ib-dp:ara-a-langlit": [
    { name: "Readers, writers and texts" },
    { name: "Time and space" },
    { name: "Intertextuality: connecting texts" },
  ],
  "ib-dp:ara-a-lit": [
    { name: "Readers, writers and texts" },
    { name: "Time and space" },
    { name: "Intertextuality: connecting texts" },
  ],
  "ib-dp:eng-b": [
    { name: "Identities" },
    { name: "Experiences" },
    { name: "Human ingenuity" },
    { name: "Social organization" },
    { name: "Sharing the planet" },
  ],
  "american-hs:ap-calc-ab": [
    { name: "Unit 1: Limits and continuity" },
    { name: "Unit 2: Differentiation: definition and fundamental properties" },
    { name: "Unit 3: Differentiation: composite, implicit and inverse functions" },
    { name: "Unit 4: Contextual applications of differentiation" },
    { name: "Unit 5: Analytical applications of differentiation" },
    { name: "Unit 6: Integration and accumulation of change" },
    { name: "Unit 7: Differential equations" },
    { name: "Unit 8: Applications of integration" },
  ],
  "american-hs:ap-calc-bc": [
    { name: "Unit 1: Limits and continuity" },
    { name: "Unit 2: Differentiation: definition and fundamental properties" },
    { name: "Unit 3: Differentiation: composite, implicit and inverse functions" },
    { name: "Unit 4: Contextual applications of differentiation" },
    { name: "Unit 5: Analytical applications of differentiation" },
    { name: "Unit 6: Integration and accumulation of change" },
    { name: "Unit 7: Differential equations" },
    { name: "Unit 8: Applications of integration" },
    { name: "Unit 9: Parametric equations, polar coordinates and vector-valued functions" },
    { name: "Unit 10: Infinite sequences and series" },
  ],
  "american-hs:ap-phys-1": [
    { name: "Unit 1: Kinematics" },
    { name: "Unit 2: Force and translational dynamics" },
    { name: "Unit 3: Work, energy and power" },
    { name: "Unit 4: Linear momentum" },
    { name: "Unit 5: Torque and rotational dynamics" },
    { name: "Unit 6: Energy and momentum of rotating systems" },
    { name: "Unit 7: Oscillations" },
    { name: "Unit 8: Fluids" },
  ],
  "american-hs:chem": [
    { name: "Atomic structure" },
    { name: "Bonding" },
    { name: "Stoichiometry" },
    { name: "Reactions" },
    { name: "Gases" },
    { name: "Solutions, acids and bases" },
  ],
  "american-hs:bio": [
    { name: "Cells" },
    { name: "Genetics" },
    { name: "Evolution" },
    { name: "Ecology" },
    { name: "Human body systems" },
  ],
};

export function unitsFor(packId: string | undefined, subjectId: string): UnitDef[] {
  return (packId && UNITS[`${packId}:${subjectId}`]) || [];
}
