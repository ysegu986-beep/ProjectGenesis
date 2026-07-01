const PHASES = ["マナ", "メイン", "アタック"];
const HUMAN = 0;
const CPU = 1;

const CIV_CLASS = {
  火: "fire",
  自然: "nature",
  水: "water",
  光: "light",
};

const CARD_USE_CANCELLED = new Error("CARD_USE_CANCELLED");

let cardDefs = [];
let deckDefs = [];
let state = null;
let uid = 1;
let humanDeckIndex = 0;

const els = {
  status: document.querySelector("#game-status"),
  scoreboard: document.querySelector("#scoreboard"),
  battlefield: document.querySelector("#battlefield"),
  fullLog: document.querySelector("#full-game-log"),
  newGame: document.querySelector("#new-game"),
  deckSelect: document.querySelector("#deck-select"),
  autoPay: document.querySelector("#auto-pay"),
  skipMana: document.querySelector("#skip-mana"),
  nextPhase: document.querySelector("#next-phase"),
  endTurn: document.querySelector("#end-turn"),
  expandLog: document.querySelector("#expand-log"),
  clearLog: document.querySelector("#clear-log"),
  logDialog: document.querySelector("#log-dialog"),
  dialog: document.querySelector("#choice-dialog"),
  choiceTitle: document.querySelector("#choice-title"),
  choiceList: document.querySelector("#choice-list"),
};

init();

async function init() {
  const [cardsRes, decksRes] = await Promise.all([
    fetch("/data/cards-v0.json"),
    fetch("/data/decks-v0.json"),
  ]);
  cardDefs = (await cardsRes.json()).cards;
  deckDefs = (await decksRes.json()).decks;

  els.newGame.addEventListener("click", startGame);
  els.deckSelect.addEventListener("change", () => {
    humanDeckIndex = Number(els.deckSelect.value);
    startGame();
  });
  els.autoPay.addEventListener("click", toggleAutoPay);
  els.skipMana.addEventListener("click", skipMana);
  els.nextPhase.addEventListener("click", nextPhase);
  els.endTurn.addEventListener("click", endHumanTurn);
  els.expandLog.addEventListener("click", () => {
    if (!state) return;
    renderLog();
    els.logDialog.showModal();
  });
  els.clearLog.addEventListener("click", () => {
    if (!state) return;
    state.log = [];
    render();
  });
  els.battlefield.addEventListener("click", handleBattlefieldClick);
  els.battlefield.addEventListener("dragstart", handleAttackDragStart);
  els.battlefield.addEventListener("dragover", handleAttackDragOver);
  els.battlefield.addEventListener("drop", handleAttackDrop);
  els.battlefield.addEventListener("dragend", handleAttackDragEnd);

  startGame();
}

function startGame() {
  uid = 1;
  const cpuDeckIndex = humanDeckIndex === 0 ? 1 : 0;
  state = {
    turn: 1,
    active: HUMAN,
    phaseIndex: 0,
    manaPlaced: false,
    winner: null,
    autoPay: false,
    busy: false,
    draggingAttack: null,
    pendingPayment: null,
    suppressAttackClick: false,
    eventMessage: "",
    flashUids: [],
    flashZones: [],
    log: [],
    players: [
      createPlayer("あなた", deckDefs[humanDeckIndex], false),
      createPlayer("CPU", deckDefs[cpuDeckIndex], true),
    ],
  };

  for (const player of state.players) {
    shuffle(player.deck);
    player.hand = drawMany(player, 5);
    player.shields = drawMany(player, 5);
  }

  setStarterOpeningHand(state.players[HUMAN], humanDeckIndex);
  setStarterOpeningHand(state.players[CPU], cpuDeckIndex);

  addLog(`対戦開始。あなたは${deckDefs[humanDeckIndex].name}、CPUは${deckDefs[cpuDeckIndex].name}。`);
  beginHumanTurn();
}

function setStarterOpeningHand(player, deckIndex) {
  const openingHands = [
    ["F-001", "F-001", "F-002", "N-001", "F-006"],
    ["L-002", "L-005", "W-002", "LS-001", "W-006"],
  ];
  setOpeningHand(player, openingHands[deckIndex] || []);
}

function createPlayer(label, deckDef, cpu) {
  const map = new Map(cardDefs.map((card) => [card.id, card]));
  const deck = [];
  for (const entry of deckDef.cards) {
    const def = map.get(entry.id);
    for (let i = 0; i < entry.count; i += 1) {
      deck.push(createCard(def));
    }
  }
  return {
    label,
    cpu,
    deckName: deckDef.name,
    deck,
    hand: [],
    shields: [],
    mana: [],
    battle: [],
    grave: [],
  };
}

function createCard(def) {
  return {
    ...def,
    uid: `c${uid++}`,
    tapped: false,
    asleep: false,
    tempPower: 0,
  };
}

function setOpeningHand(player, openingIds) {
  player.deck.push(...player.hand);
  player.hand = [];
  shuffle(player.deck);

  for (const id of openingIds) {
    const card = removeFirstById(player.deck, id);
    if (card) player.hand.push(card);
  }

  while (player.hand.length < 5) {
    const card = player.deck.shift();
    if (!card) break;
    player.hand.push(card);
  }

  shuffle(player.deck);
}

function removeFirstById(list, cardId) {
  const index = list.findIndex((card) => card.id === cardId);
  if (index < 0) return null;
  return list.splice(index, 1)[0];
}

function beginHumanTurn() {
  state.active = HUMAN;
  state.phaseIndex = 0;
  state.manaPlaced = false;
  startTurn(state.players[HUMAN]);
  setEvent("あなたのターン。手札から1枚マナに置こう。", { zones: ["human-hand"] });
  render();
}

function startTurn(player) {
  for (const card of [...player.mana, ...player.battle]) {
    card.tapped = false;
    card.asleep = false;
    card.tempPower = 0;
  }
  drawOne(player);
}

function phase() {
  return PHASES[state.phaseIndex];
}

function nextPhase() {
  if (!canHumanAct()) return;
  if (phase() === "マナ" && !state.manaPlaced && state.players[HUMAN].hand.length > 0) {
    setEvent("マナを置くか、上の「マナパス」でメインへ進めます。", { zones: ["human-hand"] });
    render();
    return;
  }
  if (phase() === "マナ") {
    state.phaseIndex = 1;
    setEvent("メインフェーズ。使えるカードが光ります。", { zones: ["human-hand"] });
  } else if (phase() === "メイン") {
    state.phaseIndex = 2;
    setEvent("アタックフェーズ。攻撃できるクリーチャーを選ぼう。", { zones: ["human-battle"] });
  } else {
    endHumanTurn();
    return;
  }
  render();
}

function skipMana() {
  if (!canHumanAct() || phase() !== "マナ" || state.manaPlaced) return;
  state.manaPlaced = true;
  state.phaseIndex = 1;
  setEvent("マナチャージをパスしてメインフェーズへ。", { zones: ["human-hand"] });
  render();
}

async function endHumanTurn() {
  if (!canHumanAct()) return;
  setEvent("あなたのターン終了。CPUが動きます。", { zones: ["cpu-area"] });
  render();
  await runCpuTurn();
}

async function runCpuTurn() {
  if (state.winner) return;
  state.busy = true;
  state.active = CPU;
  state.phaseIndex = 0;
  state.manaPlaced = false;
  startTurn(state.players[CPU]);
  setEvent("CPUのターン開始。", { zones: ["cpu-area"] });
  render();
  await pause(450);

  cpuPutMana();
  render();
  await pause(450);

  state.phaseIndex = 1;
  setEvent("CPU: メインフェーズ。", { zones: ["cpu-hand"] });
  render();
  await pause(300);

  for (let i = 0; i < 2; i += 1) {
    const played = await cpuPlayOneCard();
    if (!played) break;
    render();
    await pause(450);
  }

  state.phaseIndex = 2;
  setEvent("CPU: アタックフェーズ。", { zones: ["cpu-battle"] });
  render();
  await pause(300);

  for (const creature of [...state.players[CPU].battle]) {
    if (state.winner) break;
    if (!creature.tapped && !creature.asleep) {
      await performAttack(CPU, creature.uid, "player");
      render();
      await pause(500);
    }
  }

  state.busy = false;
  if (state.winner) {
    render();
    return;
  }

  if (state.active === CPU) state.turn += 1;
  beginHumanTurn();
}

function canHumanAct() {
  return state && !state.winner && !state.busy && state.active === HUMAN;
}

function toggleAutoPay() {
  if (!state || state.pendingPayment) return;
  state.autoPay = !state.autoPay;
  render();
}

async function handleBattlefieldClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target || !canHumanAct()) return;
  if (state.suppressAttackClick) {
    state.suppressAttackClick = false;
    return;
  }
  if (state.draggingAttack) return;

  const action = target.dataset.action;
  const uidValue = target.dataset.uid;

  if (state.pendingPayment) {
    if (action === "pay-mana") {
      selectPaymentMana(uidValue);
    }
    if (action === "cancel-payment") {
      cancelPayment();
    }
    return;
  }

  if (action === "mana") {
    putMana(HUMAN, uidValue);
  }
  if (action === "play") {
    playCard(HUMAN, uidValue);
  }
  if (action === "select-attacker") {
    if (phase() === "メイン") {
      state.phaseIndex = 2;
    }
    await performAttack(HUMAN, uidValue, "player");
    render();
  }
}

function handleAttackDragStart(event) {
  const card = event.target.closest("[data-drag-attack]");
  if (!card || !canHumanAct() || state.pendingPayment) return;
  state.draggingAttack = card.dataset.uid;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", card.dataset.uid);
}

function handleAttackDragOver(event) {
  if (!state?.draggingAttack) return;
  const target = event.target.closest("[data-drop-target]");
  if (!target) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
}

async function handleAttackDrop(event) {
  if (!state?.draggingAttack || !canHumanAct()) return;
  const target = event.target.closest("[data-drop-target]");
  if (!target) return;
  event.preventDefault();

  const attackerUid = event.dataTransfer.getData("text/plain") || state.draggingAttack;
  const targetUid = target.dataset.dropTarget === "creature" ? target.dataset.uid : "player";
  if (phase() === "メイン") {
    state.phaseIndex = 2;
  }
  await performAttack(HUMAN, attackerUid, targetUid);
  state.draggingAttack = null;
  state.suppressAttackClick = true;
  render();
}

function handleAttackDragEnd() {
  state.draggingAttack = null;
}

function putMana(playerIndex, uidValue) {
  const player = state.players[playerIndex];
  if (phase() !== "マナ" || state.manaPlaced) return;
  const card = removeByUid(player.hand, uidValue);
  if (!card) return;
  card.tapped = false;
  card.asleep = false;
  card.tempPower = 0;
  player.mana.push(card);
  state.manaPlaced = true;
  setEvent(`${player.label} は ${card.name} をマナに置いた。`, {
    uids: [card.uid],
    zones: [playerIndex === HUMAN ? "human-mana" : "cpu-mana"],
  });
  if (playerIndex === HUMAN) {
    state.phaseIndex = 1;
    setEvent("メインフェーズへ。使えるカードが光っています。", { zones: ["human-hand"] });
  }
  render();
}

function cpuPutMana() {
  const cpu = state.players[CPU];
  if (cpu.hand.length === 0) return;
  const card = [...cpu.hand].sort((a, b) => b.cost - a.cost)[0];
  removeByUid(cpu.hand, card.uid);
  cpu.mana.push(card);
  state.manaPlaced = true;
  setEvent(`CPUはカードを1枚マナに置いた。`, { zones: ["cpu-mana"], uids: [card.uid] });
}

async function cpuPlayOneCard() {
  const cpu = state.players[CPU];
  const playable = cpu.hand
    .filter((card) => canPayCost(cpu, card))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "クリーチャー" ? -1 : 1;
      return b.cost - a.cost;
    });
  if (playable.length === 0) return false;
  await playCard(CPU, playable[0].uid);
  return true;
}

async function playCard(playerIndex, uidValue) {
  const beforeUseState = playerIndex === HUMAN ? structuredClone(state) : null;
  const player = state.players[playerIndex];
  if (phase() !== "メイン") return false;
  const card = player.hand.find((candidate) => candidate.uid === uidValue);
  if (!card || !canPayCost(player, card)) return false;
  try {
    const paid = await payCost(playerIndex, card);
    if (!paid) return false;
    removeByUid(player.hand, uidValue);

    if (card.type === "クリーチャー") {
      card.tapped = false;
      card.asleep = !card.text.includes("スピードアタッカー");
      player.battle.push(card);
      setEvent(`${player.label} は ${card.name} を召喚した。`, {
        uids: [card.uid],
        zones: [playerIndex === HUMAN ? "human-battle" : "cpu-battle"],
      });
      await resolveEnterEffect(playerIndex, card);
    } else {
      setEvent(`${player.label} は ${card.name} を詠唱した。`, { uids: [card.uid] });
      await resolveSpell(playerIndex, card);
      card.tapped = false;
      card.asleep = false;
      card.tempPower = 0;
      player.grave.push(card);
    }
  } catch (error) {
    if (error === CARD_USE_CANCELLED && beforeUseState) {
      state = beforeUseState;
      setEvent("カード使用をキャンセルしました。", { zones: ["human-hand"] });
      render();
      return false;
    }
    throw error;
  }
  render();
  return true;
}

async function resolveEnterEffect(playerIndex, card) {
  const player = state.players[playerIndex];
  const opponent = state.players[1 - playerIndex];
  const isHuman = playerIndex === HUMAN;

  if (["F-003", "F-007"].includes(card.id)) {
    const candidates = opponent.battle.filter((item) => totalPower(item) <= 2000);
    const target = isHuman
      ? await chooseCard("破壊する相手クリーチャー", candidates, true)
      : weakest(candidates);
    if (target) destroyCreature(1 - playerIndex, target.uid);
  }
  if (card.id === "F-004") {
    const target = isHuman
      ? await chooseCard("パワーを上げる自分のクリーチャー", player.battle, true)
      : strongest(player.battle);
    if (target) {
      target.tempPower += 2000;
      setEvent(`${target.name} のパワーをこのターン中+2000。`, { uids: [target.uid] });
    }
  }
  if (card.id === "N-001") {
    const target = isHuman
      ? await chooseCard("追加でマナに置く手札", player.hand, true)
      : [...player.hand].sort((a, b) => b.cost - a.cost)[0];
    if (target) {
      removeByUid(player.hand, target.uid);
      player.mana.push(target);
      setEvent(`${player.label} は ${target.name} を追加でマナに置いた。`, {
        uids: [target.uid],
        zones: [isHuman ? "human-mana" : "cpu-mana"],
      });
    }
  }
  if (card.id === "N-004") {
    const top = player.deck.shift();
    if (top) {
      player.mana.push(top);
      setEvent(`${player.label} は山札の上から1枚をマナに置いた。`, {
        uids: [top.uid],
        zones: [isHuman ? "human-mana" : "cpu-mana"],
      });
    }
  }
  if (["W-002", "W-007"].includes(card.id)) {
    drawOne(player);
    const discard = [...player.hand].sort((a, b) => b.cost - a.cost)[0];
    if (discard) {
      removeByUid(player.hand, discard.uid);
      player.grave.push(discard);
      setEvent(`${player.label} は ${discard.name} を捨てた。`, { zones: [isHuman ? "human-grave" : "cpu-grave"] });
    }
  }
  if (card.id === "W-003") {
    const candidates = opponent.battle.filter((item) => item.cost <= 2);
    const target = isHuman
      ? await chooseCard("手札に戻す相手クリーチャー", candidates, true)
      : weakest(candidates);
    if (target) bounceCreature(1 - playerIndex, target.uid);
  }
  if (card.id === "W-004") {
    drawOne(player);
  }
  if (card.id === "W-006") {
    drawOne(player);
  }
  if (["L-003", "L-006"].includes(card.id)) {
    const candidates = opponent.battle.filter((item) => !item.tapped);
    const target = isHuman
      ? await chooseCard("タップする相手クリーチャー", candidates, true)
      : candidates[0];
    if (target) {
      target.tapped = true;
      setEvent(`${target.name} をタップした。`, { uids: [target.uid] });
    }
  }
  if (card.id === "L-005") {
    const top = player.deck.shift();
    if (top) {
      player.shields.push(top);
      setEvent(`${player.label} は山札の上から1枚をシールドに置いた。`, {
        zones: [isHuman ? "human-shields" : "cpu-shields"],
      });
    }
  }
}

async function resolveSpell(playerIndex, card) {
  const player = state.players[playerIndex];
  const opponent = state.players[1 - playerIndex];
  const isHuman = playerIndex === HUMAN;

  if (card.id === "FS-001") {
    const candidates = opponent.battle.filter((item) => totalPower(item) <= 3000);
    const target = isHuman
      ? await chooseCard("破壊する相手クリーチャー", candidates, false)
      : weakest(candidates);
    if (target) destroyCreature(1 - playerIndex, target.uid);
  }
  if (card.id === "FS-002") {
    const target = isHuman
      ? await chooseCard("パワーを上げる自分のクリーチャー", player.battle, false)
      : strongest(player.battle);
    if (target) {
      target.tempPower += 3000;
      setEvent(`${target.name} のパワーをこのターン中+3000。`, { uids: [target.uid] });
    }
  }
  if (["NS-001", "NS-002"].includes(card.id)) {
    const top = player.deck.shift();
    if (top) {
      player.mana.push(top);
      setEvent(`${player.label} は山札の上から1枚をマナに置いた。`, {
        uids: [top.uid],
        zones: [isHuman ? "human-mana" : "cpu-mana"],
      });
    }
  }
  if (card.id === "WS-001") {
    drawOne(player);
  }
  if (card.id === "WS-002") {
    const candidates = opponent.battle.filter((item) => item.cost <= 4);
    const target = isHuman
      ? await chooseCard("手札に戻す相手クリーチャー", candidates, false)
      : weakest(candidates);
    if (target) bounceCreature(1 - playerIndex, target.uid);
  }
  if (card.id === "LS-001") {
    const candidates = state.players[1 - playerIndex].battle.filter((item) => !item.tapped);
    const target = isHuman
      ? await chooseCard("タップする相手クリーチャー", candidates, false)
      : candidates[0];
    if (target) {
      target.tapped = true;
      setEvent(`${target.name} をタップした。`, { uids: [target.uid] });
    }
  }
  if (card.id === "LS-002") {
    const candidates = player.grave.filter((item) => item.type === "クリーチャー");
    const target = isHuman
      ? await chooseCard("手札に戻すクリーチャー", candidates, false)
      : candidates[0];
    if (target) {
      removeByUid(player.grave, target.uid);
      player.hand.push(target);
      setEvent(`${player.label} は ${target.name} を墓地から手札に戻した。`, {
        uids: [target.uid],
        zones: [isHuman ? "human-hand" : "cpu-hand"],
      });
    }
  }
  if (card.id === "LS-003") {
    const top = player.deck.shift();
    if (top) {
      player.shields.push(top);
      setEvent(`${player.label} は山札の上から1枚をシールドに置いた。`, {
        zones: [isHuman ? "human-shields" : "cpu-shields"],
      });
    }
  }
  if (card.id === "FS-003") {
    for (const creature of player.battle) {
      creature.tempPower += 1000;
    }
    setEvent(`${player.label} のクリーチャーすべてのパワーをこのターン中+1000。`, {
      uids: player.battle.map((creature) => creature.uid),
      zones: [isHuman ? "human-battle" : "cpu-battle"],
    });
  }
}

async function performAttack(attackerIndex, attackerUid, targetUid) {
  const attackerOwner = state.players[attackerIndex];
  const defenderOwner = state.players[1 - attackerIndex];
  const attacker = attackerOwner.battle.find((card) => card.uid === attackerUid);
  if (!attacker || attacker.tapped || attacker.asleep) return;

  attacker.tapped = true;

  if (targetUid === "player") {
    const blocker = await chooseBlocker(attackerIndex, attacker);
    if (blocker) {
      blocker.tapped = true;
      setEvent(`${defenderOwner.label} の ${blocker.name} がブロック。`, { uids: [blocker.uid, attacker.uid] });
      battleCreatures(attackerIndex, attacker, 1 - attackerIndex, blocker);
      return;
    }
    attackPlayer(attackerIndex, attacker);
    return;
  }

  const defender = defenderOwner.battle.find((card) => card.uid === targetUid);
  if (defender) {
    battleCreatures(attackerIndex, attacker, 1 - attackerIndex, defender);
  }
}

async function chooseBlocker(attackerIndex, attacker) {
  const defenderIndex = 1 - attackerIndex;
  const defenderOwner = state.players[defenderIndex];
  const blockers = defenderOwner.battle.filter((card) => card.text.includes("ブロッカー") && !card.tapped);
  if (blockers.length === 0) return null;
  if (defenderIndex === HUMAN) {
    return chooseBlockerCard(attacker, blockers);
  }
  return blockers[0];
}

function attackPlayer(attackerIndex, attacker) {
  const attackerOwner = state.players[attackerIndex];
  const defenderOwner = state.players[1 - attackerIndex];
  if (defenderOwner.shields.length === 0) {
    state.winner = attackerOwner.label;
    addLog(`${attacker.name} の攻撃が通った。${attackerOwner.label} の勝ち。`);
    return;
  }
  const breaks = attacker.text.includes("Wブレイカー") ? 2 : 1;
  const actualBreaks = Math.min(breaks, defenderOwner.shields.length);
  for (let i = 0; i < actualBreaks; i += 1) {
    defenderOwner.hand.push(defenderOwner.shields.shift());
  }
  setEvent(`${attacker.name} が ${defenderOwner.label} のシールドを${actualBreaks}枚ブレイク。`, {
    uids: [attacker.uid],
    zones: [attackerIndex === HUMAN ? "cpu-shields" : "human-shields"],
  });
}

function battleCreatures(attackerIndex, attacker, defenderIndex, defender) {
  const attackerPower = totalPower(attacker);
  const defenderPower = totalPower(defender);
  setEvent(`${attacker.name} (${attackerPower}) と ${defender.name} (${defenderPower}) がバトル。`, {
    uids: [attacker.uid, defender.uid],
  });
  if (attackerPower <= defenderPower) destroyCreature(attackerIndex, attacker.uid);
  if (defenderPower <= attackerPower) destroyCreature(defenderIndex, defender.uid);
}

function destroyCreature(playerIndex, uidValue) {
  const player = state.players[playerIndex];
  const card = removeByUid(player.battle, uidValue);
  if (!card) return;
  resetCard(card);
  player.grave.push(card);
  setEvent(`${card.name} は破壊された。`, {
    uids: [card.uid],
    zones: [playerIndex === HUMAN ? "human-grave" : "cpu-grave"],
  });
}

function bounceCreature(playerIndex, uidValue) {
  const player = state.players[playerIndex];
  const card = removeByUid(player.battle, uidValue);
  if (!card) return;
  resetCard(card);
  player.hand.push(card);
  setEvent(`${card.name} は手札に戻った。`, {
    uids: [card.uid],
    zones: [playerIndex === HUMAN ? "human-hand" : "cpu-hand"],
  });
}

function resetCard(card) {
  card.tapped = false;
  card.asleep = false;
  card.tempPower = 0;
}

function drawMany(player, count) {
  const drawn = [];
  for (let i = 0; i < count; i += 1) {
    const card = drawOne(player, false);
    if (card) drawn.push(card);
  }
  return drawn;
}

function drawOne(player, toHand = true) {
  if (player.deck.length === 0) {
    const opponent = state.players.find((candidate) => candidate !== player);
    state.winner = opponent.label;
    addLog(`${player.label} は山札切れ。${opponent.label} の勝ち。`);
    return null;
  }
  const card = player.deck.shift();
  if (toHand) {
    player.hand.push(card);
    setEvent(`${player.label} は1枚引いた。`, { zones: [player === state.players[HUMAN] ? "human-hand" : "cpu-hand"] });
  }
  return card;
}

function availableMana(player) {
  return player.mana.filter((card) => !card.tapped).length;
}

async function payCost(playerIndex, card) {
  const player = state.players[playerIndex];
  if (playerIndex === HUMAN) {
    if (state.autoPay) {
      autoPayCost(player, card);
      return true;
    }
    const selected = await chooseManaPayment(player, card);
    if (!selected) return false;
    selected.forEach((manaCard) => {
      manaCard.tapped = true;
    });
    return true;
  }

  autoPayCost(player, card);
  return true;
}

function autoPayCost(player, card) {
  const matchingMana = player.mana.find((manaCard) => !manaCard.tapped && manaCard.civilization === card.civilization);
  const paid = [];
  if (matchingMana) paid.push(matchingMana);

  for (const manaCard of player.mana) {
    if (paid.length >= card.cost) break;
    if (!manaCard.tapped && !paid.includes(manaCard)) paid.push(manaCard);
  }

  paid.forEach((card) => {
    card.tapped = true;
  });
}

async function chooseManaPayment(player, card) {
  if (card.cost === 0) return [];
  return new Promise((resolve) => {
    state.pendingPayment = {
      card,
      selected: [],
      resolve,
    };
    setEvent(`${card.name} の支払いマナをマナゾーンから選んでください。`, { zones: ["human-mana"] });
    render();
  });
}

function paymentCandidates(player, card, selected) {
  const remainingSlots = card.cost - selected.length;
  const untapped = player.mana.filter((manaCard) => !manaCard.tapped && !selected.includes(manaCard));
  const alreadyHasCivilization = selected.some((manaCard) => manaCard.civilization === card.civilization);
  if (!alreadyHasCivilization && remainingSlots === 1) {
    return untapped.filter((manaCard) => manaCard.civilization === card.civilization);
  }
  return untapped;
}

function selectPaymentMana(uidValue) {
  const payment = state.pendingPayment;
  if (!payment) return;
  const player = state.players[HUMAN];
  const candidates = paymentCandidates(player, payment.card, payment.selected);
  const manaCard = candidates.find((card) => card.uid === uidValue);
  if (!manaCard) return;

  payment.selected.push(manaCard);

  if (payment.selected.length >= payment.card.cost) {
    const selected = [...payment.selected];
    const resolve = payment.resolve;
    state.pendingPayment = null;
    resolve(selected);
    return;
  }

  setEvent(`${payment.card.name} の支払いマナを選択中 ${payment.selected.length}/${payment.card.cost}。`, {
    uids: payment.selected.map((card) => card.uid),
    zones: ["human-mana"],
  });
  render();
}

function cancelPayment() {
  const payment = state.pendingPayment;
  if (!payment) return;
  state.pendingPayment = null;
  payment.resolve(null);
  setEvent("マナ支払いをキャンセルしました。", { zones: ["human-mana"] });
  render();
}

function canPayCost(player, card) {
  return availableMana(player) >= card.cost && hasCivilizationMana(player, card.civilization);
}

function hasCivilizationMana(player, civilization) {
  return player.mana.some((card) => !card.tapped && card.civilization === civilization);
}

function totalPower(card) {
  return (card.power || 0) + (card.tempPower || 0);
}

function weakest(cards) {
  return [...cards].sort((a, b) => totalPower(a) - totalPower(b))[0] || null;
}

function strongest(cards) {
  return [...cards].sort((a, b) => totalPower(b) - totalPower(a))[0] || null;
}

function removeByUid(list, uidValue) {
  const index = list.findIndex((card) => card.uid === uidValue);
  if (index < 0) return null;
  return list.splice(index, 1)[0];
}

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function addLog(message) {
  state.log.unshift(message);
  state.log = state.log.slice(0, 80);
}

function setEvent(message, options = {}) {
  state.eventMessage = message;
  state.flashUids = options.uids || [];
  state.flashZones = options.zones || [];
  addLog(message);
}

function render() {
  if (!state) return;
  const activePlayer = state.players[state.active];
  els.status.textContent = state.winner
    ? `勝者: ${state.winner}`
    : `ターン ${state.turn} / ${activePlayer.label} / ${phase()}フェーズ`;

  els.nextPhase.textContent = nextPhaseLabel();
  els.autoPay.textContent = state.autoPay ? "✓ マナ自動支払い ON" : "マナ自動支払い OFF";
  els.autoPay.classList.toggle("active", state.autoPay);
  els.autoPay.setAttribute("aria-pressed", String(state.autoPay));
  els.autoPay.disabled = Boolean(state.pendingPayment);
  els.nextPhase.disabled = !canHumanAct() || state.pendingPayment || (phase() === "マナ" && !state.manaPlaced && state.players[HUMAN].hand.length > 0);
  els.skipMana.disabled = !canHumanAct() || state.pendingPayment || phase() !== "マナ" || state.manaPlaced;
  els.endTurn.disabled = !canHumanAct() || state.pendingPayment;

  els.scoreboard.innerHTML = state.players.map(renderSummary).join("");
  els.battlefield.innerHTML = renderGameTable();
  renderLog();
}

function renderLog() {
  els.fullLog.innerHTML = state.log.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("");
  els.expandLog.textContent = `ログ (${state.log.length})`;
  els.expandLog.disabled = !state.log.length;
}

function nextPhaseLabel() {
  if (phase() === "マナ") return "メインへ";
  if (phase() === "メイン") return "攻撃開始";
  return "ターン終了";
}

function renderSummary(player, index) {
  return `
    <article class="player-summary ${index === state.active ? "active" : ""}">
      <div>
        <h2>${escapeHtml(player.label)} <span>${escapeHtml(player.deckName)}</span></h2>
        <div class="stats">
          <span class="stat">山札 ${player.deck.length}</span>
          <span class="stat">手札 ${player.hand.length}</span>
          <span class="stat">盾 ${player.shields.length}</span>
          <span class="stat">マナ ${availableMana(player)}/${player.mana.length}</span>
          <span class="stat">墓地 ${player.grave.length}</span>
        </div>
      </div>
      <strong>${index === state.active ? "行動中" : ""}</strong>
    </article>
  `;
}

function renderGameTable() {
  return `
    <section class="game-table">
      ${renderPlayerArea(state.players[CPU], CPU, true)}
      ${renderPlayerArea(state.players[HUMAN], HUMAN, false)}
      ${state.winner ? renderResultOverlay() : ""}
    </section>
  `;
}

function renderResultOverlay() {
  const won = state.winner === state.players[HUMAN].label;
  return `
    <div class="result-overlay ${won ? "win" : "lose"}">
      <strong>${won ? "勝利" : "敗北"}</strong>
      <span>${escapeHtml(state.winner)} の勝ち</span>
    </div>
  `;
}

function renderPlayerArea(player, index, opponent) {
  return `
    <section class="duel-area ${opponent ? "opponent drop-player" : "human"} ${index === state.active ? "active" : ""} ${zoneFlash(index === HUMAN ? "human-area" : "cpu-area")}" ${opponent ? `data-drop-target="player"` : ""}>
      <div class="duel-area-header">
        <h2>${escapeHtml(player.label)}</h2>
        <span>${escapeHtml(player.deckName)}</span>
      </div>
      <div class="side-zone deck-shield-zone">
        ${renderPile("山札", player.deck.length)}
        ${renderShields(player, index)}
      </div>
      <div class="side-zone grave-side-zone">
        ${renderPile("墓地", player.grave.length)}
      </div>
      <div class="battle-lane ${zoneFlash(index === HUMAN ? "human-battle" : "cpu-battle")}">
        <div class="zone-title"><span>バトルゾーン</span><span>${player.battle.length}</span></div>
        <div class="card-row battle-row">
          ${player.battle.length ? player.battle.map((card) => renderCard(card, index, "battle")).join("") : `<div class="empty-zone">クリーチャーなし</div>`}
        </div>
      </div>
      ${renderMana(player, index)}
      <div class="hand-lane ${zoneFlash(index === HUMAN ? "human-hand" : "cpu-hand")}">
        <div class="zone-title"><span>${opponent ? "相手の手札" : "あなたの手札"}</span><span>${player.hand.length}</span></div>
        <div class="card-row hand-row">
          ${player.hand.length ? player.hand.map((card) => opponent ? `<div class="card-back">手札</div>` : renderCard(card, index, "hand")).join("") : `<div class="empty-zone">手札なし</div>`}
        </div>
      </div>
    </section>
  `;
}

function renderPile(label, count) {
  return `
    <div class="pile">
      <strong>${label}</strong>
      <span>${count}</span>
    </div>
  `;
}

function renderShields(player, index) {
  return `
    <div class="shield-zone ${zoneFlash(index === HUMAN ? "human-shields" : "cpu-shields")}">
      <strong>シールド</strong>
      <div class="shield-row">
        ${player.shields.map((_, index) => `<span class="shield">S${index + 1}</span>`).join("") || `<span class="shield empty">0</span>`}
      </div>
    </div>
  `;
}

function renderMana(player, index) {
  const payment = index === HUMAN ? state.pendingPayment : null;
  return `
    <div class="mana-zone ${zoneFlash(index === HUMAN ? "human-mana" : "cpu-mana")}">
      <strong>マナ ${availableMana(player)}/${player.mana.length}</strong>
      <div class="mana-row">
        ${player.mana.map((card) => renderManaChip(card, payment)).join("") || `<span class="mana-chip empty">0</span>`}
        ${payment ? `<button class="mana-cancel" data-action="cancel-payment" type="button">キャンセル</button>` : ""}
      </div>
    </div>
  `;
}

function renderManaChip(card, payment) {
  const selected = payment?.selected.includes(card);
  const payable = payment && paymentCandidates(state.players[HUMAN], payment.card, payment.selected).includes(card);
  const classes = [
    "mana-chip",
    CIV_CLASS[card.civilization] || "",
    card.tapped ? "tapped" : "",
    selected ? "selected" : "",
    payable ? "payable" : "",
    cardFlash(card),
  ].filter(Boolean).join(" ");
  const content = `<b>${escapeHtml(card.civilization)}</b>${escapeHtml(shortCardName(card.name))}`;
  if (payable) {
    return `<button class="${classes}" data-action="pay-mana" data-uid="${card.uid}" type="button" title="${escapeHtml(card.name)}">${content}</button>`;
  }
  return `<span class="${classes}" title="${escapeHtml(card.name)}">${content}</span>`;
}

function shortCardName(name) {
  return String(name || "").replaceAll("の", "").slice(0, 5);
}

function renderCard(card, playerIndex, zone) {
  const humanTurn = canHumanAct() && !state.pendingPayment && playerIndex === HUMAN;
  const playable = humanTurn && zone === "hand" && phase() === "メイン" && canPayCost(state.players[HUMAN], card);
  const canMana = humanTurn && zone === "hand" && phase() === "マナ" && !state.manaPlaced;
  const canAttack = humanTurn && zone === "battle" && canEnterAttackWith(card);
  const canDirectAttack = canAttack && phase() === "アタック";
  const canDropAttack = playerIndex === CPU && zone === "battle" && card.tapped;
  const reason = cardReason(card, playerIndex, zone);
  return `
    <article class="card ${canAttack ? "attackable" : ""} ${canDropAttack ? "drop-creature" : ""} ${card.tapped ? "tapped" : ""} ${card.asleep ? "asleep" : ""} ${playable || canMana || canAttack ? "ready" : ""} ${cardFlash(card)}" ${canAttack ? `${canDirectAttack ? `data-action="select-attacker"` : ""} data-drag-attack="true" draggable="true" data-uid="${card.uid}"` : ""} ${canDropAttack ? `data-drop-target="creature" data-uid="${card.uid}"` : ""}>
      <div class="card-visual ${CIV_CLASS[card.civilization] || ""}">
        <div class="cost-orb">${card.cost}</div>
        <div class="card-type">${escapeHtml(card.civilization)} / ${escapeHtml(card.type)}</div>
        ${card.type === "クリーチャー" ? `<div class="power-box">${totalPower(card)}</div>` : `<div class="spell-mark">SPELL</div>`}
      </div>
      <div class="card-name">${escapeHtml(card.name)}</div>
      <div class="card-status">
        ${card.text.includes("ブロッカー") ? `<span class="blocker-status" title="ブロッカー">B</span>` : ""}
        ${card.asleep ? `<span>召喚酔い</span>` : ""}
        ${card.tapped ? `<span>タップ済み</span>` : ""}
        ${canAttack ? `<span>攻撃可能</span>` : ""}
        ${reason ? `<span>${escapeHtml(reason)}</span>` : ""}
      </div>
      <div class="card-text">${escapeHtml(displayCardText(card))}</div>
      <div class="card-actions">
        ${zone === "hand" ? `<button data-action="mana" data-uid="${card.uid}" ${canMana ? "" : "disabled"}>マナへ</button>` : ""}
        ${zone === "hand" ? `<button data-action="play" data-uid="${card.uid}" ${playable ? "" : "disabled"}>${card.type === "呪文" ? "詠唱" : "召喚"}</button>` : ""}
        ${zone === "battle" ? `<button data-action="select-attacker" data-uid="${card.uid}" ${canAttack ? "" : "disabled"}>攻撃</button>` : ""}
      </div>
    </article>
  `;
}

function displayCardText(card) {
  return String(card.text || "")
    .replace("ブロッカー。", "")
    .replace("ブロッカー", "")
    .trim() || "効果なし";
}

function renderPreviewCard(card, extraClass = "") {
  return `
    <article class="choice-card ${extraClass} ${card.tapped ? "tapped" : ""} ${card.asleep ? "asleep" : ""}">
      <div class="card-visual ${CIV_CLASS[card.civilization] || ""}">
        <div class="cost-orb">${card.cost}</div>
        <div class="card-type">${escapeHtml(card.civilization)} / ${escapeHtml(card.type)}</div>
        ${card.type === "クリーチャー" ? `<div class="power-box">${totalPower(card)}</div>` : `<div class="spell-mark">SPELL</div>`}
      </div>
      <div class="card-name">${escapeHtml(card.name)}</div>
      <div class="card-status">
        ${card.text.includes("ブロッカー") ? `<span class="blocker-status" title="ブロッカー">B</span>` : ""}
        ${card.asleep ? `<span>召喚酔い</span>` : ""}
        ${card.tapped ? `<span>タップ済み</span>` : ""}
      </div>
      <div class="card-text">${escapeHtml(displayCardText(card))}</div>
    </article>
  `;
}

function canEnterAttackWith(card) {
  return (phase() === "メイン" || phase() === "アタック") && !card.tapped && !card.asleep;
}

function cardReason(card, playerIndex, zone) {
  if (!canHumanAct() || playerIndex !== HUMAN) return "";
  if (zone === "hand" && phase() === "メイン" && !canPayCost(state.players[HUMAN], card)) {
    if (availableMana(state.players[HUMAN]) < card.cost) {
      return `マナ不足 ${availableMana(state.players[HUMAN])}/${card.cost}`;
    }
    return `${card.civilization}マナなし`;
  }
  if (zone === "hand" && phase() === "マナ" && state.manaPlaced) return "マナ済み";
  if (zone === "battle" && phase() === "アタック") {
    if (card.asleep) return "召喚酔い";
    if (card.tapped) return "行動済み";
  }
  return "";
}

function cardFlash(card) {
  return state.flashUids.includes(card.uid) ? "flash" : "";
}

function zoneFlash(zoneName) {
  return state.flashZones.includes(zoneName) ? "flash-zone" : "";
}

function chooseCard(title, cards, optional = false) {
  return new Promise((resolve, reject) => {
    if (cards.length === 0) {
      if (!optional) setEvent(`${title}: 対象がありません。`);
      resolve(null);
      return;
    }
    els.dialog.classList.remove("block-choice-dialog");
    els.dialog.classList.add("card-choice-dialog");
    els.choiceTitle.textContent = title;
    els.choiceList.innerHTML = `
      <div class="card-choice-grid">
        ${cards.map((card) => `
          <button class="card-choice-button" type="button" data-choice="${card.uid}">
            ${renderPreviewCard(card)}
          </button>
        `).join("")}
      </div>
      <div class="card-choice-actions">
        ${optional ? `<button class="no-card-choice" type="button" data-choice="">効果を使わない</button>` : ""}
        <button class="cancel-card-use-choice" type="button" data-cancel-card-use="true">カード使用をキャンセル</button>
      </div>
    `;

    const handleChoice = (event) => {
      if (event.target.closest("[data-cancel-card-use]")) {
        cleanup();
        els.dialog.close();
        reject(CARD_USE_CANCELLED);
        return;
      }
      const button = event.target.closest("[data-choice]");
      if (!button) return;
      cleanup();
      els.dialog.close();
      resolve(cards.find((card) => card.uid === button.dataset.choice) || null);
    };
    const handleClose = () => {
      cleanup();
      reject(CARD_USE_CANCELLED);
    };
    const cleanup = () => {
      els.dialog.classList.remove("card-choice-dialog");
      els.choiceList.removeEventListener("click", handleChoice);
      els.dialog.removeEventListener("close", handleClose);
    };
    els.choiceList.addEventListener("click", handleChoice);
    els.dialog.addEventListener("close", handleClose, { once: true });
    els.dialog.showModal();
  });
}

function chooseBlockerCard(attacker, blockers) {
  return new Promise((resolve) => {
    els.dialog.classList.add("block-choice-dialog");
    els.choiceTitle.textContent = "ブロックする？";
    els.choiceList.innerHTML = `
      <div class="block-choice">
        <section class="block-choice-section">
          <h3>攻撃中</h3>
          ${renderPreviewCard(attacker, "attacker-preview")}
        </section>
        <section class="block-choice-section">
          <h3>ブロック候補</h3>
          <div class="blocker-choice-grid">
            ${blockers.map((card) => `
              <button class="blocker-choice-card" type="button" data-choice="${card.uid}">
                ${renderPreviewCard(card)}
              </button>
            `).join("")}
          </div>
        </section>
        <button class="no-block-choice" type="button" data-choice="">ブロックしない</button>
      </div>
    `;

    const handleChoice = (event) => {
      const button = event.target.closest("[data-choice]");
      if (!button) return;
      cleanup();
      els.dialog.close();
      resolve(blockers.find((card) => card.uid === button.dataset.choice) || null);
    };
    const handleClose = () => {
      cleanup();
      resolve(null);
    };
    const cleanup = () => {
      els.dialog.classList.remove("block-choice-dialog");
      els.choiceList.removeEventListener("click", handleChoice);
      els.dialog.removeEventListener("close", handleClose);
    };
    els.choiceList.addEventListener("click", handleChoice);
    els.dialog.addEventListener("close", handleClose, { once: true });
    els.dialog.showModal();
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
