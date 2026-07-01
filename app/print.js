const CIV_CLASS = {
  火: "fire",
  自然: "nature",
  水: "water",
  光: "light",
};

const els = {
  status: document.querySelector("#sheet-status"),
  root: document.querySelector("#print-root"),
  filter: document.querySelector("#deck-filter"),
  printButton: document.querySelector("#print-button"),
};

let cardsById = new Map();
let decks = [];

init();

async function init() {
  const [cardsRes, decksRes] = await Promise.all([
    fetch("../data/cards-v0.json"),
    fetch("../data/decks-v0.json"),
  ]);
  const cardsData = await cardsRes.json();
  const decksData = await decksRes.json();

  cardsById = new Map(cardsData.cards.map((card) => [card.id, card]));
  decks = decksData.decks;

  els.filter.innerHTML = [
    `<option value="all">全デッキ</option>`,
    ...decks.map((deck) => `<option value="${escapeHtml(deck.id)}">${escapeHtml(deck.name)}</option>`),
  ].join("");

  els.filter.addEventListener("change", render);
  els.printButton.addEventListener("click", () => window.print());

  render();
}

function render() {
  const selected = els.filter.value || "all";
  const visibleDecks = selected === "all" ? decks : decks.filter((deck) => deck.id === selected);
  const totalCards = visibleDecks.reduce((sum, deck) => sum + countDeck(deck), 0);

  els.status.textContent = `${visibleDecks.length}デッキ / ${totalCards}枚`;
  els.root.innerHTML = visibleDecks.map(renderDeck).join("");
}

function renderDeck(deck) {
  const cards = expandDeck(deck);
  return `
    <section class="deck-sheet">
      <header class="deck-heading">
        <div>
          <h2>${escapeHtml(deck.name)}</h2>
          <p>${escapeHtml(deck.goal)}</p>
        </div>
        <div class="deck-count">${cards.length}枚</div>
      </header>
      <div class="card-grid">
        ${cards.map(renderCard).join("")}
      </div>
    </section>
  `;
}

function expandDeck(deck) {
  const output = [];
  for (const entry of deck.cards) {
    const card = cardsById.get(entry.id);
    if (!card) continue;
    for (let i = 0; i < entry.count; i += 1) {
      output.push(card);
    }
  }
  return output;
}

function countDeck(deck) {
  return deck.cards.reduce((sum, entry) => sum + entry.count, 0);
}

function renderCard(card) {
  const civClass = CIV_CLASS[card.civilization] || "";
  return `
    <article class="print-card">
      <div class="card-top">
        <div class="cost">${card.cost}</div>
        <div class="card-name">${escapeHtml(card.name)}</div>
      </div>
      <div class="card-meta">
        <span class="badge ${civClass}">${escapeHtml(card.civilization)}</span>
        <span class="badge">${escapeHtml(card.type)}</span>
        <span class="badge">${escapeHtml(card.id)}</span>
      </div>
      <div class="card-text">${escapeHtml(card.text)}</div>
      <div class="card-bottom">
        <span>${escapeHtml(card.role)}</span>
        ${card.type === "クリーチャー" ? `<span class="power">${card.power}</span>` : `<span>SPELL</span>`}
      </div>
    </article>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

