import { G, S, simplePack } from "./simple";

/** French Baccalauréat (lycée): tronc commun, spécialités and options. */
const tc = S("frCommon", ["None"]);
const sp = S("frSpecialty", ["None"]);
const op = S("frOptions", ["None"]);

export const frenchBac = simplePack({
  id: "french",
  nameKey: "french",
  years: [
    { id: "fr-3e", labelKey: "fr3e", grades: [9] },
    { id: "fr-2nde", labelKey: "fr2nde", grades: [10] },
    { id: "fr-1ere", labelKey: "fr1ere", grades: [11] },
    { id: "fr-tle", labelKey: "frTle", grades: [12] },
  ],
  groups: G("frCommon", "frSpecialty", "frOptions"),
  subjects: [
    tc("fr-francais", "Français"), tc("fr-philo", "Philosophie"), tc("fr-hg", "Histoire-Géographie"), tc("fr-emc", "Enseignement moral et civique"),
    tc("fr-lva", "Langue vivante A"), tc("fr-lvb", "Langue vivante B"), tc("fr-es", "Enseignement scientifique"), tc("fr-eps", "Éducation physique et sportive"), tc("fr-math-c", "Mathématiques (tronc commun)"),
    sp("fr-math", "Mathématiques"), sp("fr-pc", "Physique-Chimie"), sp("fr-svt", "Sciences de la vie et de la Terre"), sp("fr-ses", "Sciences économiques et sociales"),
    sp("fr-hggsp", "Histoire-géographie, géopolitique et sciences politiques"), sp("fr-hlp", "Humanités, littérature et philosophie"), sp("fr-llcer", "Langues, littératures et cultures étrangères"),
    sp("fr-nsi", "Numérique et sciences informatiques"), sp("fr-si", "Sciences de l'ingénieur"), sp("fr-arts", "Arts"), sp("fr-llca", "Littérature, langues et cultures de l'Antiquité"),
    op("fr-mexp", "Mathématiques expertes"), op("fr-mcomp", "Mathématiques complémentaires"), op("fr-dgemc", "Droit et grands enjeux du monde contemporain"),
  ],
  minSubjects: 1,
  maxSubjects: 14,
  targetGrades: ["20", "18", "16", "14", "12", "10"],
});
