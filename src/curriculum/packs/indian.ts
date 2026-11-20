import { G, S, simplePack } from "./simple";

/** Indian boards: CBSE (Class 9–12), ICSE (Class 9–10) and ISC (Class 11–12). */
const lang = S("inLanguages", ["None"]);
const sci = S("inScience", ["None"]);
const com = S("inCommerce", ["None"]);
const hum = S("inHumanities", ["None"]);

export const indianBoards = simplePack({
  id: "indian",
  nameKey: "indian",
  years: [9, 10, 11, 12].map((n) => ({ id: `in-c${n}`, labelKey: `class${n}`, grades: [n] })),
  groups: G("inLanguages", "inScience", "inCommerce", "inHumanities"),
  subjects: [
    lang("in-eng", "English"), lang("in-eng-core", "English Core"), lang("in-hindi", "Hindi"), lang("in-sanskrit", "Sanskrit"), lang("in-urdu", "Urdu"), lang("in-arabic", "Arabic"), lang("in-malayalam", "Malayalam"), lang("in-tamil", "Tamil"), lang("in-french", "French"),
    sci("in-math", "Mathematics"), sci("in-appmath", "Applied Mathematics"), sci("in-phys", "Physics"), sci("in-chem", "Chemistry"), sci("in-bio", "Biology"), sci("in-sci", "Science"),
    sci("in-cs", "Computer Science"), sci("in-ip", "Informatics Practices"), sci("in-pe", "Physical Education"),
    com("in-acc", "Accountancy"), com("in-bst", "Business Studies"), com("in-econ", "Economics"), com("in-entre", "Entrepreneurship"),
    hum("in-hist", "History"), hum("in-geo", "Geography"), hum("in-pol", "Political Science"), hum("in-psych", "Psychology"), hum("in-soc", "Sociology"), hum("in-social", "Social Science"),
  ],
  minSubjects: 1,
  maxSubjects: 12,
  targetGrades: ["95%", "90%", "85%", "80%", "75%"],
});
