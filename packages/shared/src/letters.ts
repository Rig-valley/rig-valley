/**
 * Mailbox letters. The server stores `{ templateId, params }`; text is
 * rendered from these templates so all copy lives in one English source.
 */

export type LetterParams = Record<string, string | number>;

export interface Letter {
  from: string;
  subject: string;
  body: string;
}

type Template = (p: LetterParams) => Letter;

const T: Record<string, Template> = {
  ray_welcome: () => ({
    from: 'Uncle Ray',
    subject: 'The garage is yours',
    body:
      "Kid, the garage is yours now. Don't let the cats near the big building on the hill.\n\n" +
      "There's a box by the garage door with an old CPU, a cloth and my lucky screwdriver. " +
      'Put the CPU in the rig, switch it on, wipe the dust off and get some sleep. ' +
      'Rigs are like tomatoes: they grow while you snooze.\n\n— Ray\n\nP.S. Feed the cats. They will not thank you.',
  }),
  mia_invite: () => ({
    from: 'Mia, Hardware Store',
    subject: 'Come to town',
    body:
      "Heard Ray's rig is humming again. Come into town and say hi. I sell parts, Bo sells coffee, Dex fixes what you break.\n\n" +
      'Quick tips, because nobody gave Ray any:\n' +
      '• Coins are for buying stuff in town. Rigs pay Coins every harvest.\n' +
      '• Rigs also pay a tiny bit of NVDA stock. It piles up in your Rewards.\n' +
      '• Save up $5 and send it to your wallet anytime. The Withdraw bar shows how close you are.\n\n— Mia',
  }),
  ray_room_to_grow: () => ({
    from: 'Uncle Ray',
    subject: 'Room to grow',
    body:
      'Not bad, kid. One rig is a hobby. Three rigs is a farm.\n\nGet three rigs running at the same time and the old fence out back can come down. ' +
      'The gate sign has the details.\n\n— Ray\n\nP.S. Mind the Power. The breaker in that garage has a temper.',
  }),
  ray_cold_river: () => ({
    from: 'Uncle Ray',
    subject: 'The cold river',
    body:
      'The river by the old warehouse is ice-cold all year. Rigs next to it run cooler. Free cooling, kid!\n\n' +
      "Get 8 rigs going and make friends with Dex. He knows the warehouse owner. I owe him money, so don't mention me.\n\n— Ray",
  }),
  ray_cats: () => ({
    from: 'Uncle Ray',
    subject: 'About the cats',
    body:
      'Okay. Confession. The building on the hill is a data center. My data center. It is full of warm rigs. The cats found it.\n\n' +
      'They will only move if you get them something warmer: a Heated Cat Bed. Mia sells them. Get 15 rigs running and the place is yours.\n\n— Ray',
  }),
  ray_legend: () => ({
    from: 'Uncle Ray',
    subject: 'Look at you',
    body: "Data center's running, the cats are happy, and the whole valley hums. One last thing: 25 rigs at once. Do it and you're a Valley Legend.\n\n— Ray",
  }),
  ray_stage_done: (p) => ({
    from: 'Uncle Ray',
    subject: `${p.place} unlocked!`,
    body: `You did it, kid. ${p.place} is yours now. ${p.extra ?? ''}\n\n— Ray`,
  }),
  daily_quest: (p) => ({
    from: 'Town Board',
    subject: `Today's job: ${p.title}`,
    body: `${p.description}\n\nReward: ${p.reward}. This job expires tonight.`,
  }),
  power_bill: (p) => ({
    from: 'Vera, Power Substation',
    subject: 'Your weekly power bill',
    body: `You used ${p.kwh} kWh this week. That's ${p.coins} Coins, paid automatically.${Number(p.unpaid) > 0 ? ` You were short ${p.unpaid} Coins, so I added it to next week. Don't make me come up there.` : ' Thanks for paying on time!'}\n\n— Vera`,
  }),
  breaker_tripped: (p) => ({
    from: 'Vera, Power Substation',
    subject: 'Your breaker tripped',
    body: `Your rigs pulled ${p.draw} W but your garage only handles ${p.capacity} W. The breaker tripped and everything stopped for the night.\n\nTurn off a rig or buy a Power upgrade from me. It resets every morning.\n\n— Vera`,
  }),
  outage: (p) => ({
    from: 'Vera, Power Substation',
    subject: 'Power outage last night',
    body: `The ${p.weather} knocked out the lines last night. Your rigs took a nap. Everything is back on now.\n\n— Vera`,
  }),
  weather_tip: (p) => ({
    from: "Bo, Miner's Café",
    subject: 'Weather gossip',
    body: `Psst. ${p.forecast}\n\n— Bo`,
  }),
  rel_quest: (p) => ({
    from: String(p.from),
    subject: String(p.title),
    body: `${p.description}\n\n— ${p.signature}`,
  }),
  perk_gift: (p) => ({
    from: String(p.from),
    subject: String(p.subject),
    body: `${p.body}\n\nYou received: ${p.item}.`,
  }),
  event_news: (p) => ({
    from: 'Town Board',
    subject: `${p.name} today!`,
    body: `${p.description}\n\nCome to the town square today and talk to the event stand.`,
  }),
  rare_restock: () => ({
    from: 'Mia, Hardware Store',
    subject: 'Psst. Rare stuff.',
    body: 'Rare parts came in this morning. 20% off today only, for you. Do not tell Kai.\n\n— Mia',
  }),
  passed_out: (p) => ({
    from: "Bo, Miner's Café",
    subject: 'You fell asleep standing up',
    body: `Found you snoring next to a rig at 2 AM. Dragged you home. The taxi was ${p.fee} Coins. You're welcome.\n\n— Bo`,
  }),
  withdraw_done: (p) => ({
    from: 'Rig Valley',
    subject: 'Withdrawal sent',
    body: `${p.amount} NVDA is on its way to your wallet. You can see it on the explorer from your Rewards screen.`,
  }),
};

export function renderLetter(templateId: string, params: LetterParams = {}): Letter {
  const t = T[templateId];
  if (!t) return { from: 'Rig Valley', subject: 'A letter', body: '' };
  return t(params);
}

export const LETTER_TEMPLATES = Object.keys(T);
