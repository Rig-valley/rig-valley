/** Town NPCs (MASTERPLAN §11). All copy is English, light and funny, no jargon. */

export type NpcId = 'mia' | 'bo' | 'dex' | 'vera' | 'kai';
export const NPC_IDS: readonly NpcId[] = ['mia', 'bo', 'dex', 'vera', 'kai'];

export interface NpcDef {
  id: NpcId;
  name: string;
  role: string;
  shop?: ShopId;
  likes: string[];
  loves: string[];
  dislikes: string[];
  /** Perk unlocked at each friendship level (1..5). */
  perks: Partial<Record<1 | 2 | 3 | 4 | 5, string>>;
  /** Chat lines by minimum friendship level. */
  lines: { level: number; text: string }[];
}

export type ShopId = 'hardware' | 'cafe' | 'repair' | 'substation' | 'market';

export const FRIENDSHIP_PER_LEVEL = 100;
export const MAX_FRIENDSHIP_LEVEL = 5;
export const FRIENDSHIP = {
  chat: 10,
  giftLoved: 50,
  giftLiked: 30,
  giftNeutral: 12,
  giftDisliked: -10,
  quest: 40,
} as const;

export function friendshipLevel(points: number): number {
  return Math.max(0, Math.min(MAX_FRIENDSHIP_LEVEL, Math.floor(points / FRIENDSHIP_PER_LEVEL)));
}

export const NPCS: Record<NpcId, NpcDef> = {
  mia: {
    id: 'mia',
    name: 'Mia',
    role: 'Hardware Store owner',
    shop: 'hardware',
    loves: ['vintage_gpu'],
    likes: ['solder_kit', 'flowers'],
    dislikes: ['hot_sauce'],
    perks: {
      2: '10% off everything at the Hardware Store.',
      3: 'Mia writes to you when Rare parts are restocked.',
      4: '15% off everything at the Hardware Store.',
    },
    lines: [
      { level: 0, text: "You're Ray's kid? Hm. Don't put a fan in backwards like he did. Twice." },
      { level: 0, text: 'Everything here works. Mostly. Returns are not a thing.' },
      {
        level: 0,
        text: 'Cheap parts make cheap rigs. Expensive parts make broke farmers. Pick a lane.',
      },
      {
        level: 1,
        text: "Dust is a rig's worst enemy. Second worst is people who say 'it was fine yesterday'.",
      },
      { level: 2, text: "Fine. You're alright. Family discount, but tell no one." },
      { level: 3, text: "I'll write you when the good stuff comes in. Don't make it weird." },
      { level: 4, text: 'Ray would be proud. He would also try to steal your cooling units.' },
    ],
  },
  bo: {
    id: 'bo',
    name: 'Bo',
    role: "Miner's Café barista",
    shop: 'cafe',
    loves: ['lucky_charm'],
    likes: ['cookie', 'flowers', 'hot_sauce'],
    dislikes: ['battery_pack'],
    perks: {
      1: "Bo tells you tomorrow's weather when you chat.",
      3: '20% off at the café.',
      5: 'A free coffee every day. Just ask.',
    },
    lines: [
      { level: 0, text: "Welcome to the Miner's Café! The coffee is hot. The gossip is hotter." },
      {
        level: 0,
        text: "Kai says his rigs never overheat. Kai also says he's 'basically famous'.",
      },
      { level: 0, text: 'I put a rig under the counter once. Best warm croissants in the valley.' },
      {
        level: 1,
        text: 'Did you know Vera can hear a breaker trip from three streets away? True story. Probably.',
      },
      {
        level: 2,
        text: "Mia acts tough, but she named every fan in her shop. Don't tell her I told you.",
      },
      { level: 3, text: "You're officially a regular. Regulars get the good mugs." },
      { level: 5, text: 'Your usual? On the house. You keep this valley buzzing.' },
    ],
  },
  dex: {
    id: 'dex',
    name: 'Dex',
    role: 'Repair Shop mechanic',
    shop: 'repair',
    loves: ['solder_kit'],
    likes: ['battery_pack', 'vintage_gpu'],
    dislikes: ['flowers'],
    perks: {
      2: 'Repairs at the shop cost 25% less.',
      3: 'Dex shares the Cooling Unit Lv2 recipe early.',
      4: 'Dex shares the Cooling Unit Lv3 recipe early.',
    },
    lines: [
      { level: 0, text: "If it's broken, I fix it. If it's on fire, I fix it after." },
      { level: 0, text: 'Clean your rigs. Dust is basically a tiny blanket. Rigs hate blankets.' },
      { level: 0, text: 'Thermal paste is like sunscreen for chips. Reapply.' },
      { level: 1, text: "Rigs packed tight get hot. Give 'em room or give 'em a cooling unit." },
      { level: 2, text: "You're good people. Friends-and-family rate on repairs from now on." },
      {
        level: 3,
        text: "Here, I'll show you how I build the bigger cooling units. Keep it between us.",
      },
      { level: 4, text: 'Fine. The big one. Seven by seven. Try not to freeze the cats.' },
    ],
  },
  vera: {
    id: 'vera',
    name: 'Vera',
    role: 'Runs the Power Substation',
    shop: 'substation',
    loves: ['battery_pack'],
    likes: ['coffee', 'lucky_charm'],
    dislikes: ['cookie'],
    perks: {
      2: 'Power upgrades cost 15% less.',
      3: 'Vera asks for help with an outage. (Quest)',
      4: 'Power bills are 20% smaller.',
    },
    lines: [
      { level: 0, text: 'Too many rigs on one line and the breaker trips. Every. Single. Time.' },
      { level: 0, text: 'Power capacity is like a cup. Do not pour a lake into a cup.' },
      { level: 0, text: 'Storms knock out lines. I fix them. Then I complain. In that order.' },
      { level: 1, text: "You read your power bill? You'd be surprised how many people don't." },
      { level: 2, text: 'I can get you a better rate on upgrades. Paperwork is my love language.' },
      { level: 3, text: 'Got a minute? The north line keeps dropping and I could use a hand.' },
      { level: 4, text: 'Consider your account flagged as "good human". Bills are cheaper now.' },
    ],
  },
  kai: {
    id: 'kai',
    name: 'Kai',
    role: 'Rival miner with a bigger garage',
    loves: ['hot_sauce'],
    likes: ['vintage_gpu', 'cookie'],
    dislikes: ['flowers', 'solder_kit'],
    perks: {
      2: 'Kai challenges you to Speed races at festivals.',
      3: 'Kai becomes your friend and gifts you Gold Rig Paint.',
      5: 'Kai gives you his old Glacier Loop cooler.',
    },
    lines: [
      { level: 0, text: "Oh, you're the new garage kid. Cute rigs. Mine are bigger." },
      { level: 0, text: 'My garage has two floors. One is just for fans.' },
      { level: 0, text: "Speed isn't everything. It's just the only thing." },
      { level: 1, text: "Your field looks... okay. Don't let it go to your head." },
      { level: 2, text: "Next festival, you and me. Speed race. Loser buys Bo's croissants." },
      {
        level: 3,
        text: "Alright, alright. You're cool. Here, this paint looks better on your rigs anyway.",
      },
      { level: 5, text: "Best friend? Ugh. Fine. Yes. Take my old cooler, I've got three." },
    ],
  },
};

/** Gift reaction for an item. */
export function giftReaction(
  npc: NpcDef,
  itemId: string,
): 'loved' | 'liked' | 'neutral' | 'disliked' {
  if (npc.loves.includes(itemId)) return 'loved';
  if (npc.likes.includes(itemId)) return 'liked';
  if (npc.dislikes.includes(itemId)) return 'disliked';
  return 'neutral';
}

export const GIFT_REPLIES: Record<'loved' | 'liked' | 'neutral' | 'disliked', string> = {
  loved: 'No way! I love this. Seriously, thank you!',
  liked: "Oh, nice! That's really thoughtful.",
  neutral: 'Oh. Thanks! I will... find a place for it.',
  disliked: "Huh. Well. It's the thought that counts. I guess.",
};
