import { G, S, simplePack } from "./simple";

/** IB Middle Years Programme (MYP 1–5, about grades 6–10): eight subject groups plus the projects. */
const std = S("mypLangLit", ["None"]);
const acq = S("mypLangAcq", ["None"]);
const ind = S("mypIndSoc", ["None"]);
const sci = S("mypSciences", ["None"]);
const art = S("mypArts", ["None"]);
const des = S("mypDesign", ["None"]);

export const ibMyp = simplePack({
  id: "ib-myp",
  nameKey: "ibMyp",
  years: [1, 2, 3, 4, 5].map((n) => ({ id: `myp${n}`, labelKey: `myp${n}`, grades: [n + 5] })),
  groups: G("mypLangLit", "mypLangAcq", "mypIndSoc", "mypSciences", "mypMath", "mypArts", "mypPhe", "mypDesign"),
  subjects: [
    std("myp-eng-ll", "English Language and Literature"), std("myp-ara-ll", "Arabic Language and Literature"), std("myp-fre-ll", "French Language and Literature"),
    acq("myp-eng-acq", "English Language Acquisition"), acq("myp-ara-acq", "Arabic Language Acquisition"), acq("myp-fre-acq", "French Language Acquisition"), acq("myp-spa-acq", "Spanish Language Acquisition"), acq("myp-chi-acq", "Mandarin Language Acquisition"),
    ind("myp-is", "Integrated Humanities"), ind("myp-hist", "History"), ind("myp-geo", "Geography"), ind("myp-econ", "Economics"), ind("myp-islamic", "Islamic Studies"),
    sci("myp-sci", "Integrated Sciences"), sci("myp-bio", "Biology"), sci("myp-chem", "Chemistry"), sci("myp-phys", "Physics"),
    { id: "myp-math", name: "Mathematics", group: "mypMath", levels: ["Standard", "Extended"] },
    art("myp-va", "Visual Arts"), art("myp-music", "Music"), art("myp-drama", "Drama"), art("myp-media", "Media Arts"),
    { id: "myp-phe", name: "Physical and Health Education", group: "mypPhe", levels: ["None"] },
    des("myp-digital", "Digital Design"), des("myp-product", "Product Design"),
  ],
  minSubjects: 1,
  maxSubjects: 14,
  targetGrades: ["7", "6", "5", "4", "3"],
  core: ["Personal Project", "Community Project", "Service as Action"],
});
