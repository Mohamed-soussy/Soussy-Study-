import { G, S, simplePack } from "./simple";

/** Pearson Edexcel: International GCSE and International AS/A Level (IAL). */
const ig = S("edxIgcse", ["IGCSE"]);
const ial = S("edxIal", ["AS", "A Level"]);

export const edexcel = simplePack({
  id: "edexcel",
  nameKey: "edexcel",
  years: [
    { id: "edx-y10", labelKey: "y10igcse", grades: [9] },
    { id: "edx-y11", labelKey: "y11igcse", grades: [10] },
    { id: "edx-y12", labelKey: "y12as", grades: [11] },
    { id: "edx-y13", labelKey: "y13a", grades: [12] },
  ],
  groups: G("edxIgcse", "edxIal"),
  subjects: [
    ig("edx-ig-enga", "English Language A"), ig("edx-ig-engb", "English Language B"), ig("edx-ig-englit", "English Literature"), ig("edx-ig-ara", "Arabic"), ig("edx-ig-fre", "French"),
    ig("edx-ig-math", "Mathematics A"), ig("edx-ig-mathb", "Mathematics B"), ig("edx-ig-fpm", "Further Pure Mathematics"),
    ig("edx-ig-bio", "Biology"), ig("edx-ig-chem", "Chemistry"), ig("edx-ig-phys", "Physics"), ig("edx-ig-sci", "Science (Double Award)"),
    ig("edx-ig-cs", "Computer Science"), ig("edx-ig-ict", "ICT"), ig("edx-ig-bus", "Business"), ig("edx-ig-econ", "Economics"), ig("edx-ig-acc", "Accounting"),
    ig("edx-ig-geo", "Geography"), ig("edx-ig-hist", "History"), ig("edx-ig-isl", "Islamic Studies"), ig("edx-ig-art", "Art and Design"),
    ial("edx-al-eng", "English Language"), ial("edx-al-englit", "English Literature"), ial("edx-al-ara", "Arabic"),
    ial("edx-al-math", "Mathematics"), ial("edx-al-fmath", "Further Mathematics"), ial("edx-al-pmath", "Pure Mathematics"),
    ial("edx-al-bio", "Biology"), ial("edx-al-chem", "Chemistry"), ial("edx-al-phys", "Physics"), ial("edx-al-it", "Information Technology"),
    ial("edx-al-bus", "Business"), ial("edx-al-econ", "Economics"), ial("edx-al-acc", "Accounting"), ial("edx-al-psych", "Psychology"),
    ial("edx-al-geo", "Geography"), ial("edx-al-hist", "History"), ial("edx-al-law", "Law"),
  ],
  minSubjects: 1,
  maxSubjects: 14,
  targetGrades: ["A*", "A", "B", "C", "9", "8", "7", "6", "5", "4"],
});
