import type { PlayerGrade } from "../types";

/** Championship season used to turn birth years / underage campaigns into ages. */
export const SEASON_YEAR = 2026;

export type PlayerProfile = {
  grade: PlayerGrade;
  age: number;
  overallMin: number;
  overallMax: number;
  note: string;
};

type Listing = {
  name: string;
  grade: PlayerGrade;
  age: number;
  overallMin?: number;
  overallMax?: number;
  note?: string;
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
 * Inter-county history for 2026 Clare SHC squads, taken from Clare Echo championship
 * line-outs plus Clare senior, U20 and minor panels (2023–2026). Grade A is the current
 * Banner senior panel; B former seniors; C minor/U20; D club only.
 */
const LISTINGS: Record<string, Listing[]> = {
  ballyea: [
    { name: "Tony Kelly", grade: "A", age: 32, overallMin: 19, overallMax: 20, note: "Current Clare senior — All-Star, 2013 All-Ireland" },
    { name: "Paul Flanagan", grade: "B", age: 33, overallMin: 13, overallMax: 16, note: "Former Clare senior full-back, retired from the county in 2025" },
    { name: "Jack Browne", grade: "B", age: 33, overallMin: 13, overallMax: 15 },
    { name: "Gearoid O'Connell", grade: "B", age: 32, overallMin: 12, overallMax: 15 },
    { name: "Niall Deasy", grade: "B", age: 32, overallMin: 13, overallMax: 16, note: "Former Clare senior free-taker" },
    { name: "Pearse Lillis", grade: "B", age: 32, overallMin: 12, overallMax: 15 },
    { name: "Daniel Costelloe", grade: "C", age: 21, overallMin: 12, overallMax: 15, note: "Clare U20, including the 2026 All-Ireland U20 winning panel" },
    { name: "Barry Coote", grade: "D", age: 29 },
    { name: "Peter Casey", grade: "D", age: 31 },
    { name: "Thomas Kelly", grade: "D", age: 27 },
    { name: "Morgan Garry", grade: "D", age: 26 },
    { name: "Dara Kennedy", grade: "D", age: 24 },
    { name: "Mossy Gavin", grade: "D", age: 28 },
    { name: "Cian Kirby", grade: "D", age: 23 },
    { name: "Fiachra Kirby", grade: "D", age: 22 },
    { name: "Eoin O'Connor", grade: "D", age: 25 },
    { name: "Aaron Griffin", grade: "D", age: 24 },
    { name: "Fergal Guinnane", grade: "D", age: 27 },
  ],
  "inagh-kilnamona": [
    { name: "David Fitzgerald", grade: "A", age: 30, overallMin: 16, overallMax: 18, note: "Current Clare senior midfielder" },
    { name: "Aidan McCarthy", grade: "B", age: 27, overallMin: 14, overallMax: 16, note: "Former Clare senior free-taker, left the 2026 county panel" },
    { name: "Shane Woods", grade: "A", age: 23, overallMin: 15, overallMax: 16, note: "Current Clare senior" },
    { name: "Sean Rynne", grade: "A", age: 22, overallMin: 15, overallMax: 16, note: "Current Clare senior; captained Clare minors" },
    { name: "Jason McCarthy", grade: "B", age: 28, overallMin: 12, overallMax: 15, note: "Former Clare senior panellist" },
    { name: "Eamonn Foudy", grade: "B", age: 29, overallMin: 12, overallMax: 15, note: "Former Clare senior goalkeeper panellist" },
    { name: "James Hegarty", grade: "C", age: 20, overallMin: 13, overallMax: 15, note: "Clare minor All-Ireland winner 2023; U20 regular" },
    { name: "Conor Rynne", grade: "C", age: 20, overallMin: 11, overallMax: 14, note: "Clare minor All-Ireland winner 2023" },
    { name: "Fred Hegarty", grade: "C", age: 20, overallMin: 12, overallMax: 15, note: "Clare minor 2023; U20 scorer" },
    { name: "Jack Mescall", grade: "C", age: 20, overallMin: 11, overallMax: 14, note: "Clare minor All-Ireland winner 2023; U20" },
    { name: "Keith White", grade: "D", age: 28 },
    { name: "Kevin Hehir", grade: "D", age: 27 },
    { name: "Gearoid Barry", grade: "D", age: 26 },
    { name: "Kealan Guyler", grade: "D", age: 24 },
    { name: "Josh Guyler", grade: "D", age: 23 },
    { name: "Conner Hegarty", grade: "D", age: 25 },
    { name: "Mark Callinan", grade: "D", age: 29 },
    { name: "David Mescall", grade: "D", age: 27 },
    { name: "Niall Mullins", grade: "D", age: 24 },
  ],
  clonlara: [
    { name: "John Conlon", grade: "A", age: 37, overallMin: 16, overallMax: 18, note: "Current Clare senior — 2013 All-Ireland winner" },
    { name: "Diarmuid Stritch", grade: "A", age: 21, overallMin: 15, overallMax: 16, note: "Current Clare senior, from the U20 production line" },
    { name: "Ian Galvin", grade: "B", age: 30, overallMin: 13, overallMax: 16, note: "Former Clare senior corner-forward" },
    { name: "Colm Galvin", grade: "B", age: 33, overallMin: 13, overallMax: 16, note: "Former Clare senior; 2013 All-Ireland winner" },
    { name: "Micheál O'Loughlin", grade: "B", age: 29, overallMin: 13, overallMax: 16 },
    { name: "Dylan McMahon", grade: "B", age: 24, overallMin: 12, overallMax: 15, note: "Former Clare senior panellist" },
    { name: "Michael Collins", grade: "C", age: 20, overallMin: 12, overallMax: 15, note: "Clare minor All-Ireland winner 2023; U20" },
    { name: "Alan Murnane", grade: "D", age: 30 },
    { name: "Oisin O'Brien", grade: "D", age: 25 },
    { name: "Paul McNamara", grade: "D", age: 28 },
    { name: "Michael Clancy", grade: "D", age: 27 },
    { name: "Tom Power", grade: "D", age: 24 },
    { name: "Aidan Moriarty", grade: "D", age: 26 },
    { name: "Jathan McMahon", grade: "D", age: 23 },
    { name: "Cathal O'Connell", grade: "D", age: 31 },
    { name: "David Fitzgerald", grade: "D", age: 24, note: "Club panel — not the Inagh-Kilnamona county man" },
    { name: "Ger Powell", grade: "D", age: 29 },
    { name: "Kieran Galvin", grade: "D", age: 26 },
    { name: "Daniel Moloney", grade: "D", age: 23 },
  ],
  "st-josephs": [
    { name: "David Conroy", grade: "B", age: 24, overallMin: 12, overallMax: 15, note: "Former Clare senior panellist" },
    { name: "Eoin McMahon", grade: "C", age: 21, overallMin: 11, overallMax: 14, note: "Clare U20" },
    { name: "Ian Williams", grade: "C", age: 21, overallMin: 10, overallMax: 14, note: "Clare U20" },
    { name: "Graham Ball", grade: "C", age: 19, overallMin: 12, overallMax: 15, note: "Clare minor; U20 All-Ireland winner 2026" },
    { name: "Oige Fanning", grade: "C", age: 20, overallMin: 12, overallMax: 15, note: "Clare minor All-Ireland winner 2023" },
    { name: "Conor Daly", grade: "C", age: 20, overallMin: 10, overallMax: 14, note: "Clare U20" },
    { name: "Mark O'Connor", grade: "C", age: 20, overallMin: 10, overallMax: 13, note: "Clare minor panel 2023" },
    { name: "Padraic O'Donovan", grade: "C", age: 20, overallMin: 10, overallMax: 13, note: "Clare minor panel 2023" },
    { name: "Thomas O'Connor", grade: "C", age: 19, overallMin: 12, overallMax: 15, note: "Clare U20 All-Ireland winner 2026" },
    { name: "Aaron Landy", grade: "D", age: 28 },
    { name: "Paddy Nagle", grade: "D", age: 29 },
    { name: "Darragh Nagle", grade: "D", age: 26 },
    { name: "Darragh Ball", grade: "D", age: 23 },
    { name: "Adam Mungovan", grade: "D", age: 25 },
    { name: "Eoin Lahiffe", grade: "D", age: 24 },
    { name: "Eoin Burke", grade: "D", age: 27 },
    { name: "Francie Meaney", grade: "D", age: 30 },
    { name: "Cathal McMahon", grade: "D", age: 26 },
    { name: "Joe Mannion", grade: "D", age: 24 },
  ],
  "eire-og": [
    { name: "Shane O'Donnell", grade: "A", age: 32, overallMin: 18, overallMax: 19, note: "Current Clare senior — All-Star forward" },
    { name: "David Reidy", grade: "A", age: 33, overallMin: 15, overallMax: 17, note: "Current Clare senior" },
    { name: "Darren O'Brien", grade: "A", age: 24, overallMin: 15, overallMax: 16, note: "Current Clare senior" },
    { name: "Danny Russell", grade: "B", age: 29, overallMin: 13, overallMax: 16, note: "Former Clare senior" },
    { name: "Aaron Fitzgerald", grade: "B", age: 28, overallMin: 12, overallMax: 15, note: "Former Clare senior panellist" },
    { name: "Fionan Treacy", grade: "C", age: 21, overallMin: 11, overallMax: 14, note: "Clare U20" },
    { name: "Robert Loftus", grade: "C", age: 21, overallMin: 12, overallMax: 15, note: "Clare U20 All-Ireland winner 2026" },
    { name: "Darren Moroney", grade: "C", age: 21, overallMin: 11, overallMax: 14, note: "Clare U20" },
    { name: "Marco Cleary", grade: "C", age: 20, overallMin: 12, overallMax: 15, note: "Clare U20 All-Ireland winner 2026" },
    { name: "Luca Cleary", grade: "C", age: 22, overallMin: 11, overallMax: 14, note: "Clare underage" },
    { name: "Conor Perrill", grade: "C", age: 20, overallMin: 10, overallMax: 13, note: "Clare minor panel 2023" },
    { name: "Darragh Stack", grade: "D", age: 29 },
    { name: "Ciaran Russell", grade: "D", age: 31 },
    { name: "Jarlath Collins", grade: "D", age: 27 },
    { name: "Oran Cahill", grade: "D", age: 24 },
    { name: "David McNamara", grade: "D", age: 26 },
    { name: "Tom Kavanagh", grade: "D", age: 25 },
    { name: "James O'Dwyer", grade: "D", age: 24 },
    { name: "Rian Mulcahy", grade: "D", age: 23 },
    { name: "Luke Vaughan", grade: "D", age: 22 },
    { name: "Liam Corry", grade: "D", age: 26 },
  ],
  crusheen: [
    { name: "Donal Tuohy", grade: "B", age: 38, overallMin: 13, overallMax: 16, note: "Former Clare senior goalkeeper" },
    { name: "Cian Dillon", grade: "B", age: 37, overallMin: 13, overallMax: 16, note: "Former Clare senior; 2013 All-Ireland winner" },
    { name: "Conor O'Donnell", grade: "B", age: 29, overallMin: 12, overallMax: 15, note: "Former Clare panellist" },
    { name: "Ciaran O'Doherty", grade: "D", age: 28 },
    { name: "Gavin O'Brien", grade: "D", age: 27 },
    { name: "Tadhg Deen", grade: "D", age: 24 },
    { name: "Cillein Mullins", grade: "D", age: 23 },
    { name: "Diarmuid Mullins", grade: "D", age: 26 },
    { name: "Eanna McMahon", grade: "D", age: 25 },
    { name: "James O'Sullivan", grade: "D", age: 27 },
    { name: "Luke Ketalaar", grade: "D", age: 24 },
    { name: "Oisin O'Donnell", grade: "D", age: 23 },
    { name: "Rian O'Donnell", grade: "D", age: 22 },
    { name: "Jamie Fitzgibbon", grade: "D", age: 25 },
    { name: "Breffni Horner", grade: "D", age: 26 },
    { name: "Fergus Kennedy", grade: "D", age: 29 },
    { name: "John O'Sullivan", grade: "D", age: 28 },
  ],
  scariff: [
    { name: "Mark Rodgers", grade: "A", age: 24, overallMin: 16, overallMax: 18, note: "Current Clare senior full-forward" },
    { name: "Patrick Crotty", grade: "B", age: 24, overallMin: 13, overallMax: 16, note: "Former Clare senior, dropped ahead of 2026" },
    { name: "Keelan Hartigan", grade: "B", age: 23, overallMin: 12, overallMax: 15, note: "Former Clare senior panellist; U20 in 2023" },
    { name: "Paul Rodgers", grade: "C", age: 20, overallMin: 12, overallMax: 15, note: "Clare U20 All-Ireland winner 2026" },
    { name: "Scott Cairns", grade: "C", age: 21, overallMin: 10, overallMax: 14, note: "Clare U20" },
    { name: "Liam Crotty", grade: "C", age: 21, overallMin: 10, overallMax: 14, note: "Clare U20" },
    { name: "William Kavanagh", grade: "D", age: 29 },
    { name: "Daniel Treacy", grade: "D", age: 27 },
    { name: "Seamus McCaul", grade: "D", age: 28 },
    { name: "Shane Kavanagh", grade: "D", age: 26 },
    { name: "Matthew Crotty", grade: "D", age: 27 },
    { name: "Conor Downes", grade: "D", age: 25 },
    { name: "Seanie Hartigan", grade: "D", age: 24 },
    { name: "Sean Hartigan", grade: "D", age: 24 },
    { name: "Michael Barrett", grade: "D", age: 26 },
    { name: "Rossa Keehan", grade: "D", age: 23 },
    { name: "Patrick Ryan", grade: "D", age: 25 },
    { name: "Cathal McCaul", grade: "D", age: 26 },
    { name: "Patrick Nugent", grade: "D", age: 24 },
    { name: "Luke Madden", grade: "D", age: 22 },
    { name: "Rory Ryan", grade: "D", age: 23 },
    { name: "Diarmaid Nash", grade: "D", age: 27 },
  ],
  broadford: [
    { name: "Niall O'Farrell", grade: "A", age: 21, overallMin: 15, overallMax: 16, note: "Current Clare senior, from the U20s" },
    { name: "Paddy Donnellan", grade: "B", age: 24, overallMin: 12, overallMax: 15, note: "Former Clare senior panellist" },
    { name: "Eoghan Gunning", grade: "C", age: 20, overallMin: 13, overallMax: 15, note: "Clare minor All-Ireland captain 2023; U20 captain" },
    { name: "Jack Lovett", grade: "D", age: 27 },
    { name: "Cormac Gunning", grade: "D", age: 25 },
    { name: "Darragh Whelan", grade: "D", age: 26 },
    { name: "Cian Mulqueen", grade: "D", age: 24 },
    { name: "Davy Boland", grade: "D", age: 28 },
    { name: "Cathal Chaplin", grade: "D", age: 26 },
    { name: "Diarmuid O'Brien", grade: "D", age: 25 },
    { name: "Darren Chaplin", grade: "D", age: 27 },
    { name: "Michael Vaughan", grade: "D", age: 24 },
    { name: "Oisin Kavanagh", grade: "D", age: 23 },
    { name: "Donie Whelan", grade: "D", age: 29 },
    { name: "Diarmuid Whelan", grade: "D", age: 27 },
    { name: "Shane Taylor", grade: "D", age: 24 },
    { name: "Stiofan McMahon", grade: "D", age: 23 },
    { name: "Craig Chaplin", grade: "D", age: 22 },
  ],
  "clooney-quin": [
    { name: "Peter Duggan", grade: "A", age: 32, overallMin: 17, overallMax: 19, note: "Current Clare senior — All-Star forward" },
    { name: "Ryan Taylor", grade: "A", age: 26, overallMin: 15, overallMax: 17, note: "Current Clare senior" },
    { name: "Jack O'Neill", grade: "A", age: 21, overallMin: 15, overallMax: 16, note: "Current Clare senior; U20 leader" },
    { name: "John Cahill", grade: "C", age: 21, overallMin: 12, overallMax: 15, note: "Clare U20 captain" },
    { name: "Evan Maxted", grade: "C", age: 21, overallMin: 10, overallMax: 14, note: "Clare U20" },
    { name: "Dannan Fox", grade: "C", age: 20, overallMin: 11, overallMax: 14, note: "Clare U20" },
    { name: "Keith Hogan", grade: "D", age: 28 },
    { name: "John Conneally", grade: "D", age: 29 },
    { name: "Seán McNamara", grade: "D", age: 26 },
    { name: "Darragh Keogh", grade: "D", age: 25 },
    { name: "Conor Grogan", grade: "D", age: 27 },
    { name: "Matthew Corbett", grade: "D", age: 24 },
    { name: "Jerry O'Connor", grade: "D", age: 23 },
    { name: "Callum Hassett", grade: "D", age: 24 },
    { name: "Darragh McNamara", grade: "D", age: 25 },
    { name: "Sam Scanlan", grade: "D", age: 23 },
    { name: "Patrick Finnernan", grade: "D", age: 26 },
    { name: "Martin Duggan", grade: "D", age: 30 },
    { name: "Ulick O'Sullivan", grade: "D", age: 24 },
    { name: "David Considine", grade: "D", age: 27 },
  ],
  cratloe: [
    { name: "Diarmuid Ryan", grade: "A", age: 27, overallMin: 16, overallMax: 17, note: "Current Clare senior half-back" },
    { name: "Jamie Moylan", grade: "A", age: 21, overallMin: 15, overallMax: 16, note: "Current Clare senior; minor All-Ireland 2023" },
    { name: "Conor McGrath", grade: "B", age: 34, overallMin: 13, overallMax: 16, note: "Former Clare senior; 2013 All-Ireland winner" },
    { name: "Podge Collins", grade: "B", age: 34, overallMin: 13, overallMax: 16, note: "Former Clare senior; 2013 All-Ireland winner" },
    { name: "Rian Considine", grade: "B", age: 26, overallMin: 13, overallMax: 16, note: "Former Clare senior panellist" },
    { name: "Conor Ryan", grade: "B", age: 35, overallMin: 12, overallMax: 15, note: "Former Clare senior; 2013 All-Ireland winner" },
    { name: "Daire Neville", grade: "C", age: 20, overallMin: 10, overallMax: 14, note: "Clare minor panel 2023" },
    { name: "Marc O'Brien", grade: "C", age: 20, overallMin: 12, overallMax: 15, note: "Clare minor All-Ireland winner 2023" },
    { name: "Tadhg Lohan", grade: "C", age: 20, overallMin: 10, overallMax: 14, note: "Clare U20" },
    { name: "Eoin Deegan", grade: "D", age: 28 },
    { name: "Cathal Lohan", grade: "D", age: 26 },
    { name: "Shane Gleeson", grade: "D", age: 27 },
    { name: "David Collins", grade: "D", age: 32 },
    { name: "Enda Boyce", grade: "D", age: 25 },
    { name: "Riain McNamara", grade: "D", age: 24 },
    { name: "John Flanagan", grade: "D", age: 26 },
  ],
  feakle: [
    { name: "Eibhear Quilligan", grade: "A", age: 28, overallMin: 15, overallMax: 17, note: "Current Clare senior goalkeeper" },
    { name: "Adam Hogan", grade: "A", age: 24, overallMin: 15, overallMax: 17, note: "Current Clare senior corner-back" },
    { name: "Shane McGrath", grade: "B", age: 37, overallMin: 13, overallMax: 16, note: "Former Clare senior" },
    { name: "Con Smyth", grade: "B", age: 26, overallMin: 12, overallMax: 15, note: "Former Clare senior panellist; 2024 county champion" },
    { name: "Ronan O'Connor", grade: "C", age: 21, overallMin: 11, overallMax: 14, note: "Clare U20" },
    { name: "Oisin O'Connor", grade: "C", age: 20, overallMin: 10, overallMax: 14, note: "Clare U20" },
    { name: "Oisin Clune", grade: "D", age: 25 },
    { name: "Enda Madden", grade: "D", age: 28 },
    { name: "Killian Bane", grade: "D", age: 26 },
    { name: "Eoin Tuohy", grade: "D", age: 27 },
    { name: "Enda Noonan", grade: "D", age: 29 },
    { name: "Steven Conway", grade: "D", age: 24 },
    { name: "Packie Daly", grade: "D", age: 26 },
    { name: "Owen McGann", grade: "D", age: 25 },
    { name: "Martin Daly", grade: "D", age: 30 },
    { name: "Evan McMahon", grade: "D", age: 23 },
    { name: "Diarmuid Bane", grade: "D", age: 24 },
    { name: "Eoghan Daly", grade: "D", age: 23 },
    { name: "Gary Guilfoyle", grade: "D", age: 27 },
    { name: "Oisin Donnellan", grade: "D", age: 24 },
  ],
  "ocallaghans-mills": [
    { name: "Aidan Fawl", grade: "A", age: 21, overallMin: 15, overallMax: 16, note: "Current Clare senior" },
    { name: "Conor Cooney", grade: "B", age: 28, overallMin: 12, overallMax: 15, note: "Former Clare underage / senior development" },
    { name: "Seán Boyce", grade: "C", age: 20, overallMin: 12, overallMax: 15, note: "Clare minor 2023; U20 All-Ireland winner 2026" },
    { name: "Darragh Moroney", grade: "C", age: 21, overallMin: 10, overallMax: 14, note: "Clare U20" },
    { name: "Killian Nugent", grade: "D", age: 27 },
    { name: "Niall Melody", grade: "D", age: 26 },
    { name: "Ciaran Cooney", grade: "D", age: 25 },
    { name: "Seán Cotter", grade: "D", age: 24 },
    { name: "Aidan O'Gorman", grade: "D", age: 27 },
    { name: "Fionn Hickey", grade: "D", age: 23 },
    { name: "Cormac Murphy", grade: "D", age: 25 },
    { name: "Jacob Loughnane", grade: "D", age: 24 },
    { name: "Conor Henry", grade: "D", age: 26 },
    { name: "Colm Cleary", grade: "D", age: 28 },
    { name: "Liam Murphy", grade: "D", age: 27 },
    { name: "Bryan Donnellan", grade: "D", age: 29 },
    { name: "Keith Donnellan", grade: "D", age: 26 },
    { name: "Colin Crehan", grade: "D", age: 30 },
    { name: "Mark Pewter", grade: "D", age: 24 },
    { name: "Stephen Donnellan", grade: "D", age: 32, overallMin: 10, overallMax: 12, note: "Club veteran; related to former Clare captain Patrick Donnellan" },
    { name: "Cathal McNamara", grade: "D", age: 25 },
  ],
  kilmaley: [
    { name: "Conor Cleary", grade: "A", age: 31, overallMin: 15, overallMax: 17, note: "Current Clare senior full-back" },
    { name: "Daire Keane", grade: "B", age: 28, overallMin: 12, overallMax: 15, note: "Former Clare senior panellist" },
    { name: "Tom O'Rourke", grade: "B", age: 27, overallMin: 12, overallMax: 15 },
    { name: "Sean O'Loughlin", grade: "B", age: 26, overallMin: 12, overallMax: 15 },
    { name: "Joe Casey", grade: "C", age: 21, overallMin: 11, overallMax: 14, note: "Clare minor 2023; U20" },
    { name: "Bryan O'Loughlin", grade: "D", age: 29 },
    { name: "Colin Carmody", grade: "D", age: 27 },
    { name: "Colin McGuane", grade: "D", age: 28 },
    { name: "Oisin Looney", grade: "D", age: 24 },
    { name: "Aidan McGuane", grade: "D", age: 26 },
    { name: "Mikey O'Malley", grade: "D", age: 25 },
    { name: "Tommy Barry", grade: "D", age: 27 },
    { name: "Mikey O'Neill", grade: "D", age: 24 },
    { name: "Cian Moloney", grade: "D", age: 23 },
    { name: "Sean Kennedy", grade: "D", age: 25 },
    { name: "Colm Killeen", grade: "D", age: 26 },
    { name: "Brian McNamara", grade: "D", age: 28 },
    { name: "James Fitzpatrick", grade: "D", age: 24 },
    { name: "Joe Carmody", grade: "D", age: 23 },
    { name: "Eanna McMahon", grade: "D", age: 25 },
  ],
  newmarket: [
    { name: "Adam Enright", grade: "C", age: 21, overallMin: 10, overallMax: 14, note: "Clare U20" },
    { name: "Seán Arthur", grade: "C", age: 20, overallMin: 12, overallMax: 15, note: "Clare minor All-Ireland winner 2023; U20" },
    { name: "Michael Power", grade: "C", age: 20, overallMin: 11, overallMax: 14, note: "Clare minor All-Ireland winner 2023; U20" },
    { name: "Mark Delaney", grade: "D", age: 27 },
    { name: "Jack Enright", grade: "D", age: 25 },
    { name: "Stephen Casey", grade: "D", age: 28 },
    { name: "Evan Crimmins", grade: "D", age: 24 },
    { name: "Eanna Crimmins", grade: "D", age: 26 },
    { name: "Shane Lynch", grade: "D", age: 27 },
    { name: "Liam O'Connor", grade: "D", age: 25 },
    { name: "Dara McInerney", grade: "D", age: 24 },
    { name: "John Fehilly", grade: "D", age: 26 },
    { name: "Colin Guilfoyle", grade: "D", age: 29 },
    { name: "Eoin Hayes", grade: "D", age: 23 },
    { name: "Peter Power", grade: "D", age: 27 },
    { name: "Eoin Guilfoyle", grade: "D", age: 25 },
  ],
  "wolfe-tones": [
    { name: "Rory Hayes", grade: "A", age: 28, overallMin: 15, overallMax: 17, note: "Current Clare senior corner-back" },
    { name: "Darragh Lohan", grade: "A", age: 24, overallMin: 15, overallMax: 16, note: "Current Clare senior" },
    { name: "Daithi Lohan", grade: "A", age: 22, overallMin: 15, overallMax: 16, note: "Current Clare senior" },
    { name: "Aron Shanagher", grade: "B", age: 28, overallMin: 13, overallMax: 16, note: "Former Clare senior" },
    { name: "Aaron Cunningham", grade: "B", age: 33, overallMin: 13, overallMax: 16, note: "Former Clare senior; 2013 All-Ireland winner" },
    { name: "Sam Meaney", grade: "C", age: 21, overallMin: 10, overallMax: 14, note: "Clare U20" },
    { name: "Oisin O'Rourke", grade: "D", age: 26 },
    { name: "Brian Murphy", grade: "D", age: 27 },
    { name: "Liam Murphy", grade: "D", age: 25 },
    { name: "Evan O'Gorman", grade: "D", age: 24 },
    { name: "John Guilfoyle", grade: "D", age: 26 },
    { name: "Ben O'Gorman", grade: "D", age: 23 },
    { name: "Sean Murphy", grade: "D", age: 25 },
    { name: "Cian O'Rourke", grade: "D", age: 24 },
    { name: "Dean Devanney", grade: "D", age: 27 },
    { name: "Jack Cunningham", grade: "D", age: 23 },
    { name: "Dylan Frawley", grade: "D", age: 24 },
    { name: "Gavin Carrig", grade: "D", age: 22 },
    { name: "Colin Riordan", grade: "D", age: 26 },
  ],
  sixmilebridge: [
    { name: "Cathal Malone", grade: "A", age: 33, overallMin: 15, overallMax: 17, note: "Current Clare senior" },
    { name: "Mark Sheedy", grade: "A", age: 20, overallMin: 15, overallMax: 16, note: "Current Clare senior; minor All-Ireland winner 2023; U20 keeper" },
    { name: "Seadna Morey", grade: "B", age: 33, overallMin: 13, overallMax: 16, note: "Former Clare senior; retired from the county in 2025" },
    { name: "Shane Golden", grade: "B", age: 33, overallMin: 12, overallMax: 15, note: "Former Clare senior" },
    { name: "Jamie Shanahan", grade: "B", age: 29, overallMin: 13, overallMax: 16, note: "Former Clare senior" },
    { name: "Fiachra Ó Braoin", grade: "C", age: 20, overallMin: 11, overallMax: 14, note: "Clare U20" },
    { name: "Matthew O'Halloran", grade: "C", age: 20, overallMin: 12, overallMax: 15, note: "Clare minor All-Ireland winner 2023; U20" },
    { name: "Mattie O'Halloran", grade: "C", age: 20, overallMin: 12, overallMax: 15, note: "Clare minor All-Ireland winner 2023; U20" },
    { name: "Dara Fitzgerald", grade: "C", age: 20, overallMin: 10, overallMax: 14, note: "Clare U20" },
    { name: "Noel Purcell", grade: "D", age: 28 },
    { name: "Pa Mulready", grade: "D", age: 27 },
    { name: "Paidi Fitzpatrick", grade: "D", age: 25 },
    { name: "Lorcan Fitzpatrick", grade: "D", age: 24 },
    { name: "Conor Deasy", grade: "D", age: 26 },
    { name: "Luke O'Halloran", grade: "D", age: 23 },
    { name: "David Kennedy", grade: "D", age: 27 },
    { name: "Brian Corry", grade: "D", age: 25 },
    { name: "Sean Macnamara", grade: "D", age: 24 },
    { name: "Zak Phelan", grade: "D", age: 22 },
    { name: "Alan Mulready", grade: "D", age: 26 },
    { name: "Calum Phelan", grade: "D", age: 21 },
    { name: "Cathal Lynch", grade: "D", age: 25 },
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
    overallMin: listing.overallMin ?? band.min,
    overallMax: listing.overallMax ?? band.max,
    note: listing.note ?? band.note,
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
  if (panel) {
    return { grade: "D", age, overallMin: 5, overallMax: 10, note: GRADE_BAND.D.note };
  }
  return { grade: "D", age, overallMin: 6, overallMax: 12, note: GRADE_BAND.D.note };
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
