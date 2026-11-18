const API_BASE = "https://api.tvmaze.com";
const FAVORITES_KEY = "tv-show-explorer-favorites";
const searchForm = document.querySelector("#search-form");
const searchInput = document.querySelector("#show-query");
const searchButton = searchForm.querySelector("button");
const statusMessage = document.querySelector("#status-message");
const exploreHero = document.querySelector("#explore-hero");
const navButtons = document.querySelectorAll(".nav-link");
const favoriteNavCount = document.querySelector("#favorite-nav-count");
const searchSection = document.querySelector("#search-section");
const resultsContainer = document.querySelector("#show-results");
const resultCount = document.querySelector("#result-count");
const showSection = document.querySelector("#show-section");
const showDetails = document.querySelector("#show-details");
const episodeTotal = document.querySelector("#episode-total");
const seasonSelect = document.querySelector("#season-select");
const seasonList = document.querySelector("#season-list");
const favoritesSection = document.querySelector("#favorites-section");
const favoritesList = document.querySelector("#favorites-list");
const favoritesCount = document.querySelector("#favorites-count");
const favoritesEmpty = document.querySelector("#favorites-empty");

const searchCache = new Map();
const showCache = new Map();
const showRequests = new Map();
const episodeCache = new Map();
const episodeRequests = new Map();
const knownShows = new Map();
let favorites = loadFavorites();
let currentView = "explore";
let detailReturnView = "explore";
let hasSearchResults = false;
let activeSearchController;
let searchSequence = 0;
let episodeSequence = 0;

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  searchShows(searchInput.value);
});

for (const button of navButtons) {
  button.addEventListener("click", () => setView(button.dataset.view));
}

seasonSelect.addEventListener("change", () => {
  const season = document.querySelector(`#season-${CSS.escape(seasonSelect.value)}`);
  if (!season) return;
  season.open = true;
  season.scrollIntoView({ behavior: "smooth", block: "start" });
});

updateFavoriteCount();

async function searchShows(rawQuery) {
  const query = rawQuery.trim();
  if (!query) {
    showStatus("Enter a show name to start your search.", "error");
    searchInput.focus();
    return;
  }

  setView("explore");
  activeSearchController?.abort();
  const controller = new AbortController();
  activeSearchController = controller;
  searchSequence += 1;
  const sequence = searchSequence;
  searchButton.disabled = true;
  showStatus("Searching TVmaze…");
  searchSection.hidden = true;
  showSection.hidden = true;
  hasSearchResults = false;
  resultsContainer.replaceChildren();

  try {
    const key = query.toLocaleLowerCase();
    let shows = searchCache.get(key);
    if (!shows) {
      const response = await fetch(`${API_BASE}/search/shows?q=${encodeURIComponent(query)}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`TVmaze returned HTTP ${response.status} while searching.`);
      shows = await response.json();
      if (!Array.isArray(shows)) throw new Error("TVmaze returned an unexpected search response.");
      searchCache.set(key, shows);
    }
    if (sequence !== searchSequence) return;
    if (!shows.length) {
      showStatus(`No shows found for “${query}”. Try another title.`, "error");
      return;
    }

    renderSearchResults(shows);
    clearStatus();
  } catch (error) {
    if (error.name === "AbortError") return;
    if (sequence === searchSequence) showStatus(error.message || "Could not reach TVmaze. Please try again.", "error");
  } finally {
    if (sequence === searchSequence) searchButton.disabled = false;
  }
}

function renderSearchResults(matches) {
  resultsContainer.replaceChildren(...matches.map(({ show }) => createShowCard(show)));
  resultCount.textContent = `${matches.length} ${matches.length === 1 ? "match" : "matches"}`;
  hasSearchResults = true;
  searchSection.hidden = false;
}

function createShowCard(show, { favoriteView = false } = {}) {
  knownShows.set(show.id, show);
  const card = document.createElement("article");
  card.className = "show-card";
  card.dataset.showId = String(show.id);
  const main = document.createElement("button");
  main.type = "button";
  main.className = "show-card-main";
  main.setAttribute("aria-label", `View episodes for ${show.name}`);

  const image = createImage(show.image?.medium, show.name);
  if (image) main.append(image);
  else main.append(createPlaceholder("poster-placeholder", "▣"));

  const copy = document.createElement("div");
  copy.className = "show-card-copy";
  const title = document.createElement("h3");
  title.textContent = show.name || "Untitled show";
  const description = document.createElement("p");
  description.textContent = summaryText(show.summary) || "No description available.";
  const meta = document.createElement("p");
  meta.className = favoriteView ? "favorite-stats" : "show-meta";
  if (favoriteView) {
    meta.textContent = "Loading season and episode totals…";
    meta.dataset.statsFor = String(show.id);
  } else {
    meta.textContent = [premiereYear(show.premiered), show.genres?.slice(0, 2).join(" · ")].filter(Boolean).join(" · ") || "TV series";
  }
  copy.append(title, description, meta);
  main.append(copy);
  main.addEventListener("click", () => openShow(show, currentView));

  const favoriteButton = createFavoriteButton(show);
  card.append(main, favoriteButton);
  return card;
}

function createFavoriteButton(show) {
  const isFavorite = favorites.has(show.id);
  const button = document.createElement("button");
  button.type = "button";
  button.className = `favorite-button${isFavorite ? " is-favorite" : ""}`;
  button.textContent = isFavorite ? "♥" : "♡";
  button.setAttribute("aria-label", isFavorite ? `Remove ${show.name} from favorites` : `Add ${show.name} to favorites`);
  button.setAttribute("aria-pressed", String(isFavorite));
  button.title = isFavorite ? "Remove from favorites" : "Add to favorites";
  button.addEventListener("click", () => toggleFavorite(show));
  return button;
}

async function openShow(show, returnView = currentView) {
  if (!Number.isInteger(show.id) || show.id <= 0) {
    showStatus("This result has an invalid TVmaze show ID. Choose another show.", "error");
    return;
  }
  detailReturnView = returnView;
  setView(returnView);
  searchSection.hidden = true;
  favoritesSection.hidden = true;
  showSection.hidden = false;
  showDetails.replaceChildren(createDetailLoading(show));
  const sequence = ++episodeSequence;
  showStatus(`Loading episodes for ${show.name}…`);

  try {
    const [details, episodes] = await Promise.all([getShow(show.id), getEpisodes(show.id)]);
    if (sequence !== episodeSequence) return;
    knownShows.set(details.id, details);
    renderShow(details, episodes);
    clearStatus();
  } catch (error) {
    if (sequence === episodeSequence) {
      showSection.hidden = true;
      setView(returnView);
      showStatus(error.message || "Could not load this show's episodes. Please try again.", "error");
    }
  }
}

function createDetailLoading(show) {
  const wrapper = document.createElement("div");
  wrapper.className = "detail-loading";
  wrapper.setAttribute("role", "status");
  wrapper.textContent = `Loading details for ${show.name}…`;
  return wrapper;
}

async function getShow(showId) {
  if (showCache.has(showId)) return showCache.get(showId);
  if (showRequests.has(showId)) return showRequests.get(showId);

  const request = (async () => {
    const response = await fetch(`${API_BASE}/shows/${showId}`);
    if (response.status === 404) throw new Error("TVmaze could not find this show. Please choose another result.");
    if (!response.ok) throw new Error(`TVmaze returned HTTP ${response.status} while loading show details.`);
    const show = await response.json();
    if (!show || show.id !== showId) throw new Error("TVmaze returned unexpected show details.");
    showCache.set(showId, show);
    return show;
  })();
  showRequests.set(showId, request);
  try {
    return await request;
  } finally {
    if (showRequests.get(showId) === request) showRequests.delete(showId);
  }
}

async function getEpisodes(showId) {
  if (episodeCache.has(showId)) return episodeCache.get(showId);
  if (episodeRequests.has(showId)) return episodeRequests.get(showId);

  const request = (async () => {
    const response = await fetch(`${API_BASE}/shows/${showId}/episodes`);
    if (response.status === 404) throw new Error("TVmaze could not find this show. Please choose another result.");
    if (!response.ok) throw new Error(`TVmaze returned HTTP ${response.status} while loading episodes.`);
    const episodes = await response.json();
    if (!Array.isArray(episodes)) throw new Error("TVmaze returned an unexpected episode response.");
    episodeCache.set(showId, episodes);
    return episodes;
  })();
  episodeRequests.set(showId, request);
  try {
    return await request;
  } finally {
    if (episodeRequests.get(showId) === request) episodeRequests.delete(showId);
  }
}

function renderShow(show, episodes) {
  const toolbar = document.createElement("div");
  toolbar.className = "show-detail-toolbar";
  toolbar.dataset.showId = String(show.id);
  const backButton = document.createElement("button");
  backButton.type = "button";
  backButton.className = "back-button";
  backButton.textContent = detailReturnView === "favorites" ? "← Back to favorites" : "← Back to results";
  backButton.addEventListener("click", () => {
    showSection.hidden = true;
    setView(detailReturnView);
  });
  toolbar.append(backButton, createFavoriteButton(show, false));

  const content = document.createElement("div");
  content.className = "show-detail-content";
  const image = createImage(show.image?.original || show.image?.medium, show.name);
  content.append(image || createPlaceholder("show-poster-placeholder", "▣"));

  const info = document.createElement("div");
  info.className = "show-info";
  const title = document.createElement("h2");
  title.id = "show-title";
  title.textContent = show.name || "Untitled show";
  const facts = document.createElement("p");
  facts.className = "show-facts";
  facts.textContent = [
    show.premiered ? `Premiered ${formatDate(show.premiered)}` : "",
    show.ended ? `Ended ${formatDate(show.ended)}` : "",
    show.status || "",
  ].filter(Boolean).join("  ·  ") || "Premiere and status details unavailable";
  const description = document.createElement("p");
  description.className = "show-summary";
  description.textContent = summaryText(show.summary) || "No description available.";
  const genres = document.createElement("div");
  genres.className = "genre-list";
  for (const genre of show.genres || []) {
    const tag = document.createElement("span");
    tag.className = "genre-tag";
    tag.textContent = genre;
    genres.append(tag);
  }
  const seasons = seasonEntries(episodes);
  const stats = document.createElement("div");
  stats.className = "show-overview-stats";
  stats.textContent = `${seasons.filter(([season]) => season > 0).length} seasons · ${episodes.length} episodes`;
  info.append(title, facts, description, genres, stats);
  content.append(info);
  showDetails.replaceChildren(toolbar, content);
  episodeTotal.textContent = episodes.length;
  renderSeasons(seasons);
}

function seasonEntries(episodes) {
  const seasons = new Map();
  for (const episode of episodes) {
    const season = Number.isInteger(episode.season) ? episode.season : 0;
    if (!seasons.has(season)) seasons.set(season, []);
    seasons.get(season).push(episode);
  }
  return [...seasons.entries()]
    .map(([season, seasonEpisodes]) => [
      season,
      seasonEpisodes.sort((a, b) => (a.number ?? Number.MAX_SAFE_INTEGER) - (b.number ?? Number.MAX_SAFE_INTEGER)),
    ])
    .sort(([a], [b]) => a - b);
}

function renderSeasons(seasons) {
  seasonSelect.replaceChildren();
  seasonList.replaceChildren();
  if (!seasons.length) {
    seasonSelect.disabled = true;
    const empty = document.createElement("p");
    empty.className = "empty-episodes";
    empty.textContent = "No episodes are currently available for this show.";
    seasonList.append(empty);
    return;
  }

  seasonSelect.disabled = false;
  for (const [seasonNumber, seasonEpisodes] of seasons) {
    const option = document.createElement("option");
    option.value = String(seasonNumber);
    option.textContent = seasonNumber === 0 ? "Specials" : `Season ${seasonNumber}`;
    seasonSelect.append(option);

    const details = document.createElement("details");
    details.className = "season";
    details.id = `season-${seasonNumber}`;
    details.open = seasonNumber === seasons[0][0];
    const summary = document.createElement("summary");
    const seasonName = document.createElement("span");
    seasonName.className = "season-name";
    seasonName.textContent = seasonNumber === 0 ? "Specials" : `Season ${seasonNumber}`;
    const count = document.createElement("span");
    count.className = "season-count";
    count.textContent = `${seasonEpisodes.length} ${seasonEpisodes.length === 1 ? "episode" : "episodes"}`;
    seasonName.append(count);
    summary.append(seasonName);

    const list = document.createElement("div");
    list.className = "episode-list";
    for (const episode of seasonEpisodes) list.append(createEpisode(episode));
    details.append(summary, list);
    seasonList.append(details);
  }
  seasonSelect.value = String(seasons[0][0]);
}

function createEpisode(episode) {
  const article = document.createElement("article");
  article.className = "episode";
  if (episode.image?.medium) {
    const image = createImage(episode.image.medium, episode.name);
    if (image) {
      image.className = "episode-image";
      article.append(image);
    }
  }
  const copy = document.createElement("div");
  copy.className = "episode-copy";
  const titleRow = document.createElement("div");
  titleRow.className = "episode-title-row";
  const number = document.createElement("span");
  number.className = "episode-number";
  number.textContent = episode.number == null ? "SPECIAL" : `E${String(episode.number).padStart(2, "0")}`;
  const title = document.createElement("h3");
  title.className = "episode-title";
  title.textContent = episode.name || "Untitled episode";
  titleRow.append(number, title);

  const meta = document.createElement("p");
  meta.className = "episode-meta";
  meta.textContent = [formatDate(episode.airdate), episode.runtime ? `${episode.runtime} min` : ""].filter(Boolean).join("  ·  ") || "Air date unavailable";
  const description = document.createElement("p");
  description.className = "episode-summary";
  description.textContent = summaryText(episode.summary) || "No episode description available.";
  copy.append(titleRow, meta, description);
  article.append(copy);
  return article;
}

function renderFavorites() {
  const savedShows = [...favorites.values()];
  favoritesCount.textContent = `${savedShows.length} ${savedShows.length === 1 ? "show" : "shows"}`;
  favoritesEmpty.hidden = savedShows.length !== 0;
  favoritesList.hidden = savedShows.length === 0;
  favoritesList.replaceChildren(...savedShows.map((show) => createShowCard(show, { favoriteView: true })));

  for (const show of savedShows) {
    getEpisodes(show.id).then((episodes) => {
      const stats = favoritesList.querySelector(`[data-stats-for="${show.id}"]`);
      if (stats) stats.textContent = formatFavoriteStats(show, episodes);
    }).catch(() => {
      const stats = favoritesList.querySelector(`[data-stats-for="${show.id}"]`);
      if (stats) stats.textContent = "Season and episode totals unavailable";
    });
  }
}

function formatFavoriteStats(show, episodes) {
  const seasonCount = seasonEntries(episodes).filter(([season]) => season > 0).length;
  return `${seasonCount} ${seasonCount === 1 ? "season" : "seasons"} · ${episodes.length} episodes${show.status ? ` · ${show.status}` : ""}`;
}

function toggleFavorite(show) {
  const nextFavorites = new Map(favorites);
  if (nextFavorites.has(show.id)) nextFavorites.delete(show.id);
  else nextFavorites.set(show.id, show);

  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...nextFavorites.values()]));
    favorites = nextFavorites;
    updateFavoriteCount();
    refreshFavoriteButtons(show.id);
    if (currentView === "favorites" && !showSection.hidden) {
      renderShowFavoriteButton(show);
    } else if (currentView === "favorites") {
      renderFavorites();
    }
  } catch {
    showStatus("Your browser couldn't save this change. Check your local storage settings and try again.", "error");
  }
}

function renderShowFavoriteButton(show) {
  const currentButton = showDetails.querySelector(".favorite-button");
  if (!currentButton) return;
  currentButton.replaceWith(createFavoriteButton(show, false));
}

function refreshFavoriteButtons(showId) {
  for (const button of document.querySelectorAll(".favorite-button")) {
    const container = button.closest("[data-show-id]");
    if (Number(container?.dataset.showId) !== showId) continue;
    const show = favorites.get(showId) || knownShows.get(showId);
    if (show) button.replaceWith(createFavoriteButton(show, !button.closest(".show-detail-toolbar")));
  }
}

function loadFavorites() {
  try {
    const saved = localStorage.getItem(FAVORITES_KEY);
    if (!saved) return new Map();
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) throw new Error("Saved favorites are not a list.");
    return new Map(parsed.filter((show) => show && Number.isInteger(show.id) && show.id > 0).map((show) => [show.id, show]));
  } catch {
    showStatus("Saved favorites couldn't be read from this browser. You can still add favorites during this visit.", "error");
    return new Map();
  }
}

function updateFavoriteCount() {
  favoriteNavCount.textContent = favorites.size;
}

function setView(view) {
  currentView = view === "favorites" ? "favorites" : "explore";
  if (currentView === "favorites") {
    activeSearchController?.abort();
    activeSearchController = undefined;
    searchSequence += 1;
    searchButton.disabled = false;
  }
  for (const button of navButtons) {
    const active = button.dataset.view === currentView;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
  exploreHero.hidden = currentView !== "explore";
  searchSection.hidden = currentView !== "explore" || !hasSearchResults;
  showSection.hidden = true;
  favoritesSection.hidden = currentView !== "favorites";
  clearStatus();
  if (currentView === "favorites") renderFavorites();
}

function createImage(source, alt) {
  if (!source) return null;
  const image = document.createElement("img");
  image.src = source;
  image.alt = alt ? `${alt} poster` : "";
  image.loading = "lazy";
  image.addEventListener("error", () => {
    const placeholderClass = image.classList.contains("episode-image")
      ? "episode-image-placeholder"
      : image.closest(".show-detail-content") ? "show-poster-placeholder" : "poster-placeholder";
    image.replaceWith(createPlaceholder(placeholderClass, "▣"));
  }, { once: true });
  return image;
}

function createPlaceholder(className, symbol) {
  const placeholder = document.createElement("div");
  placeholder.className = className;
  placeholder.setAttribute("aria-hidden", "true");
  placeholder.textContent = symbol;
  return placeholder;
}

function summaryText(summary) {
  if (!summary) return "";
  const parsed = new DOMParser().parseFromString(summary, "text/html");
  return parsed.body.textContent.replace(/\s+/g, " ").trim();
}

function premiereYear(date) {
  return date ? date.slice(0, 4) : "";
}

function formatDate(date) {
  if (!date) return "";
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? date : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(parsed);
}

function showStatus(message, type = "") {
  statusMessage.textContent = message;
  statusMessage.className = `status-message${type ? ` ${type}` : ""}`;
  statusMessage.hidden = false;
}

function clearStatus() {
  statusMessage.hidden = true;
  statusMessage.textContent = "";
  statusMessage.className = "status-message";
}
