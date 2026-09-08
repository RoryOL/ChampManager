import type { Player, PlayerGrade, PositionLine } from "../types";

/** Championship season used to turn birth years / underage campaigns into ages. */
export const SEASON_YEAR = 2026;

export type PlayerProfile = {
  grade: PlayerGrade;
  age: number;
  overallMin: number;
  overallMax: number;
  note: string;
  position: PositionLine;
};

type Listing = {
  name: string;
  grade: PlayerGrade;
  age: number;
  position: PositionLine;
  /** Championship jersey when the player is only on the wider panel. */
  number?: number;
  overallMin?: number;
  overallMax?: number;
  note?: string;
  /** Name variant used only for profile lookup, not as a separate squad member. */
  hidden?: boolean;
};

const GRADE_BAND: Record<PlayerGrade, { min: number; max: number; note: string }> = {
  A: { min: 15, max: 18, note: "Current Clare senior" },
  B: { min: 12, max: 16, note: "Former Clare senior" },
  C: { min: 10, max: 15, note: "Clare minor / U20" },
  D: { min: 5, max: 12, note: "Club hurler" },
};

export const GRADE_LABEL: Record<PlayerGrade, string> = {
  A: "Clare senior",
  B: "Ex-Clare senior",
  C: "Clare underage",
  D: "Club",
};

/**
 * Inter-county history and natural lines for 2026 Clare SHC squads.
 * Grades: A current Banner senior; B former senior / senior cameos; C Clare minor/U20
 * (roughly 2016–2026); D club only. Positions come from numbered 2025 and 2026
 * championship XVs, not from substitute index in the latest report.
 */
const LISTINGS: Record<string, Listing[]> = {
  ballyea: [
    { name: "Tony Kelly", grade: "A", age: 32, position: "MF", overallMin: 19, overallMax: 20, note: "Current Clare senior — All-Star, 2013 and 2024 All-Ireland; elite pace and shooting" },
    { name: "Paul Flanagan", grade: "B", age: 33, position: "FB", overallMin: 13, overallMax: 16, note: "Former Clare senior full-back, retired from the county in 2025" },
    { name: "Jack Browne", grade: "B", age: 33, position: "HB", overallMin: 13, overallMax: 15 },
    { name: "Gearoid O'Connell", grade: "B", age: 32, position: "HB", overallMin: 12, overallMax: 15 },
    { name: "Niall Deasy", grade: "B", age: 32, position: "HF", overallMin: 13, overallMax: 16, note: "Former Clare senior free-taker" },
    { name: "Pearse Lillis", grade: "B", age: 32, position: "HF", overallMin: 12, overallMax: 15 },
    { name: "Daniel Costelloe", grade: "C", age: 21, position: "MF", overallMin: 12, overallMax: 15, note: "Clare U20, including the 2026 All-Ireland U20 winning panel" },
    { name: "Barry Coote", grade: "D", age: 29, position: "GK" },
    { name: "Peter Casey", grade: "C", age: 27, position: "FB", note: "Clare U20 2019" },
    { name: "Thomas Kelly", grade: "D", age: 27, position: "HB" },
    { name: "Morgan Garry", grade: "D", age: 26, position: "HB" },
    { name: "Dara Kennedy", grade: "D", age: 24, position: "HF" },
    { name: "Mossy Gavin", grade: "D", age: 28, position: "HF" },
    { name: "Cian Kirby", grade: "C", age: 23, position: "FF", note: "Clare U20 2024; Ballyea's second marksman in the 2025 SHC" },
    { name: "Fiachra Kirby", grade: "D", age: 22, position: "HF" },
    { name: "Eoin O'Connor", grade: "D", age: 25, position: "HF" },
    { name: "Aaron Griffin", grade: "D", age: 24, position: "FF" },
    { name: "Fergal Guinnane", grade: "D", age: 27, position: "HF" },
    { name: "Daragh Moylan", grade: "D", age: 26, position: "HB", number: 7, note: "2025 SHC quarter-final and semi-final starter" },
    { name: "Tadhg Ó hUallacháin", grade: "D", age: 24, position: "FB", number: 18, note: "2025 SHC knockout starter" },
    { name: "Cathal Doohan", grade: "D", age: 25, position: "FF", number: 14, note: "2025 SHC semi-final starter" },
    { name: "Oisin Griffin", grade: "D", age: 23, position: "GK", number: 16, note: "2025 SHC quarter-final substitute" },
  ],
  "inagh-kilnamona": [
    { name: "David Fitzgerald", grade: "A", age: 30, position: "MF", overallMin: 16, overallMax: 18, note: "Current Clare senior — engine and scoring from play" },
    { name: "Aidan McCarthy", grade: "B", age: 27, position: "FF", overallMin: 14, overallMax: 16, note: "Former Clare senior free-taker, left the 2026 county panel" },
    { name: "Shane Woods", grade: "A", age: 23, position: "FB", overallMin: 15, overallMax: 16, note: "Current Clare senior" },
    { name: "Sean Rynne", grade: "A", age: 22, position: "MF", overallMin: 15, overallMax: 16, note: "Current Clare senior; captained Clare minors" },
    { name: "Jason McCarthy", grade: "B", age: 28, position: "HB", overallMin: 12, overallMax: 15, note: "Former Clare senior panellist" },
    { name: "Eamonn Foudy", grade: "B", age: 29, position: "GK", overallMin: 12, overallMax: 15, note: "Former Clare senior goalkeeper panellist" },
    { name: "James Hegarty", grade: "C", age: 20, position: "HB", overallMin: 13, overallMax: 15, note: "Clare minor All-Ireland winner 2023; U20 regular" },
    { name: "Conor Rynne", grade: "C", age: 20, position: "FB", overallMin: 11, overallMax: 14, note: "Clare minor All-Ireland winner 2023" },
    { name: "Fred Hegarty", grade: "C", age: 20, position: "FF", overallMin: 12, overallMax: 15, note: "Clare minor 2023; U20 scorer" },
    { name: "Jack Mescall", grade: "C", age: 20, position: "HF", overallMin: 11, overallMax: 14, note: "Clare minor All-Ireland winner 2023; U20" },
    { name: "Keith White", grade: "C", age: 28, position: "FB", note: "Clare U20 2019" },
    { name: "Kevin Hehir", grade: "D", age: 27, position: "HB" },
    { name: "Gearoid Barry", grade: "D", age: 26, position: "MF" },
    { name: "Kealan Guyler", grade: "C", age: 26, position: "HF", note: "Clare U20 2019" },
    { name: "Josh Guyler", grade: "C", age: 24, position: "FF", note: "Clare U20 2022" },
    { name: "Conner Hegarty", grade: "C", age: 25, position: "HF", note: "Clare U20 captain 2022" },
    { name: "Mark Callinan", grade: "D", age: 29, position: "FB" },
    { name: "David Mescall", grade: "D", age: 27, position: "HF" },
    { name: "Niall Mullins", grade: "D", age: 24, position: "FF" },
    { name: "Padraig Devitt", grade: "D", age: 27, position: "FB", number: 2, note: "2025 SHC quarter-final starter" },
    { name: "Darren Cullinan", grade: "D", age: 25, position: "HF", number: 12, note: "2025 SHC quarter-final starter; 2026 scorer" },
    { name: "Eoin McNamara", grade: "D", age: 24, position: "HF", number: 22, note: "2025 SHC quarter-final substitute" },
    { name: "Seamus Foudy", grade: "D", age: 26, position: "MF", number: 18, note: "2025 SHC group-stage starter" },
    { name: "Tom Barry", grade: "D", age: 23, position: "FF", number: 14, note: "2025 SHC group-stage starter" },
  ],
  clonlara: [
    { name: "John Conlon", grade: "A", age: 37, position: "HF", overallMin: 16, overallMax: 18, note: "Current Clare senior — 2013 All-Ireland winner" },
    { name: "Diarmuid Stritch", grade: "A", age: 21, position: "HF", overallMin: 15, overallMax: 16, note: "Current Clare senior — pace and striking from the U20 production line" },
    { name: "Ian Galvin", grade: "B", age: 30, position: "FF", overallMin: 13, overallMax: 16, note: "Former Clare senior corner-forward — pace and finishing" },
    { name: "Colm Galvin", grade: "B", age: 33, position: "MF", overallMin: 13, overallMax: 16, note: "Former Clare senior; 2013 All-Ireland winner" },
    { name: "Micheál O'Loughlin", grade: "B", age: 29, position: "FF", overallMin: 13, overallMax: 16 },
    { name: "Dylan McMahon", grade: "B", age: 24, position: "HB", overallMin: 12, overallMax: 15, note: "Former Clare senior panellist; Clare U20 2019" },
    { name: "Michael Collins", grade: "C", age: 20, position: "FF", overallMin: 12, overallMax: 15, note: "Clare minor All-Ireland winner 2023; U20" },
    { name: "Alan Murnane", grade: "D", age: 30, position: "GK" },
    { name: "Oisin O'Brien", grade: "D", age: 25, position: "FB" },
    { name: "Paul McNamara", grade: "D", age: 28, position: "FB" },
    { name: "Michael Clancy", grade: "D", age: 27, position: "FB" },
    { name: "Tom Power", grade: "D", age: 24, position: "HB" },
    { name: "Aidan Moriarty", grade: "C", age: 26, position: "HB", note: "Clare U20 2019" },
    { name: "Jathan McMahon", grade: "C", age: 25, position: "HF", note: "Clare U20 2019" },
    { name: "Cathal O'Connell", grade: "D", age: 31, position: "FF" },
    { name: "David Fitzgerald", grade: "D", age: 24, position: "MF", note: "Club panel — not the Inagh-Kilnamona county man" },
    { name: "Ger Powell", grade: "D", age: 29, position: "FB" },
    { name: "Kieran Galvin", grade: "D", age: 26, position: "FF" },
    { name: "Daniel Moloney", grade: "D", age: 23, position: "HF" },
    { name: "Logan Ryan", grade: "D", age: 24, position: "FB", number: 4, note: "2025 SHC quarter-final starter" },
    { name: "Paraic O'Loughlin", grade: "D", age: 27, position: "HB", number: 7, note: "2025 SHC quarter-final starter" },
    { name: "Colm O'Meara", grade: "C", age: 24, position: "MF", number: 9, note: "Clare U20 2022; 2025 SHC quarter-final starter" },
    { name: "Bryan McLeish", grade: "D", age: 25, position: "MF", number: 19, note: "2025 SHC quarter-final substitute" },
    { name: "Darragh Dillon", grade: "D", age: 23, position: "HF", number: 15, note: "2025 SHC quarter-final substitute" },
    { name: "Eoin Begley", grade: "D", age: 24, position: "FF", number: 22, note: "2025 SHC quarter-final substitute" },
  ],
  "st-josephs": [
    { name: "David Conroy", grade: "B", age: 24, position: "FF", overallMin: 12, overallMax: 15, note: "Former Clare senior panellist" },
    { name: "Eoin McMahon", grade: "C", age: 21, position: "HB", overallMin: 11, overallMax: 14, note: "Clare U20" },
    { name: "Ian Williams", grade: "C", age: 21, position: "FB", overallMin: 10, overallMax: 14, note: "Clare U20" },
    { name: "Graham Ball", grade: "C", age: 19, position: "HF", overallMin: 12, overallMax: 15, note: "Clare minor; U20 All-Ireland winner 2026" },
    { name: "Oige Fanning", grade: "C", age: 20, position: "HF", overallMin: 12, overallMax: 15, note: "Clare minor All-Ireland winner 2023" },
    { name: "Conor Daly", grade: "C", age: 20, position: "HB", overallMin: 10, overallMax: 14, note: "Clare U20" },
    { name: "Mark O'Connor", grade: "C", age: 20, position: "HB", overallMin: 10, overallMax: 13, note: "Clare minor panel 2023" },
    { name: "Padraic O'Donovan", grade: "C", age: 20, position: "HF", overallMin: 10, overallMax: 13, note: "Clare minor panel 2023" },
    { name: "Thomas O'Connor", grade: "C", age: 19, position: "FF", overallMin: 12, overallMax: 15, note: "Clare U20 All-Ireland winner 2026" },
    { name: "Aaron Landy", grade: "D", age: 28, position: "GK" },
    { name: "Paddy Nagle", grade: "D", age: 29, position: "FB" },
    { name: "Darragh Nagle", grade: "D", age: 26, position: "MF" },
    { name: "Darragh Ball", grade: "D", age: 23, position: "MF" },
    { name: "Adam Mungovan", grade: "D", age: 25, position: "MF" },
    { name: "Eoin Lahiffe", grade: "D", age: 24, position: "HF" },
    { name: "Eoin Burke", grade: "D", age: 27, position: "HF" },
    { name: "Francie Meaney", grade: "D", age: 30, position: "HB" },
    { name: "Cathal McMahon", grade: "D", age: 26, position: "HF" },
    { name: "Joe Mannion", grade: "D", age: 24, position: "HF" },
    { name: "Tom Curran", grade: "C", age: 21, position: "HB", number: 22, note: "Clare U20 panellist" },
    { name: "Eoghan McMahon", grade: "D", age: 25, position: "HB", number: 16, note: "2026 SHC group-stage panel" },
    { name: "Jarlath Colleran", grade: "D", age: 27, position: "FB", number: 3, note: "2025 SHC group-stage starter" },
    { name: "Fionn Kelleher", grade: "D", age: 24, position: "FB", number: 4, note: "2025 SHC group-stage starter" },
    { name: "Michael Nash", grade: "D", age: 25, position: "FF", number: 15, note: "2025 SHC group-stage starter" },
  ],
  "eire-og": [
    { name: "Shane O'Donnell", grade: "A", age: 32, position: "FF", overallMin: 18, overallMax: 19, note: "Current Clare senior — All-Star forward" },
    { name: "David Reidy", grade: "A", age: 33, position: "MF", overallMin: 15, overallMax: 17, note: "Current Clare senior" },
    { name: "Darren O'Brien", grade: "A", age: 24, position: "HF", overallMin: 15, overallMax: 16, note: "Current Clare senior" },
    { name: "Danny Russell", grade: "B", age: 29, position: "FF", overallMin: 13, overallMax: 16, note: "Former Clare senior" },
    { name: "Aaron Fitzgerald", grade: "B", age: 28, position: "HB", overallMin: 12, overallMax: 15, note: "Former Clare senior panellist" },
    { name: "Fionan Treacy", grade: "C", age: 21, position: "FB", overallMin: 11, overallMax: 14, note: "Clare U20" },
    { name: "Robert Loftus", grade: "C", age: 21, position: "HB", overallMin: 12, overallMax: 15, note: "Clare U20 All-Ireland winner 2026" },
    { name: "Darren Moroney", grade: "C", age: 21, position: "HF", overallMin: 11, overallMax: 14, note: "Clare U20" },
    { name: "Marco Cleary", grade: "C", age: 20, position: "FF", overallMin: 12, overallMax: 15, note: "Clare U20 All-Ireland winner 2026" },
    { name: "Luca Cleary", grade: "C", age: 22, position: "HF", overallMin: 11, overallMax: 14, note: "Clare underage" },
    { name: "Conor Perrill", grade: "C", age: 20, position: "HF", overallMin: 10, overallMax: 13, note: "Clare minor panel 2023" },
    { name: "Darragh Stack", grade: "D", age: 29, position: "GK" },
    { name: "Ciaran Russell", grade: "D", age: 31, position: "FB" },
    { name: "Jarlath Collins", grade: "C", age: 24, position: "FB", note: "Clare U20 2022–23" },
    { name: "Oran Cahill", grade: "B", age: 24, position: "MF", overallMin: 12, overallMax: 15, note: "Clare U20; senior cameos under Lohan" },
    { name: "David McNamara", grade: "D", age: 26, position: "HF" },
    { name: "Tom Kavanagh", grade: "D", age: 25, position: "FF" },
    { name: "James O'Dwyer", grade: "D", age: 24, position: "HF" },
    { name: "Rian Mulcahy", grade: "D", age: 23, position: "FB" },
    { name: "Luke Vaughan", grade: "D", age: 22, position: "FB" },
    { name: "Liam Corry", grade: "D", age: 26, position: "HB" },
    { name: "Niall McMahon", grade: "D", age: 25, position: "HB", number: 16, note: "2025 SHC quarter-final substitute" },
    { name: "Eoin O'Regan", grade: "D", age: 23, position: "FB", number: 22, note: "2025 SHC semi-final substitute" },
    { name: "Aaron McGrath", grade: "D", age: 24, position: "FB", number: 23, note: "2025 SHC quarter-final substitute" },
  ],
  crusheen: [
    { name: "Donal Tuohy", grade: "B", age: 38, position: "GK", overallMin: 13, overallMax: 16, note: "Former Clare senior goalkeeper" },
    { name: "Cian Dillon", grade: "B", age: 37, position: "HB", overallMin: 13, overallMax: 16, note: "Former Clare senior; 2013 All-Ireland winner" },
    { name: "Conor O'Donnell", grade: "B", age: 29, position: "FF", overallMin: 12, overallMax: 15, note: "Former Clare panellist" },
    { name: "Ciaran O'Doherty", grade: "D", age: 28, position: "FB" },
    { name: "Gavin O'Brien", grade: "D", age: 27, position: "FB" },
    { name: "Tadhg Deen", grade: "D", age: 24, position: "FB" },
    { name: "Cillein Mullins", grade: "D", age: 23, position: "HB" },
    { name: "Diarmuid Mullins", grade: "C", age: 24, position: "HB", note: "Clare U20 extended panel 2022" },
    { name: "Eanna McMahon", grade: "D", age: 25, position: "MF" },
    { name: "James O'Sullivan", grade: "D", age: 27, position: "MF" },
    { name: "Luke Ketalaar", grade: "D", age: 24, position: "HF" },
    { name: "Oisin O'Donnell", grade: "B", age: 23, position: "HF", overallMin: 12, overallMax: 15, note: "Clare U20; senior cameos under Lohan" },
    { name: "Rian O'Donnell", grade: "D", age: 22, position: "FF" },
    { name: "Jamie Fitzgibbon", grade: "D", age: 25, position: "FF" },
    { name: "Breffni Horner", grade: "C", age: 26, position: "FF", note: "Clare U20 2019" },
    { name: "Fergus Kennedy", grade: "D", age: 29, position: "FF" },
    { name: "John O'Sullivan", grade: "D", age: 28, position: "HF" },
    { name: "Ross Hayes", grade: "C", age: 26, position: "MF", number: 9, note: "Clare U20 2019; 2025 SHC starter and scorer" },
    { name: "Ian O'Brien", grade: "D", age: 27, position: "FB", number: 2, note: "2025 SHC group-stage starter" },
    { name: "Luke Hayes", grade: "D", age: 24, position: "FB", number: 4, note: "2025 SHC group-stage starter" },
    { name: "Gerry O'Grady", grade: "D", age: 29, position: "HF", number: 18, note: "2025 SHC group-stage substitute" },
  ],
  scariff: [
    { name: "Mark Rodgers", grade: "A", age: 24, position: "FF", overallMin: 16, overallMax: 18, note: "Current Clare senior full-forward" },
    { name: "Patrick Crotty", grade: "B", age: 24, position: "HF", overallMin: 13, overallMax: 16, note: "Former Clare senior, dropped ahead of 2026" },
    { name: "Keelan Hartigan", grade: "B", age: 23, position: "HF", overallMin: 12, overallMax: 15, note: "Former Clare senior panellist; U20 in 2023" },
    { name: "Paul Rodgers", grade: "C", age: 20, position: "FF", overallMin: 12, overallMax: 15, note: "Clare U20 All-Ireland winner 2026" },
    { name: "Scott Cairns", grade: "C", age: 21, position: "FB", overallMin: 10, overallMax: 14, note: "Clare U20" },
    { name: "Liam Crotty", grade: "C", age: 21, position: "MF", overallMin: 10, overallMax: 14, note: "Clare U20" },
    { name: "William Kavanagh", grade: "D", age: 29, position: "GK" },
    { name: "Daniel Treacy", grade: "D", age: 27, position: "FB" },
    { name: "Seamus McCaul", grade: "D", age: 28, position: "FB" },
    { name: "Shane Kavanagh", grade: "D", age: 26, position: "HB" },
    { name: "Matthew Crotty", grade: "D", age: 27, position: "HB" },
    { name: "Conor Downes", grade: "D", age: 25, position: "MF" },
    { name: "Seanie Hartigan", grade: "D", age: 24, position: "MF" },
    { name: "Sean Hartigan", grade: "D", age: 24, position: "MF", hidden: true },
    { name: "Michael Barrett", grade: "D", age: 26, position: "HF" },
    { name: "Rossa Keehan", grade: "D", age: 23, position: "HF" },
    { name: "Patrick Ryan", grade: "D", age: 25, position: "FF" },
    { name: "Cathal McCaul", grade: "D", age: 26, position: "FB" },
    { name: "Patrick Nugent", grade: "D", age: 24, position: "FF" },
    { name: "Luke Madden", grade: "D", age: 22, position: "FF" },
    { name: "Rory Ryan", grade: "D", age: 23, position: "HF" },
    { name: "Diarmaid Nash", grade: "D", age: 27, position: "HF" },
    { name: "Cian McInerney", grade: "C", age: 26, position: "HB", number: 5, note: "Clare U20 2019" },
    { name: "Michael Scanlan", grade: "D", age: 27, position: "FB", number: 3, note: "2025 SHC group-stage starter" },
    { name: "Sean Minogue", grade: "D", age: 24, position: "FF", number: 24, note: "2025 SHC group-stage starter" },
  ],
  broadford: [
    { name: "Niall O'Farrell", grade: "A", age: 21, position: "HF", overallMin: 15, overallMax: 16, note: "Current Clare senior, from the U20s" },
    { name: "Paddy Donnellan", grade: "B", age: 24, position: "MF", overallMin: 12, overallMax: 15, note: "Former Clare senior panellist; Clare U20 2019" },
    { name: "Eoghan Gunning", grade: "C", age: 20, position: "HB", overallMin: 13, overallMax: 15, note: "Clare minor All-Ireland captain 2023; U20 captain" },
    { name: "Jack Lovett", grade: "D", age: 27, position: "GK" },
    { name: "Cormac Gunning", grade: "D", age: 25, position: "FB" },
    { name: "Darragh Whelan", grade: "D", age: 26, position: "FB" },
    { name: "Cian Mulqueen", grade: "D", age: 24, position: "FB" },
    { name: "Davy Boland", grade: "D", age: 28, position: "HB" },
    { name: "Cathal Chaplin", grade: "D", age: 26, position: "HB" },
    { name: "Diarmuid O'Brien", grade: "D", age: 25, position: "MF" },
    { name: "Darren Chaplin", grade: "D", age: 27, position: "HF" },
    { name: "Michael Vaughan", grade: "D", age: 24, position: "HF" },
    { name: "Oisin Kavanagh", grade: "D", age: 23, position: "FF" },
    { name: "Donie Whelan", grade: "D", age: 29, position: "FF" },
    { name: "Diarmuid Whelan", grade: "D", age: 27, position: "FF" },
    { name: "Shane Taylor", grade: "D", age: 24, position: "HF" },
    { name: "Stiofan McMahon", grade: "D", age: 23, position: "HF" },
    { name: "Craig Chaplin", grade: "D", age: 22, position: "HF" },
    { name: "Cian O'Brien", grade: "D", age: 26, position: "GK", number: 1, note: "2025 SHC group-stage goalkeeper" },
    { name: "Damien Kiniry", grade: "D", age: 27, position: "FB", number: 4, note: "2025 SHC group-stage starter" },
    { name: "Eoin Donnellan", grade: "D", age: 25, position: "FB", number: 3, note: "2025 SHC group-stage starter" },
    { name: "Paurig Taylor", grade: "D", age: 24, position: "HB", number: 5, note: "2025 SHC group-stage starter" },
    { name: "Diarmuid Moloney", grade: "D", age: 23, position: "FF", number: 14, note: "2025 SHC group-stage starter" },
    { name: "Cian Cremins", grade: "D", age: 22, position: "HF", number: 19, note: "2025 SHC group-stage substitute" },
  ],
  "clooney-quin": [
    { name: "Peter Duggan", grade: "A", age: 32, position: "HF", overallMin: 17, overallMax: 19, note: "Current Clare senior — All-Star target man; frees and sidelines" },
    { name: "Ryan Taylor", grade: "A", age: 26, position: "MF", overallMin: 15, overallMax: 17, note: "Current Clare senior" },
    { name: "Jack O'Neill", grade: "A", age: 21, position: "HF", overallMin: 15, overallMax: 16, note: "Current Clare senior; U20 leader" },
    { name: "John Cahill", grade: "C", age: 21, position: "HB", overallMin: 12, overallMax: 15, note: "Clare U20 captain" },
    { name: "Evan Maxted", grade: "C", age: 21, position: "FB", overallMin: 10, overallMax: 14, note: "Clare U20" },
    { name: "Dannan Fox", grade: "C", age: 20, position: "FF", overallMin: 11, overallMax: 14, note: "Clare minor / U20" },
    { name: "Keith Hogan", grade: "D", age: 28, position: "GK" },
    { name: "John Conneally", grade: "B", age: 24, position: "FB", overallMin: 12, overallMax: 15, note: "Clare U20; senior cameos under Lohan" },
    { name: "Seán McNamara", grade: "D", age: 26, position: "FB" },
    { name: "Darragh Keogh", grade: "C", age: 24, position: "HB", note: "Clare U20 2022" },
    { name: "Conor Grogan", grade: "D", age: 27, position: "FB" },
    { name: "Matthew Corbett", grade: "D", age: 24, position: "MF" },
    { name: "Jerry O'Connor", grade: "D", age: 23, position: "HF", note: "Clooney-Quin top scorer from play in the 2025 SHC" },
    { name: "Callum Hassett", grade: "C", age: 23, position: "FF", overallMin: 11, overallMax: 14, note: "Clooney-Quin minor captain; Clare U20 2024 (leg injury)" },
    { name: "Darragh McNamara", grade: "C", age: 20, position: "FF", note: "First year out of minor in 2025; 2025 SHC semi-final starter" },
    { name: "Sam Scanlan", grade: "C", age: 23, position: "FF", overallMin: 11, overallMax: 14, note: "Clare minor; 2025 SHC semi-final and final corner-forward" },
    { name: "Patrick Finnernan", grade: "D", age: 26, position: "HF" },
    { name: "Martin Duggan", grade: "D", age: 30, position: "HF" },
    { name: "Ulick O'Sullivan", grade: "D", age: 24, position: "HB" },
    { name: "David Considine", grade: "D", age: 23, position: "MF" },
    { name: "Cillian Duggan", grade: "D", age: 27, position: "GK", number: 1, note: "2025 SHC final and semi-final goalkeeper" },
    { name: "Jimmy Corry", grade: "D", age: 28, position: "MF", number: 9, note: "2025 SHC captain; final and semi-final starter" },
    { name: "Trevor Lee", grade: "D", age: 25, position: "FF", number: 25, note: "2025 SHC knockout substitute" },
    { name: "Bryan McInerney", grade: "D", age: 26, position: "HB", number: 19, note: "2025 SHC final substitute" },
  ],
  cratloe: [
    { name: "Diarmuid Ryan", grade: "A", age: 27, position: "HB", overallMin: 16, overallMax: 17, note: "Current Clare senior half-back" },
    { name: "Jamie Moylan", grade: "A", age: 21, position: "HB", overallMin: 15, overallMax: 16, note: "Current Clare senior; minor All-Ireland 2023" },
    { name: "Conor McGrath", grade: "B", age: 34, position: "MF", overallMin: 13, overallMax: 16, note: "Former Clare senior; 2013 All-Ireland winner" },
    { name: "Podge Collins", grade: "B", age: 34, position: "FF", overallMin: 13, overallMax: 16, note: "Former Clare senior; 2013 All-Ireland winner" },
    { name: "Rian Considine", grade: "B", age: 26, position: "FF", overallMin: 13, overallMax: 16, note: "Former Clare senior panellist; Clare U20 2019" },
    { name: "Conor Ryan", grade: "B", age: 35, position: "HF", overallMin: 12, overallMax: 15, note: "Former Clare senior; 2013 All-Ireland winner" },
    { name: "Daire Neville", grade: "C", age: 20, position: "HF", overallMin: 10, overallMax: 14, note: "Clare minor panel 2023" },
    { name: "Marc O'Brien", grade: "C", age: 20, position: "HF", overallMin: 12, overallMax: 15, note: "Clare minor All-Ireland winner 2023" },
    { name: "Tadhg Lohan", grade: "C", age: 20, position: "HF", overallMin: 10, overallMax: 14, note: "Clare U20" },
    { name: "Eoin Deegan", grade: "D", age: 28, position: "GK" },
    { name: "Cathal Lohan", grade: "D", age: 26, position: "FB" },
    { name: "Shane Gleeson", grade: "D", age: 27, position: "FB" },
    { name: "David Collins", grade: "D", age: 32, position: "FB" },
    { name: "Enda Boyce", grade: "D", age: 25, position: "HB" },
    { name: "Riain McNamara", grade: "D", age: 24, position: "MF" },
    { name: "John Flanagan", grade: "D", age: 26, position: "FF" },
    { name: "Liam Markham", grade: "D", age: 27, position: "FF", number: 22, note: "2025 SHC group-stage substitute" },
    { name: "Daithi Collins", grade: "D", age: 24, position: "MF", number: 9, note: "2025 SHC group-stage starter" },
    { name: "Sean Collins", grade: "D", age: 25, position: "HF", number: 18, note: "2025 SHC group-stage substitute" },
    { name: "Eoin Carey", grade: "D", age: 23, position: "HF", number: 25, note: "2025 SHC group-stage substitute" },
  ],
  feakle: [
    { name: "Eibhear Quilligan", grade: "A", age: 28, position: "GK", overallMin: 15, overallMax: 17, note: "Current Clare senior goalkeeper" },
    { name: "Adam Hogan", grade: "A", age: 24, position: "FB", overallMin: 15, overallMax: 17, note: "Current Clare senior corner-back" },
    { name: "Shane McGrath", grade: "B", age: 37, position: "HF", overallMin: 13, overallMax: 16, note: "Former Clare senior" },
    { name: "Con Smyth", grade: "B", age: 26, position: "HB", overallMin: 12, overallMax: 15, note: "Former Clare senior panellist; 2024 county champion" },
    { name: "Ronan O'Connor", grade: "C", age: 21, position: "MF", overallMin: 11, overallMax: 14, note: "Clare U20" },
    { name: "Oisin O'Connor", grade: "C", age: 20, position: "FF", overallMin: 10, overallMax: 14, note: "Clare U20" },
    { name: "Oisin Clune", grade: "C", age: 24, position: "HB", note: "Clare U20 2022–23" },
    { name: "Enda Madden", grade: "D", age: 28, position: "FB" },
    { name: "Killian Bane", grade: "D", age: 26, position: "FB" },
    { name: "Eoin Tuohy", grade: "D", age: 27, position: "HB" },
    { name: "Enda Noonan", grade: "D", age: 29, position: "MF" },
    { name: "Steven Conway", grade: "D", age: 24, position: "HF" },
    { name: "Packie Daly", grade: "D", age: 26, position: "MF" },
    { name: "Owen McGann", grade: "D", age: 25, position: "FF" },
    { name: "Martin Daly", grade: "D", age: 30, position: "FF" },
    { name: "Evan McMahon", grade: "D", age: 23, position: "HB" },
    { name: "Diarmuid Bane", grade: "D", age: 24, position: "HB" },
    { name: "Eoghan Daly", grade: "D", age: 23, position: "HF" },
    { name: "Gary Guilfoyle", grade: "D", age: 27, position: "HF" },
    { name: "Oisin Donnellan", grade: "D", age: 24, position: "HF" },
    { name: "Liam O'Connor", grade: "D", age: 26, position: "GK", number: 16, note: "2025 SHC quarter-final goalkeeper while Quilligan was injured" },
    { name: "Ray Bane", grade: "D", age: 25, position: "HF", number: 12, note: "2025 SHC quarter-final starter" },
    { name: "Eoin McGuinness", grade: "D", age: 24, position: "HB", number: 21, note: "2025 SHC group-stage substitute" },
  ],
  "ocallaghans-mills": [
    { name: "Aidan Fawl", grade: "A", age: 21, position: "HB", overallMin: 15, overallMax: 16, note: "Current Clare senior" },
    { name: "Conor Cooney", grade: "B", age: 28, position: "FB", overallMin: 12, overallMax: 15, note: "Former Clare underage / senior development" },
    { name: "Seán Boyce", grade: "C", age: 20, position: "FF", overallMin: 12, overallMax: 15, note: "Clare minor 2023; U20 All-Ireland winner 2026" },
    { name: "Darragh Moroney", grade: "C", age: 21, position: "HF", overallMin: 10, overallMax: 14, note: "Clare U20" },
    { name: "Killian Nugent", grade: "D", age: 27, position: "GK" },
    { name: "Niall Melody", grade: "D", age: 26, position: "FB" },
    { name: "Ciaran Cooney", grade: "D", age: 25, position: "FB" },
    { name: "Seán Cotter", grade: "D", age: 24, position: "HB" },
    { name: "Aidan O'Gorman", grade: "D", age: 27, position: "HB" },
    { name: "Fionn Hickey", grade: "D", age: 23, position: "MF" },
    { name: "Cormac Murphy", grade: "C", age: 24, position: "MF", note: "Clare U20 2022" },
    { name: "Jacob Loughnane", grade: "D", age: 24, position: "HF" },
    { name: "Conor Henry", grade: "D", age: 26, position: "HF" },
    { name: "Colm Cleary", grade: "C", age: 24, position: "FF", note: "Clare U20 2023" },
    { name: "Liam Murphy", grade: "D", age: 27, position: "FF" },
    { name: "Bryan Donnellan", grade: "D", age: 29, position: "FF" },
    { name: "Keith Donnellan", grade: "D", age: 26, position: "FB" },
    { name: "Colin Crehan", grade: "D", age: 30, position: "HB" },
    { name: "Mark Pewter", grade: "D", age: 24, position: "HF" },
    { name: "Stephen Donnellan", grade: "D", age: 32, position: "HF", overallMin: 10, overallMax: 12, note: "Club veteran; related to former Clare captain Patrick Donnellan" },
    { name: "Cathal McNamara", grade: "D", age: 25, position: "HF" },
    { name: "Gary Cooney", grade: "C", age: 26, position: "HF", number: 16, note: "Clare U20 2019" },
    { name: "Conor Donnellan", grade: "D", age: 24, position: "HB", number: 21, note: "2025 SHC panel" },
  ],
  kilmaley: [
    { name: "Conor Cleary", grade: "A", age: 31, position: "FF", overallMin: 15, overallMax: 17, note: "Current Clare senior full-back; club full-forward" },
    { name: "Daire Keane", grade: "B", age: 28, position: "HB", overallMin: 12, overallMax: 15, note: "Former Clare senior panellist" },
    { name: "Tom O'Rourke", grade: "B", age: 27, position: "FF", overallMin: 12, overallMax: 15 },
    { name: "Sean O'Loughlin", grade: "B", age: 26, position: "FF", overallMin: 12, overallMax: 15 },
    { name: "Joe Casey", grade: "C", age: 21, position: "FB", overallMin: 11, overallMax: 14, note: "Clare minor 2023; U20" },
    { name: "Bryan O'Loughlin", grade: "D", age: 29, position: "GK" },
    { name: "Colin Carmody", grade: "D", age: 27, position: "FB" },
    { name: "Colin McGuane", grade: "D", age: 28, position: "FB" },
    { name: "Oisin Looney", grade: "D", age: 24, position: "FB" },
    { name: "Aidan McGuane", grade: "D", age: 26, position: "HB" },
    { name: "Mikey O'Malley", grade: "D", age: 25, position: "HF" },
    { name: "Tommy Barry", grade: "D", age: 27, position: "MF" },
    { name: "Mikey O'Neill", grade: "D", age: 24, position: "HF" },
    { name: "Cian Moloney", grade: "D", age: 23, position: "HF" },
    { name: "Sean Kennedy", grade: "D", age: 25, position: "MF" },
    { name: "Colm Killeen", grade: "D", age: 26, position: "HF" },
    { name: "Brian McNamara", grade: "D", age: 28, position: "FB" },
    { name: "James Fitzpatrick", grade: "D", age: 24, position: "HF" },
    { name: "Joe Carmody", grade: "D", age: 23, position: "HF" },
    { name: "Eanna McMahon", grade: "D", age: 25, position: "HF" },
    { name: "Martin O'Connor", grade: "D", age: 27, position: "FB", number: 2, note: "2025 SHC quarter-final starter" },
    { name: "Cathal Darcy", grade: "C", age: 25, position: "MF", number: 29, note: "Clare U20 2019; 2025 SHC knockout substitute" },
    { name: "Eoin Enright", grade: "D", age: 24, position: "MF", number: 18, note: "2025 SHC semi-final substitute" },
    { name: "Sean Ronan", grade: "C", age: 24, position: "FF", number: 24, note: "Clare U20 extended panel 2022; 2025 SHC semi-final substitute" },
  ],
  newmarket: [
    { name: "Adam Enright", grade: "C", age: 21, position: "GK", overallMin: 10, overallMax: 14, note: "Clare U20" },
    { name: "Seán Arthur", grade: "C", age: 20, position: "MF", overallMin: 12, overallMax: 15, note: "Clare minor All-Ireland winner 2023; U20" },
    { name: "Michael Power", grade: "C", age: 20, position: "FF", overallMin: 11, overallMax: 14, note: "Clare minor All-Ireland winner 2023; U20" },
    { name: "Mark Delaney", grade: "D", age: 27, position: "FB" },
    { name: "Jack Enright", grade: "D", age: 25, position: "FB" },
    { name: "Stephen Casey", grade: "D", age: 28, position: "FB" },
    { name: "Evan Crimmins", grade: "D", age: 24, position: "HB" },
    { name: "Eanna Crimmins", grade: "D", age: 26, position: "HB" },
    { name: "Shane Lynch", grade: "D", age: 27, position: "HB" },
    { name: "Liam O'Connor", grade: "D", age: 25, position: "MF" },
    { name: "Dara McInerney", grade: "D", age: 24, position: "HF" },
    { name: "John Fehilly", grade: "D", age: 26, position: "HF" },
    { name: "Colin Guilfoyle", grade: "D", age: 29, position: "HF" },
    { name: "Eoin Hayes", grade: "D", age: 23, position: "FF" },
    { name: "Peter Power", grade: "C", age: 24, position: "FF", note: "Clare U20 2022" },
    { name: "Eoin Guilfoyle", grade: "D", age: 25, position: "FF" },
    { name: "Paudie Guilfoyle", grade: "D", age: 29, position: "GK", number: 1, note: "2025 SHC group-stage goalkeeper" },
    { name: "James McInerney", grade: "D", age: 26, position: "HB", number: 7, note: "2025 SHC group-stage starter" },
    { name: "Niall O'Connor", grade: "D", age: 25, position: "HB", number: 5, note: "2025 SHC group-stage starter" },
    { name: "Paudie McMahon", grade: "D", age: 27, position: "HF", number: 4, note: "2025 SHC group-stage starter" },
    { name: "Mikey McInerney", grade: "D", age: 24, position: "FF", number: 10, note: "2025 SHC group-stage starter" },
    { name: "Conor McCarthy", grade: "D", age: 23, position: "FB", number: 22, note: "2025 SHC group-stage starter" },
    { name: "Sean O'Connor", grade: "D", age: 24, position: "HB", number: 29, note: "2025 SHC group-stage substitute" },
    { name: "James Freeman", grade: "D", age: 25, position: "MF", number: 12, note: "2025 SHC group-stage substitute" },
  ],
  "wolfe-tones": [
    { name: "Rory Hayes", grade: "A", age: 28, position: "FB", overallMin: 15, overallMax: 17, note: "Current Clare senior corner-back" },
    { name: "Darragh Lohan", grade: "A", age: 24, position: "FB", overallMin: 15, overallMax: 16, note: "Current Clare senior; Clare U20 2019" },
    { name: "Daithi Lohan", grade: "A", age: 22, position: "HB", overallMin: 15, overallMax: 16, note: "Current Clare senior" },
    { name: "Aron Shanagher", grade: "B", age: 28, position: "HF", overallMin: 13, overallMax: 16, note: "Former Clare senior" },
    { name: "Aaron Cunningham", grade: "B", age: 33, position: "FF", overallMin: 13, overallMax: 16, note: "Former Clare senior; 2013 All-Ireland winner" },
    { name: "Sam Meaney", grade: "C", age: 21, position: "MF", overallMin: 10, overallMax: 14, note: "Clare U20" },
    { name: "Oisin O'Rourke", grade: "D", age: 26, position: "GK" },
    { name: "Brian Murphy", grade: "D", age: 27, position: "FB" },
    { name: "Liam Murphy", grade: "C", age: 24, position: "FB", note: "Clare U20 extended panel 2022" },
    { name: "Evan O'Gorman", grade: "D", age: 24, position: "HB" },
    { name: "John Guilfoyle", grade: "D", age: 26, position: "HB" },
    { name: "Ben O'Gorman", grade: "D", age: 23, position: "HF" },
    { name: "Sean Murphy", grade: "D", age: 25, position: "HF" },
    { name: "Cian O'Rourke", grade: "D", age: 24, position: "FF" },
    { name: "Dean Devanney", grade: "D", age: 27, position: "FF" },
    { name: "Jack Cunningham", grade: "D", age: 23, position: "HF" },
    { name: "Dylan Frawley", grade: "D", age: 24, position: "HF" },
    { name: "Gavin Carrig", grade: "D", age: 22, position: "HF" },
    { name: "Colin Riordan", grade: "D", age: 26, position: "HB" },
    { name: "Stephen Donnellan", grade: "D", age: 27, position: "MF", number: 10, note: "2025 SHC group-stage starter" },
  ],
  sixmilebridge: [
    { name: "Cathal Malone", grade: "A", age: 33, position: "HF", overallMin: 15, overallMax: 17, note: "Current Clare senior" },
    { name: "Mark Sheedy", grade: "A", age: 20, position: "GK", overallMin: 15, overallMax: 16, note: "Current Clare senior; minor All-Ireland winner 2023; U20 keeper" },
    { name: "Seadna Morey", grade: "B", age: 33, position: "HB", overallMin: 13, overallMax: 16, note: "Former Clare senior; retired from the county in 2025" },
    { name: "Shane Golden", grade: "B", age: 33, position: "FF", overallMin: 12, overallMax: 15, note: "Former Clare senior" },
    { name: "Jamie Shanahan", grade: "B", age: 29, position: "MF", overallMin: 13, overallMax: 16, note: "Former Clare senior" },
    { name: "Fiachra Ó Braoin", grade: "C", age: 20, position: "FB", overallMin: 11, overallMax: 14, note: "Clare U20" },
    { name: "Matthew O'Halloran", grade: "C", age: 20, position: "FB", overallMin: 12, overallMax: 15, note: "Clare minor All-Ireland winner 2023; U20" },
    { name: "Mattie O'Halloran", grade: "C", age: 20, position: "FB", overallMin: 12, overallMax: 15, note: "Clare minor All-Ireland winner 2023; U20", hidden: true },
    { name: "Dara Fitzgerald", grade: "C", age: 20, position: "HF", overallMin: 10, overallMax: 14, note: "Clare U20" },
    { name: "Noel Purcell", grade: "D", age: 28, position: "FB" },
    { name: "Pa Mulready", grade: "D", age: 27, position: "FB" },
    { name: "Paidi Fitzpatrick", grade: "D", age: 25, position: "HB" },
    { name: "Lorcan Fitzpatrick", grade: "D", age: 24, position: "HF" },
    { name: "Conor Deasy", grade: "D", age: 26, position: "HF" },
    { name: "Luke O'Halloran", grade: "D", age: 23, position: "HF" },
    { name: "David Kennedy", grade: "C", age: 23, position: "FF", note: "Clare U20 2023" },
    { name: "Brian Corry", grade: "D", age: 25, position: "FF" },
    { name: "Sean Macnamara", grade: "D", age: 24, position: "MF" },
    { name: "Zak Phelan", grade: "D", age: 22, position: "HB" },
    { name: "Alan Mulready", grade: "D", age: 26, position: "HB" },
    { name: "Calum Phelan", grade: "D", age: 21, position: "FB" },
    { name: "Cathal Lynch", grade: "D", age: 25, position: "HF" },
    { name: "Derek Fahy", grade: "D", age: 32, position: "GK", number: 16, note: "2025 SHC quarter-final goalkeeper" },
    { name: "Brian Carey", grade: "D", age: 28, position: "MF", number: 8, note: "2025 SHC quarter-final starter" },
    { name: "Alex Morey", grade: "D", age: 26, position: "FF", number: 12, note: "2025 SHC quarter-final starter" },
    { name: "Leon Kelly", grade: "D", age: 27, position: "HB", number: 5, note: "2025 SHC group-stage panel (injured for the quarter-final)" },
    { name: "Colm Flynn", grade: "D", age: 25, position: "HF", number: 17, note: "2025 SHC group-stage panel" },
    { name: "Barry Fitzpatrick", grade: "D", age: 29, position: "HB", number: 18, note: "2025 SHC group-stage panel" },
    { name: "Jason Loughnane", grade: "D", age: 24, position: "HB", number: 22, note: "2025 SHC group-stage substitute" },
  ],
};

export function normalizePlayerName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function hash(text: string): number {
  let value = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function toProfile(listing: Listing): PlayerProfile {
  const band = GRADE_BAND[listing.grade];
  return {
    grade: listing.grade,
    age: listing.age,
    overallMin: listing.overallMin ?? (listing.grade === "D" ? 8 : band.min),
    overallMax: listing.overallMax ?? band.max,
    note: listing.note ?? band.note,
    position: listing.position,
  };
}

const INDEX = new Map<string, PlayerProfile>();
for (const [teamId, listings] of Object.entries(LISTINGS)) {
  for (const listing of listings) {
    INDEX.set(`${teamId}:${normalizePlayerName(listing.name)}`, toProfile(listing));
  }
}

export function profileFor(teamId: string, name: string, panel = false): PlayerProfile {
  const found = INDEX.get(`${teamId}:${normalizePlayerName(name)}`);
  if (found) return found;
  const seed = hash(`${teamId}:${normalizePlayerName(name)}`);
  const age = 22 + (seed % 11);
  const position: PositionLine = (["GK", "FB", "HB", "MF", "HF", "FF"] as const)[seed % 6] ?? "MF";
  if (panel) {
    return { grade: "D", age, overallMin: 5, overallMax: 10, note: GRADE_BAND.D.note, position };
  }
  return { grade: "D", age, overallMin: 8, overallMax: 12, note: GRADE_BAND.D.note, position };
}

/** Wider 2025/2026 championship names that may not appear in the stored 2026 line-outs. */
export function extraPanelFor(teamId: string): Player[] {
  return (LISTINGS[teamId] ?? [])
    .filter((listing) => !listing.hidden)
    .map((listing) => ({ name: listing.name, number: listing.number ?? 0 }));
}

/** Younger panels take training better and shake off fatigue faster. */
export function ageResponse(age: number): { train: number; recover: number; fatigue: number } {
  if (age <= 21) return { train: 1.28, recover: 1.38, fatigue: 0.7 };
  if (age <= 24) return { train: 1.16, recover: 1.22, fatigue: 0.82 };
  if (age <= 27) return { train: 1.06, recover: 1.08, fatigue: 0.92 };
  if (age <= 30) return { train: 1, recover: 1, fatigue: 1 };
  if (age <= 33) return { train: 0.88, recover: 0.82, fatigue: 1.14 };
  return { train: 0.72, recover: 0.64, fatigue: 1.32 };
}
