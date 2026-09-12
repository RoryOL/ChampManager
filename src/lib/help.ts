export type HelpSection = {
  id: string;
  title: string;
  paragraphs: string[];
};

export const HELP_SECTIONS: HelpSection[] = [
  {
    id: "squad",
    title: "Squad",
    paragraphs: [
      "Tap a row for the full card. Team changes are on Tactics. Other clubs are on the Table tab.",
      "Green and red on a rating are training lifts from his natural number. Training can lift a stat a little (up to +2), and the work slows once a rating is already high. Work one area hard and neglected stats can drift. Small lifts stack even when the card still shows the same integer.",
      "Younger players take the work better and get match fitness back quicker; veterans feel the legs longer. Workrate, composure and ability under pressure do not change in training. Teamwork rises when the same lads play together.",
      "Gassed means match fitness is on the floor: tackling, shooting and first touch are well down, he is more liable to concede frees, and a knock is more likely until you recover. Injury keeps him out of the fifteen. A straight red misses the next match; two yellows in the one game do not carry a ban.",
    ],
  },
  {
    id: "tactics",
    title: "Tactics",
    paragraphs: [
      "The whole panel is available. Fifteen start; five substitutions on the day. Tap two names to compare who is better where, then Swap — the fifteen will not move until you confirm. Add attributes to the grid if you want more of the card in the list.",
      "Build-up: short passing through the lines on the left, direct long ball on the right. A running game needs acceleration and off-the-ball; a long ball is won with aerials, strength and high fielding. Spilled low balls are hunted with pace, first touch and off-the-ball. Vision from the back and midfield turns distribution into scoring looks. Ability under pressure tells in knockouts and the closing minutes. Full forwards who gather it, or who have a real pace edge on their man, get the look at goal.",
      "Puck-out: short to the full-back line on the left, long to a named midfielder or half-forward on the right.",
      "Aggression: light tackling on the left, aggressive on the right. Heavy hooks land more often, but you will give away frees and yellow cards, and match fitness drops faster.",
      "Pressure: sit off on the left, hunt every possession on the right. A high press wins more tackles and drains match fitness.",
      "Shot certainty: shoot on sight on the left, wait for a certain look on the right. Speculative shooting means more shots from distance and more wides; waiting should mean fewer, higher-percentage looks.",
      "Contain sits in and keeps shape. Attacking pushes up and leaves space behind. Traditional 6-2-6 puts six forwards in the scoring zone. A sweeper drops a seventh defender, leaving five forwards — goals become rare, those forwards cover more ground, and a send-off drops you back toward a conventional shape.",
      "Sitting in or sitting off the press keeps the score down. Fewer scores mean more randomness — the better side is less sure of the win.",
      "Long frees and 65s, and close-in frees, can be named. Sideline cuts are taken by whoever is nearest the ball.",
      "Defenders can track a named forward; midfielders can track a named midfielder. Marking, pace, strength, workrate and hooking all go toward shutting him down. A full-back on a half-forward pushes onto the half-back line and a half-back drops. In tactics you can assign anyone on the panel; on match day only the fifteen on the field are offered.",
      "The starting plan is a mid-block. Against a weaker defence, attacking and a more direct ball should outscore sitting in. Against a stronger attack, a sweeper and contain should cut the goals you concede. On Intercounty the other managers will not leave you that mid-block for free.",
    ],
  },
  {
    id: "updates",
    title: "Updates",
    paragraphs: [
      "On the Android app, Capture the Canon checks GitHub when you open it. If a newer APK is there, tap Update and Android installs it over this one. You do not need to download a zip from Actions. A save already on the phone is kept.",
      "The build number is in the top right. After an update it should match the new GitHub APK. The first update may ask you to allow installs from this app. After that, later GitHub builds should install in place while they share the same sideload key.",
    ],
  },
];
