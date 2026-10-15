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
      "There's a box by the garage door with an old CPU, a cloth, a tube of thermal paste and my lucky screwdriver. " +
      'Put the CPU in the rig, switch it on, wipe the dust off and get some sleep. ' +
      'Rigs are like tomatoes: they grow while you snooze.\n\n— Ray\n\nP.S. The cats think the big building is theirs. We will talk about that later.',
  }),
  mia_invite: () => ({
    from: 'Mia, Hardware Store',
    subject: 'Come to town',
    body:
      "Heard Ray's rig is humming again. Come into town and say hi. I sell parts, Bo sells coffee, Dex fixes what you break.\n\n" +
      'Quick tips, because nobody gave Ray any:\n' +
      '• Coins are for buying stuff in town. Rigs pay Coins every harvest.\n' +
      '• Rigs also pay a tiny bit of NVDA (NVIDIA Stock Tokens). It piles up in your Rewards.\n' +
      '• Save up $5 and send it to your wallet. Brand-new farms wait a few days before their first withdrawal. The Withdraw bar shows how close you are.\n\n— Mia',
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
      'They will only move if you get them something warmer: a Heated Cat Bed. Mia sells them. Get 15 rigs running, then read the sign on the hill for the rest.\n\n— Ray',
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
  power_bill: (p) => {
    const unpaid = Number(p.unpaid);
    const carried = Number(p.carried ?? 0);
    const n = (x: number) => x.toLocaleString('en-US');
    const lines = [
      `You used ${p.kwh} kWh this week.${carried > 0 ? ` With the ${n(carried)} Coins you still owed, the bill comes to ${p.coins} Coins.` : ` That's ${p.coins} Coins.`}`,
    ];
    // cut: 1 = cut off this morning (a separate letter explains), 2 = still cut off.
    if (unpaid > 0 && Number(p.cut) === 1)
      lines.push(
        `It couldn't be paid in full again. You now owe me ${n(unpaid)} Coins, and that's two bills in a row — see my other letter.`,
      );
    else if (unpaid > 0 && Number(p.cut) === 2)
      lines.push(
        `Still not paid in full: you owe me ${n(unpaid)} Coins, and your power stays off until it's settled. Pay what you can at my Substation.`,
      );
    else if (unpaid > 0)
      lines.push(
        `I took what you had, but you're still ${n(unpaid)} Coins short. Pay it at my Substation anytime. If next week's bill can't be paid either, I cut your power until you settle up.`,
      );
    else lines.push('Paid automatically. Thanks for paying on time!');
    if (Number(p.restored) > 0)
      lines.push("You're all square again, so your power is back on. Switch your rigs on!");
    return {
      from: 'Vera, Power Substation',
      subject: 'Your weekly power bill',
      body: `${lines.join('\n\n')}\n\n— Vera`,
    };
  },
  power_cut: (p) => ({
    from: 'Vera, Power Substation',
    subject: 'Your power is cut off',
    body: `Two power bills in a row went unpaid, so I switched off your line. Your rigs stay off until you pay the ${p.owed} Coins you owe.\n\nCome to the Power Substation and pay what you can — once the bill is paid off, the power comes right back. Shiny scraps, Coffee Rush shifts and selling spare parts can help you catch up.\n\n— Vera`,
  }),
  breaker_tripped: (p) => ({
    from: 'Vera, Power Substation',
    subject: 'Your breaker tripped',
    body: `Your rigs pulled ${p.draw} W but your garage only handles ${p.capacity} W. The breaker tripped and everything stopped for the night.\n\nTurn off a rig or buy a Power upgrade from me. The breaker resets every morning.\n\n— Vera`,
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
    body: `Found you snoring next to a rig at 2 AM. Dragged you home. ${Number(p.fee) > 0 ? `The taxi was ${p.fee} Coins.` : "Your pockets were empty, so this one's on me."} You're welcome.\n\n— Bo`,
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
