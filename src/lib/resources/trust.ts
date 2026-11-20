/**
 * Ranking web results by trust (section 9.1): official sources first, then well-known study
 * sites, then student-made notes and forums, then videos. Sites that host pirated past
 * papers are never shown (section 14: copyright).
 */

export type Tier = 1 | 2 | 3 | 4;

const TIER1 = ["ibo.org", "collegeboard.org", "khanacademy.org", "openstax.org", "ocw.mit.edu", "nist.gov", "nasa.gov", "who.int", "britannica.com"];
const TIER2 = [
  "savemyexams.com", "revisionvillage.com", "physicsandmathstutor.com", "chemguide.co.uk", "hyperphysics.phy-astr.gsu.edu", "bbc.co.uk",
  "ck12.org", "physicsclassroom.com", "mathsisfun.com", "desmos.com", "phet.colorado.edu", "chemlibretexts.org", "libretexts.org",
  "tutor2u.net", "economicshelp.org", "thinkib.net", "ibpenguin.com", "ibmathsresources.com", "ibchem.com", "bioninja.com.au",
  "crashcourse.com", "albert.io", "fiveable.me", "princetonreview.com", "kaptest.com", "purplemath.com", "wolframalpha.com",
];
const TIER3 = ["reddit.com", "quizlet.com", "medium.com", "notion.site", "wikipedia.org", "stackexchange.com", "quora.com", "studylib.net", "scribd.com", "coursehero.com", "studocu.com"];
const VIDEO = ["youtube.com", "youtu.be", "vimeo.com", "ted.com"];
/** Known to host copyrighted IB / AP papers without permission. */
const BLOCKED = ["ibdocs", "papacambridge", "pastpapers.co", "ibresources.com", "ib-papers", "ibpastpapers", "dl.ibdocs", "freeexampapers"];

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};
const match = (h: string, list: string[]) => list.some((d) => h === d || h.endsWith(`.${d}`));

export function isBlocked(url: string) {
  const h = host(url);
  return !h || BLOCKED.some((b) => h.includes(b));
}

export function tierOf(url: string): Tier {
  const h = host(url);
  if (match(h, TIER1)) return 1;
  if (match(h, VIDEO)) return 4;
  if (match(h, TIER2)) return 2;
  if (match(h, TIER3)) return 3;
  return 3;
}

export const sourceName = (url: string) => host(url);

/** Where official past papers really live: link there, never host them. */
export const OFFICIAL_PAPERS: Record<string, { label: string; url: string }[]> = {
  "ib-dp": [
    { label: "IB Store (Follett): official past papers and markschemes", url: "https://www.follettibstore.com/" },
    { label: "IB: subject guides and specimen papers (ask your coordinator for access)", url: "https://www.ibo.org/programmes/diploma-programme/curriculum/" },
  ],
  "american-hs": [
    { label: "AP Central: past free-response questions and scoring guidelines", url: "https://apcentral.collegeboard.org/courses" },
    { label: "College Board: SAT practice tests (Bluebook)", url: "https://satsuite.collegeboard.org/practice" },
  ],
};
