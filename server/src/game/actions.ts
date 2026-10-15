/** Player actions. Every rule is validated here — the client is never trusted. */
import { randomInt } from 'node:crypto';
import {
  BOOT_MINUTES,
  COFFEE_RUSH_COUNTDOWN_MS,
  COFFEE_RUSH_PAY_WINDOW_MS,
  COFFEE_RUSH_SHIFT_MS,
  ENERGY_COST,
  FRESH_PASTE,
  FESTIVALS,
  FRIENDSHIP,
  GIFT_REPLIES,
  HARVEST_NIGHT_SELL_BONUS,
  MINIGAMES,
  SCRAP_SET_BONUS,
  NPCS,
  POWER_UPGRADES,
  SCREWDRIVER_REPAIR,
  SHOPS,
  SHOP_REPAIR_BASE,
  STAGES,
  TUTORIAL_SLOT,
  WEATHER_INFO,
  calendar,
  canInstall,
  canSleep,
  festivalToday,
  friendshipLevel,
  getItem,
  giftReaction,
  isCoolingUnit,
  isFood,
  isFrame,
  isRigActive,
  isShopOpen,
  kaiSpeed,
  marketQuote,
  maxShopRarityForStage,
  newRig,
  partSlotOf,
  playCoffeeRush,
  powerUpgradeDiscount,
  rarityRank,
  repairDiscount,
  rigSpeed,
  scrapFind,
  scrapSpotsFor,
  seeded,
  shopPrice,
  shopStock,
  slotAt,
  stageDef,
  findQuest,
  tooEarlyToSleepText,
  type GameAction,
  type NpcId,
  type ShopContext,
  type ShopId,
} from '@rig-valley/shared';
import { fail } from '../errors.js';
import { harvestRig } from './harvest.js';
import {
  addCoins,
  addEnergy,
  addFriendship,
  addItem,
  findRig,
  itemQty,
  requireTool,
  spendCoins,
  spendEnergy,
  takeItem,
  tileOccupied,
  toast,
  type EngineCtx,
} from './helpers.js';
import {
  activeRigCount,
  onStageUnlocked,
  questDone,
  refreshQuests,
  signalQuests,
} from './quests.js';
import { sleep } from './overnight.js';
import { nextRigId, type FarmState } from './state.js';

/** Timer jitter allowed between the player's browser and the server. */
const RUSH_CLOCK_SLACK_MS = 750;
/** The browser's clock can run a few game minutes ahead of the server's: don't refuse bed over it. */
const BEDTIME_GRACE_MINUTES = 10;

function shopCtx(s: FarmState): ShopContext {
  return { stage: s.farm.stage, friendship: Object.fromEntries(s.relations) };
}

function requireOpen(s: FarmState, shopId: ShopId): void {
  const shop = SHOPS[shopId];
  const cal = calendar(s.farm.day);
  if (!isShopOpen(shop, s.farm.minute, cal.weekdayIndex)) {
    fail('closed', `The ${shop.name} is closed right now.`);
  }
}

function requireSlot(s: FarmState, x: number, y: number) {
  const slot = slotAt(x, y);
  if (!slot) fail('bad_tile', "You can't place that here.");
  if (slot.field.stage > s.farm.stage) fail('locked', `${slot.field.name} isn't unlocked yet.`);
  return slot;
}

/** Advance the tutorial when its conditions are met (MASTERPLAN §5.6). */
export function advanceTutorial(s: FarmState): void {
  const f = s.farm;
  const tut = s.rigs.find((r) => r.x === TUTORIAL_SLOT.x && r.y === TUTORIAL_SLOT.y);
  const checks: (() => boolean)[] = [
    () => s.mail.some((m) => m.templateId === 'ray_welcome' && m.read),
    () => f.flags.boxOpened,
    () => !!tut?.cpuId,
    () => !!tut?.powered,
    () => !!tut && tut.dust <= 0,
    () => f.flags.tutorialSlept,
    () => f.harvestCount >= 1,
  ];
  while (f.tutorialStep < checks.length && checks[f.tutorialStep]!()) f.tutorialStep++;
}

export async function applyAction(s: FarmState, ctx: EngineCtx, a: GameAction): Promise<void> {
  const f = s.farm;
  switch (a.type) {
    // ------------------------------------------------------------------ tutorial
    case 'open_box': {
      if (f.flags.boxOpened) fail('empty', 'The box is empty. Just a few cat hairs.');
      f.flags.boxOpened = true;
      addItem(s, 'cpu_common', 1);
      addItem(s, 'cloth', 1);
      addItem(s, 'screwdriver', 1);
      addItem(s, 'thermal_paste', 1);
      toast(
        ctx,
        'You found a Pebble CPU, a Cleaning Cloth, a Screwdriver and some Thermal Paste!',
        'good',
      );
      break;
    }

    // ------------------------------------------------------------------ rigs
    case 'build_rig': {
      const slot = requireSlot(s, a.x, a.y);
      if (tileOccupied(s, a.x, a.y)) fail('occupied', 'Something is already in that spot.');
      const frame = getItem(a.frameId);
      if (!isFrame(frame)) fail('bad_item', 'You need a rig frame to build a rig.');
      const max = stageDef(f.stage).maxRigs;
      if (s.rigs.length >= max)
        fail('max_rigs', `You can have ${max} rigs right now. Unlock more space to build more.`);
      takeItem(s, a.frameId, 1);
      spendEnergy(s, ENERGY_COST.build);
      const rig = newRig(await nextRigId(ctx.q), a.x, a.y, a.frameId);
      s.rigs.push(rig);
      toast(ctx, `New rig built in the ${slot.field.name}!`, 'good');
      break;
    }
    case 'remove_rig': {
      const rig = findRig(s, a.rigId);
      if (rig.tutorial && f.tutorialStep < 7)
        fail('tutorial', "Uncle Ray's old rig stays put for now.");
      for (const part of [rig.cpuId, rig.coolerId, rig.psuId, rig.frameId])
        if (part) addItem(s, part, 1);
      s.rigs = s.rigs.filter((r) => r.id !== rig.id);
      toast(ctx, 'Rig taken apart. All parts went back to your bag.');
      break;
    }
    case 'install': {
      const rig = findRig(s, a.rigId);
      const item = getItem(a.itemId);
      if (!item) fail('bad_item', "That item doesn't exist.");
      const check = canInstall(rig, item);
      if (!check.ok) fail('incompatible', check.reason);
      const slotName = partSlotOf(item)!;
      takeItem(s, a.itemId, 1);
      spendEnergy(s, ENERGY_COST.install);
      const field = slotName === 'cpu' ? 'cpuId' : slotName === 'cooler' ? 'coolerId' : 'psuId';
      const old = rig[field];
      if (old) addItem(s, old, 1);
      rig[field] = a.itemId;
      if (slotName === 'cpu' && old && old !== a.itemId) rig.progress = 0;
      toast(ctx, `${item.name} installed.`, 'good');
      break;
    }
    case 'uninstall': {
      const rig = findRig(s, a.rigId);
      const field = a.slot === 'cpu' ? 'cpuId' : a.slot === 'cooler' ? 'coolerId' : 'psuId';
      const old = rig[field];
      if (!old) fail('empty', 'That slot is already empty.');
      addItem(s, old, 1);
      rig[field] = null;
      if (a.slot === 'cpu') {
        rig.powered = false;
        rig.bootRemaining = 0;
        rig.progress = 0;
      }
      toast(ctx, `${getItem(old)?.name ?? 'Part'} removed.`);
      break;
    }
    case 'swap_frame': {
      const rig = findRig(s, a.rigId);
      const frame = getItem(a.frameId);
      if (!isFrame(frame)) fail('bad_item', "That isn't a rig frame.");
      for (const part of [rig.cpuId, rig.coolerId, rig.psuId]) {
        const p = part ? getItem(part) : undefined;
        if (p?.rarity && rarityRank(p.rarity) > rarityRank(frame.maxRarity)) {
          fail('incompatible', `The ${p.name} doesn't fit in a ${frame.name}. Remove it first.`);
        }
      }
      takeItem(s, a.frameId, 1);
      spendEnergy(s, ENERGY_COST.install);
      addItem(s, rig.frameId, 1);
      rig.frameId = a.frameId;
      toast(ctx, `Moved the rig into a ${frame.name}.`, 'good');
      break;
    }
    case 'power': {
      const rig = findRig(s, a.rigId);
      if (a.on) {
        if (!rig.cpuId) fail('no_cpu', 'Install a CPU first.');
        if (rig.condition <= 0) fail('broken', 'This rig is broken. Repair it first.');
        if (rig.overheat)
          fail('overheat', 'Too hot! Clean, repaste or repair it before switching it back on.');
        if (f.flags.powerCut)
          fail(
            'power_cut',
            `Vera cut your power over the unpaid bill. Pay the ${f.flags.billDebt.toLocaleString('en-US')} Coins you owe at the Power Substation first.`,
          );
        if (rig.powered) break;
        rig.powered = true;
        rig.bootRemaining = BOOT_MINUTES;
        toast(ctx, 'Rig switched on. Booting…');
      } else {
        rig.powered = false;
        rig.bootRemaining = 0;
        toast(ctx, 'Rig switched off.');
      }
      break;
    }
    case 'clean': {
      const rig = findRig(s, a.rigId);
      requireTool(s, 'cloth', 'You need a Cleaning Cloth. Mia sells them.');
      if (rig.dust <= 0 && !rig.overheat) fail('clean', 'This rig is already spotless.');
      spendEnergy(s, ENERGY_COST.clean);
      rig.dust = 0;
      rig.overheat = false;
      toast(ctx, 'Dust wiped off. The fans sound happier.', 'good');
      signalQuests(s, ctx, { type: 'clean' });
      break;
    }
    case 'repaste': {
      const rig = findRig(s, a.rigId);
      if (!rig.cpuId) fail('no_cpu', 'There is no CPU to put paste on.');
      if (rig.paste >= FRESH_PASTE && !rig.overheat)
        fail('fresh', 'The paste on this rig is still fresh.');
      takeItem(s, 'thermal_paste', 1, 'You need Thermal Paste. Mia and Dex sell it.');
      spendEnergy(s, ENERGY_COST.repaste);
      rig.paste = 100;
      rig.overheat = false;
      toast(ctx, 'Fresh thermal paste applied.', 'good');
      signalQuests(s, ctx, { type: 'repaste' });
      break;
    }
    case 'repair': {
      const rig = findRig(s, a.rigId);
      requireTool(s, 'screwdriver', 'You need a Screwdriver. Or ask Dex at the Repair Shop.');
      if (rig.condition >= 100 && !rig.overheat) fail('healthy', 'This rig is in perfect shape.');
      spendEnergy(s, ENERGY_COST.repair);
      rig.condition = Math.min(100, rig.condition + SCREWDRIVER_REPAIR);
      rig.overheat = false;
      toast(ctx, `Repaired! Health is now ${Math.round(rig.condition)}%.`, 'good');
      break;
    }
    case 'claim': {
      const rig = findRig(s, a.rigId);
      await harvestRig(s, ctx, rig);
      break;
    }
    case 'paint_rig': {
      const rig = findRig(s, a.rigId);
      const item = getItem(a.itemId);
      if (item?.type !== 'paint' || !item.value) fail('bad_item', "That isn't rig paint.");
      takeItem(s, a.itemId, 1);
      rig.paint = item.value as typeof rig.paint;
      toast(ctx, `Rig painted ${item.value}. Looking sharp!`, 'good');
      break;
    }
    case 'place_cooling': {
      requireSlot(s, a.x, a.y);
      if (tileOccupied(s, a.x, a.y)) fail('occupied', 'Something is already in that spot.');
      const item = getItem(a.itemId);
      if (!isCoolingUnit(item)) fail('bad_item', "That isn't a cooling unit.");
      takeItem(s, a.itemId, 1);
      s.coolingUnits.push({ x: a.x, y: a.y, itemId: a.itemId });
      toast(ctx, `${item.name} placed. Rigs around it will run cooler.`, 'good');
      break;
    }
    case 'pickup_cooling': {
      const cu = s.coolingUnits.find((c) => c.x === a.x && c.y === a.y);
      if (!cu) fail('empty', 'There is no cooling unit there.');
      s.coolingUnits = s.coolingUnits.filter((c) => c !== cu);
      addItem(s, cu.itemId, 1);
      toast(ctx, 'Cooling unit picked up.');
      break;
    }
    case 'place_decor': {
      requireSlot(s, a.x, a.y);
      if (tileOccupied(s, a.x, a.y)) fail('occupied', 'Something is already in that spot.');
      const item = getItem(a.itemId);
      if (item?.type !== 'decor') fail('bad_item', "That isn't a decoration.");
      takeItem(s, a.itemId, 1);
      s.decor.push({ x: a.x, y: a.y, itemId: a.itemId });
      toast(ctx, `${item.name} placed.`, 'good');
      break;
    }
    case 'pickup_decor': {
      const d = s.decor.find((c) => c.x === a.x && c.y === a.y);
      if (!d) fail('empty', 'There is no decoration there.');
      s.decor = s.decor.filter((c) => c !== d);
      addItem(s, d.itemId, 1);
      toast(ctx, 'Decoration picked up.');
      break;
    }

    // ------------------------------------------------------------------ daily life
    case 'sleep': {
      if (!canSleep(f.day, f.minute + BEDTIME_GRACE_MINUTES, f.energy))
        fail('too_early', tooEarlyToSleepText());
      sleep(s, ctx, false);
      break;
    }
    case 'eat': {
      const item = getItem(a.itemId);
      if (!isFood(item)) fail('bad_item', "You can't eat that. Probably.");
      takeItem(s, a.itemId, 1);
      const gained = addEnergy(s, item.energy);
      toast(ctx, `${item.name}: +${gained} Energy.`, 'good');
      break;
    }
    case 'free_coffee': {
      if (friendshipLevel(s.relations.get('bo') ?? 0) < 5)
        fail('no_perk', 'Bo only does free coffee for best friends.');
      requireOpen(s, 'cafe');
      if (f.flags.daily.freeCoffee) fail('done', 'You already had your free coffee today.');
      f.flags.daily.freeCoffee = true;
      const gained = addEnergy(s, 20);
      toast(ctx, `Bo's coffee on the house: +${gained} Energy.`, 'good');
      break;
    }
    case 'set_hat': {
      if (!f.flags.ownedHats.includes(a.hat)) fail('no_hat', "You don't own that hat yet.");
      f.character = { ...f.character, hat: a.hat };
      break;
    }

    // ------------------------------------------------------------------ shops
    case 'buy': {
      if (a.shopId === 'market') fail('bad_shop', 'Use the Market Board to buy there.');
      requireOpen(s, a.shopId);
      const qty = Math.max(1, Math.min(99, Math.floor(a.qty)));
      const ctxShop = shopCtx(s);
      const item = shopStock(a.shopId, ctxShop).find((i) => i.id === a.itemId);
      if (!item) fail('not_sold', "That isn't for sale here.");
      if (item.type === 'outfit' && f.flags.ownedHats.includes(item.value as never))
        fail('owned', 'You already own that.');
      let unit = shopPrice(item, a.shopId, ctxShop);
      if (f.flags.rareRestockDay === f.day && item.rarity === 'rare') unit = Math.round(unit * 0.8);
      const total = unit * (item.type === 'outfit' ? 1 : qty);
      spendCoins(s, total, `buy:${item.id}`);
      addItem(s, item.id, item.type === 'outfit' ? 1 : qty);
      toast(
        ctx,
        `Bought ${qty > 1 && item.type !== 'outfit' ? `${qty}× ` : ''}${item.name} for ${total.toLocaleString('en-US')} Coins.`,
        'good',
      );
      break;
    }
    case 'market_buy': {
      const qty = Math.max(1, Math.min(99, Math.floor(a.qty)));
      const cal = calendar(f.day);
      const item = getItem(a.itemId);
      const quote = marketQuote(ctx.config.market, a.itemId, f.day, cal.season);
      if (!item || !quote) fail('not_sold', "That isn't on the Market Board.");
      if (item.rarity && rarityRank(item.rarity) > rarityRank(maxShopRarityForStage(f.stage))) {
        fail('locked', 'That part is too advanced for your garage right now.');
      }
      if (isCoolingUnit(item) && item.stage > f.stage)
        fail('locked', 'That cooling unit is too advanced for your garage right now.');
      spendCoins(s, quote.buy * qty, `market_buy:${item.id}`);
      addItem(s, item.id, qty);
      toast(
        ctx,
        `Bought ${qty}× ${item.name} for ${(quote.buy * qty).toLocaleString('en-US')} Coins.`,
        'good',
      );
      break;
    }
    case 'sell': {
      const qty = Math.max(1, Math.min(999, Math.floor(a.qty)));
      const cal = calendar(f.day);
      const quote = marketQuote(ctx.config.market, a.itemId, f.day, cal.season);
      const item = getItem(a.itemId);
      if (!item || !quote) fail('not_buying', "The Market Board doesn't buy that.");
      takeItem(s, a.itemId, qty);
      const bonus =
        festivalToday(cal.season, cal.dayOfSeason)?.id === 'harvest_night'
          ? HARVEST_NIGHT_SELL_BONUS
          : 1;
      const total = Math.round(quote.sell * bonus) * qty;
      addCoins(s, total, `sell:${item.id}`);
      toast(ctx, `Sold ${qty}× ${item.name} for ${total.toLocaleString('en-US')} Coins.`, 'good');
      break;
    }
    case 'shop_repair': {
      requireOpen(s, 'repair');
      const rig = findRig(s, a.rigId);
      if (rig.condition >= 100 && !rig.overheat)
        fail('healthy', 'Dex says this rig is in perfect shape.');
      const cost = Math.round(
        SHOP_REPAIR_BASE * (1 + (100 - rig.condition) / 100) * repairDiscount(shopCtx(s)),
      );
      spendCoins(s, cost, `shop_repair:rig${rig.id}`);
      rig.condition = 100;
      rig.overheat = false;
      rig.dust = 0;
      toast(ctx, `Dex fixed the rig up like new for ${cost} Coins.`, 'good');
      break;
    }
    case 'power_upgrade': {
      requireOpen(s, 'substation');
      const up = POWER_UPGRADES.find((u) => u.id === a.upgradeId);
      if (!up) fail('bad_upgrade', "That upgrade doesn't exist.");
      if (f.powerUpgrades.includes(up.id)) fail('owned', 'You already have that upgrade.');
      if (f.stage < up.stage)
        fail('locked', 'Vera says your place is too small for that one. Grow first.');
      if (up.requires && !f.powerUpgrades.includes(up.requires)) {
        fail('locked', `You need ${POWER_UPGRADES.find((u) => u.id === up.requires)?.name} first.`);
      }
      const cost = Math.round(up.cost * powerUpgradeDiscount(shopCtx(s)));
      spendCoins(s, cost, `power:${up.id}`);
      f.powerUpgrades.push(up.id);
      toast(ctx, `${up.name} installed! +${up.watts} W capacity.`, 'good');
      break;
    }
    case 'pay_bill': {
      requireOpen(s, 'substation');
      const owed = f.flags.billDebt;
      if (owed <= 0) fail('no_debt', "You don't owe Vera anything. She's almost disappointed.");
      const pay = Math.min(owed, Math.max(0, f.coins));
      if (pay <= 0)
        fail('no_coins', `You owe ${owed.toLocaleString('en-US')} Coins but have none.`);
      addCoins(s, -pay, 'power_bill_debt');
      f.flags.billDebt = owed - pay;
      if (f.flags.billDebt > 0) {
        toast(
          ctx,
          `Paid ${pay.toLocaleString('en-US')} Coins. You still owe Vera ${f.flags.billDebt.toLocaleString('en-US')}.`,
          'info',
        );
        break;
      }
      f.flags.unpaidBills = 0;
      if (f.flags.powerCut) {
        f.flags.powerCut = false;
        toast(ctx, 'Bill paid off! Your power is back on — switch your rigs on again.', 'good');
      } else toast(ctx, 'Bill paid off. Vera gives you an approving nod.', 'good');
      break;
    }

    // ------------------------------------------------------------------ NPCs
    case 'talk': {
      const npc = NPCS[a.npc];
      if (!npc) fail('bad_npc', 'Nobody by that name here.');
      const level = friendshipLevel(s.relations.get(a.npc) ?? 0);
      const lines = npc.lines.filter((l) => l.level <= level);
      let text =
        lines[Math.floor(seeded('line', f.id, f.day, a.npc) * lines.length)]?.text ?? 'Hi!';
      if (a.npc === 'bo' && level >= 1)
        text += ` Oh, and word is: ${WEATHER_INFO[f.weatherTomorrow].forecast}`;
      if (f.flags.daily.talked.includes(a.npc)) {
        text = lines[lines.length - 1]?.text ?? text;
      } else {
        f.flags.daily.talked.push(a.npc);
        addFriendship(s, ctx, a.npc, FRIENDSHIP.chat);
      }
      ctx.events.push({ kind: 'dialogue', npc: a.npc, text });
      signalQuests(s, ctx, { type: 'talk', npc: a.npc });
      break;
    }
    case 'gift': {
      const npc = NPCS[a.npc];
      if (!npc) fail('bad_npc', 'Nobody by that name here.');
      if (f.flags.daily.gifted.includes(a.npc))
        fail('gifted', `You already gave ${npc.name} a gift today.`);
      const item = getItem(a.itemId);
      if (!item || (item.type !== 'gift' && item.type !== 'food'))
        fail('bad_item', "That doesn't make a great gift.");
      takeItem(s, a.itemId, 1);
      f.flags.daily.gifted.push(a.npc);
      const reaction = giftReaction(npc, a.itemId);
      const points = {
        loved: FRIENDSHIP.giftLoved,
        liked: FRIENDSHIP.giftLiked,
        neutral: FRIENDSHIP.giftNeutral,
        disliked: FRIENDSHIP.giftDisliked,
      }[reaction];
      addFriendship(s, ctx, a.npc, points);
      ctx.events.push({ kind: 'dialogue', npc: a.npc, text: GIFT_REPLIES[reaction] });
      break;
    }
    case 'deliver': {
      const q = s.quests.find((x) => x.questId === a.questId && x.state === 'active');
      const def = q ? findQuest(q.questId, f.id) : undefined;
      if (!q || !def) fail('no_quest', "You don't have that job.");
      let delivered = 0;
      def.goals.forEach((g, i) => {
        if (g.type !== 'deliver' || g.npc !== a.npc) return;
        const need = g.qty - (q.progress[i] ?? 0);
        const give = Math.min(need, itemQty(s, g.itemId));
        if (give <= 0) return;
        takeItem(s, g.itemId, give);
        q.progress[i] = (q.progress[i] ?? 0) + give;
        delivered += give;
      });
      if (delivered === 0) fail('nothing', "You don't have anything they need for that job.");
      toast(
        ctx,
        `Delivered ${delivered} item${delivered > 1 ? 's' : ''} to ${NPCS[a.npc as NpcId].name}.`,
        'good',
      );
      break;
    }

    // ------------------------------------------------------------------ mail
    case 'read_mail': {
      const m = s.mail.find((x) => x.id === a.mailId);
      if (!m) fail('no_mail', 'That letter is gone.');
      m.read = true;
      break;
    }
    case 'delete_mail': {
      const m = s.mail.find((x) => x.id === a.mailId);
      if (!m) fail('no_mail', 'That letter is gone.');
      s.mail = s.mail.filter((x) => x !== m);
      s.deletedMail.push(m.id);
      break;
    }

    // ------------------------------------------------------------------ progression
    case 'unlock_stage': {
      const def = STAGES.find((st) => st.stage === a.stage);
      if (!def || a.stage !== f.stage + 1) fail('bad_stage', "You can't unlock that yet.");
      if (def.quest && !questDone(s, def.quest))
        fail('quest', `Finish "${findQuest(def.quest, f.id)?.title}" first.`);
      if (activeRigCount(s) < def.activeRigs)
        fail('rigs', `You need ${def.activeRigs} rigs running at the same time.`);
      if (def.keyItem) takeItem(s, def.keyItem, 1, `You need a ${getItem(def.keyItem)?.name}.`);
      spendCoins(s, def.cost, `stage:${def.stage}`);
      f.stage = def.stage;
      ctx.events.push({ kind: 'stage', stage: def.stage, name: def.name });
      const extra: Record<number, string> = {
        2: 'The backyard has room for plenty more rigs.',
        3: 'Rigs at the warehouse bay are cooled by the river.',
        4: 'The cats moved into their new bed. The drones are yours now. They keep the data center rigs clean.',
      };
      s.newMail.push({
        templateId: 'ray_stage_done',
        params: { place: def.name, extra: extra[def.stage] ?? '' },
      });
      onStageUnlocked(s, def.stage);
      break;
    }

    // ------------------------------------------------------------------ fun
    case 'minigame_start': {
      const game = MINIGAMES[a.game];
      requireOpen(s, 'cafe');
      if (f.flags.daily.minigame)
        fail('done', 'Bo says one shift a day is plenty. Come back tomorrow!');
      spendEnergy(s, game.energy);
      f.flags.daily.minigame = true;
      // The orders come from this seed; the server replays the shift from the key log.
      f.flags.daily.rush = { seed: randomInt(1, 2 ** 31), startedAt: ctx.now, done: false };
      break;
    }
    case 'minigame': {
      const game = MINIGAMES[a.game];
      const rush = f.flags.daily.rush;
      if (!rush || rush.done) fail('no_shift', 'Talk to Bo at the café to start a shift first.');
      if (ctx.now - rush.startedAt > COFFEE_RUSH_PAY_WINDOW_MS)
        fail('shift_over', 'That shift is long over — Bo covered for you. Come back tomorrow!');
      const presses = a.presses;
      for (let i = 1; i < presses.length; i++) {
        if (presses[i]![1] < presses[i - 1]![1])
          fail('bad_shift', "Bo couldn't read that order slip.");
      }
      // Every press needs real time to have happened: the countdown plus the shift so far.
      const lastAt = presses.length
        ? Math.min(presses[presses.length - 1]![1], COFFEE_RUSH_SHIFT_MS)
        : 0;
      if (ctx.now - rush.startedAt < COFFEE_RUSH_COUNTDOWN_MS + lastAt - RUSH_CLOCK_SLACK_MS)
        fail('bad_shift', "Bo didn't see you make those drinks. Try finishing the shift again.");
      rush.done = true;
      const { score, perfect } = playCoffeeRush(rush.seed, presses);
      const pay = score * game.coinsPerPoint;
      const tip = perfect * game.tipPerPerfect;
      if (pay + tip > 0) addCoins(s, pay + tip, 'minigame:coffee_rush');
      addFriendship(s, ctx, 'bo', score >= 8 ? 10 : 4);
      toast(
        ctx,
        `Coffee Rush: ${score}/${game.maxScore} orders. Bo paid you ${pay} Coins${tip ? ` + ${tip} in tips` : ''}.`,
        'good',
      );
      break;
    }
    case 'scavenge': {
      const today = scrapSpotsFor(f.id, f.day);
      const done = (f.flags.daily.scavenged ??= []);
      if (!today.includes(a.spot) || done.includes(a.spot))
        fail('gone', 'Nothing shiny here anymore.');
      done.push(a.spot);
      const find = scrapFind(f.id, f.day, a.spot);
      let text: string;
      if ('coins' in find) {
        addCoins(s, find.coins, 'scavenge');
        text = `Found ${find.coins} Coins in the grass!`;
      } else {
        addItem(s, find.itemId, find.qty);
        const name = getItem(find.itemId)?.name ?? find.itemId;
        text = `Found ${find.qty > 1 ? `${find.qty}× ` : ''}${name}!`;
      }
      if (today.every((i) => done.includes(i))) {
        addCoins(s, SCRAP_SET_BONUS, 'scavenge:set');
        text += ` That's every shiny spot today — +${SCRAP_SET_BONUS} Coins bonus!`;
      }
      toast(ctx, text, 'good');
      break;
    }
    case 'festival_join': {
      const cal = calendar(f.day);
      const fest = festivalToday(cal.season, cal.dayOfSeason);
      if (!fest) fail('no_festival', 'There is no festival today.');
      if (f.flags.daily.festival) fail('done', 'You already joined today. Enjoy the festival!');
      const def = FESTIVALS[cal.season];
      const running = s.rigs.filter((r) => r.cpuId);
      let won = false;
      let line = '';
      if (def.id === 'spring_fair') {
        const score = running.length
          ? running.reduce((t, r) => t + (100 - r.dust) * 0.5 + r.condition * 0.5, 0) /
            running.length
          : 0;
        won = running.length >= 2 && score >= 80;
        line = `Your field scored ${Math.round(score)} points for tidiness.`;
      } else if (def.id === 'cooldown_festival') {
        const active = s.rigs.filter(isRigActive);
        const avg = active.length ? active.reduce((t, r) => t + r.temp, 0) / active.length : 99;
        won = active.length >= 2 && avg <= 60;
        line = `Your rigs average ${Math.round(avg)}°C.`;
      } else if (def.id === 'harvest_night') {
        won = true;
        line = 'Everyone gets a lantern at Harvest Night!';
      } else {
        const giftId = a.giftItemId;
        const gift = giftId ? getItem(giftId) : undefined;
        if (!giftId || gift?.type !== 'gift')
          fail('need_gift', 'Bring any gift for the gift swap!');
        takeItem(s, giftId, 1);
        won = true;
        line = 'You swapped gifts with a stranger in a scarf.';
        if (!f.flags.ownedHats.includes('crown') && seeded('glow', f.id, f.day) < 0.5) {
          f.flags.daily.festival = true;
          addItem(s, 'hat_crown', 1);
          toast(ctx, `${line} You got a Glow Crown!`, 'good');
          break;
        }
      }
      f.flags.daily.festival = true;
      if (won) {
        addItem(s, def.prize, 1);
        toast(ctx, `${line} You won a ${getItem(def.prize)?.name}!`, 'good');
      } else {
        addItem(s, def.consolation.itemId, def.consolation.qty);
        toast(
          ctx,
          `${line} Not this time — here's ${def.consolation.qty}× ${getItem(def.consolation.itemId)?.name} for joining.`,
          'info',
        );
      }
      break;
    }
    case 'speed_race': {
      const cal = calendar(f.day);
      if (!festivalToday(cal.season, cal.dayOfSeason))
        fail('no_festival', 'Kai only races at festivals.');
      if (friendshipLevel(s.relations.get('kai') ?? 0) < 2)
        fail('no_perk', "Kai doesn't think you're worth racing. Yet.");
      if (f.flags.daily.race) fail('done', 'One race per festival. Kai needs to cool down.');
      f.flags.daily.race = true;
      const mine = s.rigs.filter(isRigActive).reduce((t, r) => t + rigSpeed(r), 0);
      const kai = kaiSpeed(f.day);
      if (mine > kai) {
        if (!f.flags.raceWon) {
          f.flags.raceWon = true;
          addItem(s, 'decor_trophy', 1);
        } else addCoins(s, 100, 'speed_race');
        addFriendship(s, ctx, 'kai', 20);
        ctx.events.push({
          kind: 'dialogue',
          npc: 'kai',
          text: `Speed ${mine.toFixed(1)} vs my ${kai.toFixed(1)}?! Rematch next festival. Take your prize.`,
        });
      } else {
        addItem(s, 'cookie', 1);
        addFriendship(s, ctx, 'kai', 8);
        ctx.events.push({
          kind: 'dialogue',
          npc: 'kai',
          text: `Speed ${mine.toFixed(1)} vs my ${kai.toFixed(1)}. Better luck next time. Have a cookie.`,
        });
      }
      break;
    }
  }
  advanceTutorial(s);
  refreshQuests(s, ctx);
}
