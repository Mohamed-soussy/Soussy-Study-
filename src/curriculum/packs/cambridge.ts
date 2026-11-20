import { G, S, simplePack } from "./simple";

/** Cambridge International: IGCSE (Core/Extended) and AS & A Level. */
const ig = S("camIgcse", ["Core", "Extended"]);
const al = S("camAlevel", ["AS", "A Level"]);

export const cambridge = simplePack({
  id: "cambridge",
  nameKey: "cambridge",
  years: [
    { id: "cam-y9", labelKey: "y9", grades: [8] },
    { id: "cam-y10", labelKey: "y10igcse", grades: [9] },
    { id: "cam-y11", labelKey: "y11igcse", grades: [10] },
    { id: "cam-y12", labelKey: "y12as", grades: [11] },
    { id: "cam-y13", labelKey: "y13a", grades: [12] },
  ],
  groups: G("camIgcse", "camAlevel"),
  subjects: [
    ig("cam-ig-eng1", "English (First Language)"), ig("cam-ig-esl", "English as a Second Language"), ig("cam-ig-englit", "English Literature"),
    ig("cam-ig-ara1", "Arabic (First Language)"), ig("cam-ig-araf", "Arabic (Foreign Language)"), ig("cam-ig-fre", "French"), ig("cam-ig-spa", "Spanish"),
    ig("cam-ig-math", "Mathematics"), ig("cam-ig-addmath", "Additional Mathematics"), ig("cam-ig-intmath", "International Mathematics"),
    ig("cam-ig-bio", "Biology"), ig("cam-ig-chem", "Chemistry"), ig("cam-ig-phys", "Physics"), ig("cam-ig-cosci", "Co-ordinated Sciences"), ig("cam-ig-comsci", "Combined Science"),
    ig("cam-ig-cs", "Computer Science"), ig("cam-ig-ict", "ICT"), ig("cam-ig-bus", "Business Studies"), ig("cam-ig-econ", "Economics"), ig("cam-ig-acc", "Accounting"),
    ig("cam-ig-geo", "Geography"), ig("cam-ig-hist", "History"), ig("cam-ig-gp", "Global Perspectives"), ig("cam-ig-isl", "Islamiyat"), ig("cam-ig-env", "Environmental Management"),
    ig("cam-ig-art", "Art & Design"), ig("cam-ig-music", "Music"), ig("cam-ig-pe", "Physical Education"), ig("cam-ig-sociology", "Sociology"), ig("cam-ig-travel", "Travel & Tourism"),
    al("cam-al-eng", "English Language"), al("cam-al-englit", "English Literature"), al("cam-al-ara", "Arabic"), al("cam-al-fre", "French"),
    al("cam-al-math", "Mathematics"), al("cam-al-fmath", "Further Mathematics"), al("cam-al-bio", "Biology"), al("cam-al-chem", "Chemistry"), al("cam-al-phys", "Physics"),
    al("cam-al-cs", "Computer Science"), al("cam-al-it", "Information Technology"), al("cam-al-bus", "Business"), al("cam-al-econ", "Economics"), al("cam-al-acc", "Accounting"),
    al("cam-al-psych", "Psychology"), al("cam-al-soc", "Sociology"), al("cam-al-geo", "Geography"), al("cam-al-hist", "History"), al("cam-al-law", "Law"),
    al("cam-al-media", "Media Studies"), al("cam-al-art", "Art & Design"), al("cam-al-gp", "Global Perspectives & Research"), al("cam-al-think", "Thinking Skills"), al("cam-al-env", "Environmental Management"),
  ],
  minSubjects: 1,
  maxSubjects: 14,
  targetGrades: ["A*", "A", "B", "C", "D", "E"],
});
