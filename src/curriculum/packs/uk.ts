import { G, S, simplePack } from "./simple";

/** UK national curriculum: GCSE (Foundation/Higher where tiered), A Level and BTEC. */
const gc = S("ukGcse", ["GCSE"]);
const gt = S("ukGcse", ["Foundation", "Higher"]);
const al = S("ukAlevel", ["AS", "A Level"]);
const bt = S("ukBtec", ["BTEC"]);

export const ukNational = simplePack({
  id: "uk",
  nameKey: "uk",
  years: [
    { id: "uk-y9", labelKey: "y9", grades: [8] },
    { id: "uk-y10", labelKey: "y10", grades: [9] },
    { id: "uk-y11", labelKey: "y11", grades: [10] },
    { id: "uk-y12", labelKey: "y12", grades: [11] },
    { id: "uk-y13", labelKey: "y13", grades: [12] },
  ],
  groups: G("ukGcse", "ukAlevel", "ukBtec"),
  subjects: [
    gc("uk-gc-englang", "English Language"), gc("uk-gc-englit", "English Literature"), gt("uk-gc-math", "Mathematics"), gt("uk-gc-comsci", "Combined Science"),
    gt("uk-gc-bio", "Biology"), gt("uk-gc-chem", "Chemistry"), gt("uk-gc-phys", "Physics"), gc("uk-gc-cs", "Computer Science"),
    gc("uk-gc-geo", "Geography"), gc("uk-gc-hist", "History"), gc("uk-gc-rs", "Religious Studies"), gt("uk-gc-fre", "French"), gt("uk-gc-spa", "Spanish"), gc("uk-gc-ara", "Arabic"),
    gc("uk-gc-bus", "Business"), gc("uk-gc-econ", "Economics"), gc("uk-gc-art", "Art and Design"), gc("uk-gc-music", "Music"), gc("uk-gc-drama", "Drama"), gc("uk-gc-pe", "Physical Education"), gc("uk-gc-dt", "Design and Technology"),
    al("uk-al-englang", "English Language"), al("uk-al-englit", "English Literature"), al("uk-al-math", "Mathematics"), al("uk-al-fmath", "Further Mathematics"),
    al("uk-al-bio", "Biology"), al("uk-al-chem", "Chemistry"), al("uk-al-phys", "Physics"), al("uk-al-cs", "Computer Science"), al("uk-al-psych", "Psychology"),
    al("uk-al-soc", "Sociology"), al("uk-al-econ", "Economics"), al("uk-al-bus", "Business"), al("uk-al-geo", "Geography"), al("uk-al-hist", "History"),
    al("uk-al-pol", "Politics"), al("uk-al-law", "Law"), al("uk-al-rs", "Religious Studies"), al("uk-al-art", "Art and Design"),
    bt("uk-bt-bus", "BTEC Business"), bt("uk-bt-sci", "BTEC Applied Science"), bt("uk-bt-it", "BTEC Information Technology"), bt("uk-bt-sport", "BTEC Sport"), bt("uk-bt-eng", "BTEC Engineering"),
  ],
  minSubjects: 1,
  maxSubjects: 14,
  targetGrades: ["9", "8", "7", "6", "5", "4", "A*", "A", "B", "C", "D*", "D", "M"],
});
