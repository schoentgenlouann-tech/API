const API_BASE = "https://api.tvmaze.com";
const FAVORITES_KEY = "tv-show-explorer-favorites";
const TRACKING_KEY = "tv-show-explorer-tracking-v1";
const WATCH_STATUSES = [
  { value: "want", label: "Want to Watch" },
  { value: "watching", label: "Currently Watching" },
  { value: "completed", label: "Completed" },
  { value: "dropped", label: "Dropped" },
];
const searchForm = document.querySelector("#search-form");
const searchInput = document.querySelector("#show-query");
const searchButton = searchForm.querySelector("button");
const statusMessage = document.querySelector("#status-message");
const exploreHero = document.querySelector("#explore-hero");
const navButtons = document.querySelectorAll(".nav-link");
const favoriteNavCount = document.querySelector("#favorite-nav-count");
const watchlistNavCount = document.querySelector("#watchlist-nav-count");
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
const watchlistSection = document.querySelector("#watchlist-section");
const watchlistFilters = document.querySelector("#watchlist-filters");
const watchlistList = document.querySelector("#watchlist-list");
const watchlistCount = document.querySelector("#watchlist-count");
const watchlistEmpty = document.querySelector("#watchlist-empty");
const continueSection = document.querySelector("#continue-section");
const continueList = document.querySelector("#continue-list");
const continueCount = document.querySelector("#continue-count");
const continueEmpty = document.querySelector("#continue-empty");
const trackingPrompt = document.querySelector("#tracking-prompt");
const trackingPromptText = document.querySelector("#tracking-prompt-text");
const trackingPromptAction = document.querySelector("#tracking-prompt-action");
const trackingPromptDismiss = document.querySelector("#tracking-prompt-dismiss");

const searchCache = new Map();
const showCache = new Map();
const showRequests = new Map();
const episodeCache = new Map();
const episodeRequests = new Map();
const knownShows = new Map();
let favorites = loadFavorites();
let watchlist = loadTracking();
let currentView = "explore";
let detailReturnView = "explore";
let watchlistFilter = "all";
let hasSearchResults = false;
let activeSearchController;
let searchSequence = 0;
let episodeSequence = 0;
let watchlistSequence = 0;
let continueSequence = 0;
let activeShow;
let activeEpisodes = [];
const dismissedPrompts = new Set();

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

watchlistFilters.addEventListener("click", (event) => {
  const button = event.target instanceof Element ? event.target.closest("[data-watch-filter]") : null;
  if (!button) return;
  watchlistFilter = button.dataset.watchFilter;
  renderWatchlist();
});

trackingPromptAction.addEventListener("click", () => {
  const promptType = trackingPrompt.dataset.promptType;
  if (!activeShow || !promptType) return;
  const nextStatus = promptType === "complete" ? "completed" : "watching";
  setWatchStatus(activeShow, nextStatus);
});

trackingPromptDismiss.addEventListener("click", () => {
  const key = trackingPrompt.dataset.promptKey;
  if (key) dismissedPrompts.add(key);
  trackingPrompt.hidden = true;
});

updateFavoriteCount();
updateWatchlistCount();
renderWatchlistFilters();

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

function createShowCard(show, { favoriteView = false, watchlistView = false, continueView = false } = {}) {
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
    meta.textContent = [premiereYear(show.premiered), show.genres?.join(" · ")].filter(Boolean).join(" · ") || "TV series";
  }
  copy.append(title, description, meta);
  if (watchlistView || continueView) {
    const status = document.createElement("span");
    status.className = "watch-status-badge";
    status.textContent = statusLabel(watchlist.get(show.id)?.status);
    copy.append(status);
  }
  if (continueView) {
    const meter = createProgressMeter(show.id, episodeCache.get(show.id) || [], "show");
    copy.append(meter);
    const next = document.createElement("p");
    next.className = "continue-next";
    next.dataset.nextFor = String(show.id);
    next.textContent = "Loading next episode…";
    copy.append(next);
  }
  main.append(copy);
  main.addEventListener("click", () => openShow(show, currentView));

  const actions = document.createElement("div");
  actions.className = "show-card-actions";
  actions.append(createFavoriteButton(show), createWatchlistControl(show));
  if (watchlistView) {
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "remove-watchlist-button";
    removeButton.textContent = "Remove";
    removeButton.addEventListener("click", () => removeFromWatchlist(show.id));
    actions.append(removeButton);
  }
  card.append(main, actions);
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

function createWatchlistControl(show, { includeRemove = false } = {}) {
  const wrapper = document.createElement("div");
  wrapper.className = "watchlist-control";
  wrapper.dataset.showId = String(show.id);
  const select = document.createElement("select");
  select.setAttribute("aria-label", `Watch status for ${show.name}`);
  const currentStatus = watchlist.get(show.id)?.status || "";
  const prompt = document.createElement("option");
  prompt.value = "";
  prompt.textContent = currentStatus ? "Change status…" : "Add to Watchlist…";
  prompt.disabled = Boolean(currentStatus);
  select.append(prompt);
  for (const status of WATCH_STATUSES) {
    const option = document.createElement("option");
    option.value = status.value;
    option.textContent = status.label;
    select.append(option);
  }
  if (includeRemove && currentStatus) {
    const removeOption = document.createElement("option");
    removeOption.value = "__remove__";
    removeOption.textContent = "Remove from Watchlist";
    select.append(removeOption);
  }
  select.value = currentStatus;
  select.addEventListener("change", () => {
    if (select.value === "__remove__") removeFromWatchlist(show.id);
    else if (select.value && select.value !== currentStatus) {
      select.disabled = true;
      setWatchStatus(show, select.value).finally(() => {
        if (select.isConnected) select.disabled = false;
      });
    }
  });
  wrapper.append(select);
  return wrapper;
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
  activeShow = undefined;
  activeEpisodes = [];
  trackingPrompt.hidden = true;
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
  activeShow = show;
  activeEpisodes = episodes;
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
  toolbar.append(backButton, createWatchlistControl(show, { includeRemove: true }), createFavoriteButton(show, false));

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
  info.append(title, facts, description, genres, stats, createProgressMeter(show.id, episodes, "show"));
  content.append(info);
  showDetails.replaceChildren(toolbar, content);
  episodeTotal.textContent = episodes.length;
  renderTrackingPrompt(show, episodes);
  renderSeasons(seasons, show);
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

function renderSeasons(seasons, show) {
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
    summary.append(seasonName, createProgressMeter(show.id, seasonEpisodes, "season", seasonNumber));

    const controls = document.createElement("div");
    controls.className = "season-tracking-controls";
    controls.append(createProgressMeter(show.id, seasonEpisodes, "season", seasonNumber));
    const markAllButton = document.createElement("button");
    markAllButton.type = "button";
    markAllButton.className = "small-action primary";
    markAllButton.textContent = "Mark season watched";
    markAllButton.addEventListener("click", () => setSeasonWatched(show, seasonNumber, seasonEpisodes, true));
    const resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.className = "small-action";
    resetButton.textContent = "Reset season";
    resetButton.addEventListener("click", () => setSeasonWatched(show, seasonNumber, seasonEpisodes, false));
    controls.append(markAllButton, resetButton);
    const list = document.createElement("div");
    list.className = "episode-list";
    for (const episode of seasonEpisodes) list.append(createEpisode(episode, show));
    details.append(summary, controls, list);
    seasonList.append(details);
  }
  seasonSelect.value = String(seasons[0][0]);
}

function createEpisode(episode, show) {
  const article = document.createElement("article");
  article.className = "episode";
  const isWatched = watchlist.get(show.id)?.watchedEpisodeIds.has(episode.id) || false;
  if (isWatched) article.classList.add("is-watched");
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
  const watchLabel = document.createElement("label");
  watchLabel.className = "episode-watch-toggle";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = isWatched;
  checkbox.disabled = !Number.isInteger(episode.id) || episode.id <= 0;
  checkbox.dataset.episodeId = String(episode.id);
  checkbox.setAttribute("aria-label", `${isWatched ? "Mark as unwatched" : "Mark as watched"}: ${episode.name || "episode"}`);
  checkbox.addEventListener("change", () => toggleEpisodeWatched(show, episode, checkbox.checked));
  const watchText = document.createElement("span");
  watchText.textContent = "Watched";
  watchLabel.append(checkbox, watchText);
  article.append(copy, watchLabel);
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

function loadTracking() {
  try {
    const saved = localStorage.getItem(TRACKING_KEY);
    if (!saved) return new Map();
    const data = JSON.parse(saved);
    if (data.version !== 1 || !Array.isArray(data.shows)) throw new Error("Unsupported tracking data.");
    const entries = data.shows
      .filter((entry) => entry && Number.isInteger(entry.showId) && entry.showId > 0
        && WATCH_STATUSES.some((status) => status.value === entry.status))
      .map((entry) => [entry.showId, {
        status: entry.status,
        watchedEpisodeIds: new Set(
          Array.isArray(entry.watchedEpisodeIds)
            ? entry.watchedEpisodeIds.filter((id) => Number.isInteger(id) && id > 0)
            : [],
        ),
      }]);
    return new Map(entries);
  } catch {
    showStatus("Watchlist data couldn't be read from this browser. You can still track shows during this visit.", "error");
    return new Map();
  }
}

function persistTracking(nextWatchlist) {
  try {
    const data = {
      version: 1,
      shows: [...nextWatchlist].map(([showId, entry]) => ({
        showId,
        status: entry.status,
        watchedEpisodeIds: [...entry.watchedEpisodeIds],
      })),
    };
    localStorage.setItem(TRACKING_KEY, JSON.stringify(data));
    watchlist = nextWatchlist;
    updateWatchlistCount();
    renderWatchlistFilters();
    return true;
  } catch {
    showStatus("Your browser couldn't save this tracking change. Check local storage settings and try again.", "error");
    return false;
  }
}

async function setWatchStatus(show, status) {
  if (!WATCH_STATUSES.some((item) => item.value === status)) return;
  const current = watchlist.get(show.id);
  if (current?.status === status) return;
  let watchedEpisodeIds = new Set(current?.watchedEpisodeIds || []);
  if (status === "completed") {
    try {
      const episodes = await getEpisodes(show.id);
      watchedEpisodeIds = new Set(episodes.filter((episode) => Number.isInteger(episode.id) && episode.id > 0).map((episode) => episode.id));
    } catch (error) {
      showStatus(error.message || "Couldn't load episodes to complete this show.", "error");
      refreshWatchlistControls(show.id);
      return;
    }
  }

  const next = new Map(watchlist);
  next.set(show.id, { status, watchedEpisodeIds });
  if (!persistTracking(next)) {
    refreshWatchlistControls(show.id);
    return;
  }
  knownShows.set(show.id, show);
  refreshWatchlistControls(show.id);
  if (currentView === "watchlist") renderWatchlist();
  if (currentView === "continue") renderContinueWatching();
  rerenderActiveShow();
  showStatus(`${show.name} moved to ${statusLabel(status)}.`);
}

function removeFromWatchlist(showId) {
  const show = knownShows.get(showId) || favorites.get(showId);
  const next = new Map(watchlist);
  next.delete(showId);
  if (!persistTracking(next)) return;
  refreshWatchlistControls(showId);
  if (currentView === "watchlist") renderWatchlist();
  if (currentView === "continue") renderContinueWatching();
  rerenderActiveShow();
  showStatus(show ? `${show.name} removed from your watchlist.` : "Show removed from your watchlist.");
}

function refreshWatchlistControls(showId) {
  const show = knownShows.get(showId) || favorites.get(showId);
  if (!show) return;
  for (const control of document.querySelectorAll(".watchlist-control")) {
    if (Number(control.dataset.showId) === showId) {
      control.replaceWith(createWatchlistControl(show, { includeRemove: true }));
    }
  }
}

function toggleEpisodeWatched(show, episode, watched) {
  if (!Number.isInteger(episode.id) || episode.id <= 0) {
    showStatus("This episode has no valid TVmaze episode ID and can't be tracked.", "error");
    return;
  }
  const current = watchlist.get(show.id) || { status: "want", watchedEpisodeIds: new Set() };
  const watchedEpisodeIds = new Set(current.watchedEpisodeIds);
  if (watched) watchedEpisodeIds.add(episode.id);
  else watchedEpisodeIds.delete(episode.id);
  const next = new Map(watchlist);
  next.set(show.id, { status: current.status, watchedEpisodeIds });
  if (!persistTracking(next)) {
    rerenderActiveShow();
    return;
  }
  knownShows.set(show.id, show);
  rerenderActiveShow(episode.id);
  if (currentView === "watchlist") renderWatchlist();
  if (currentView === "continue") renderContinueWatching();
}

function setSeasonWatched(show, seasonNumber, episodes, watched) {
  const current = watchlist.get(show.id) || { status: "want", watchedEpisodeIds: new Set() };
  const watchedEpisodeIds = new Set(current.watchedEpisodeIds);
  for (const episode of episodes) {
    if (!Number.isInteger(episode.id) || episode.id <= 0) continue;
    if (watched) watchedEpisodeIds.add(episode.id);
    else watchedEpisodeIds.delete(episode.id);
  }
  const next = new Map(watchlist);
  next.set(show.id, { status: current.status, watchedEpisodeIds });
  if (!persistTracking(next)) return;
  knownShows.set(show.id, show);
  rerenderActiveShow();
  if (currentView === "watchlist") renderWatchlist();
  if (currentView === "continue") renderContinueWatching();
  const verb = watched ? "marked watched" : "reset";
  showStatus(`Season ${seasonNumber || "specials"} ${verb}.`);
}

function rerenderActiveShow(focusEpisodeId) {
  if (!activeShow || !activeEpisodes.length || showSection.hidden) return;
  const scrollPosition = window.scrollY;
  renderShow(activeShow, activeEpisodes);
  if (focusEpisodeId) {
    showDetails.querySelector(`[data-episode-id="${focusEpisodeId}"]`)?.focus({ preventScroll: true });
  }
  window.scrollTo(0, scrollPosition);
}

function progressSnapshot(showId, episodes) {
  const watchedEpisodeIds = watchlist.get(showId)?.watchedEpisodeIds || new Set();
  const availableIds = new Set(episodes.filter((episode) => Number.isInteger(episode.id) && episode.id > 0).map((episode) => episode.id));
  const watched = [...availableIds].filter((id) => watchedEpisodeIds.has(id)).length;
  const total = episodes.length;
  return {
    watched,
    total,
    remaining: Math.max(0, total - watched),
    percentage: total ? Math.floor((watched / total) * 100) : 0,
  };
}

function createProgressMeter(showId, episodes, scope, seasonNumber) {
  const progress = progressSnapshot(showId, episodes);
  const meter = document.createElement("div");
  meter.className = `progress-meter${scope === "season" ? " season-progress-meter" : ""}`;
  meter.dataset.progressShow = String(showId);
  meter.dataset.progressScope = scope;
  if (seasonNumber !== undefined) meter.dataset.progressSeason = String(seasonNumber);
  const label = document.createElement("span");
  label.className = "progress-label";
  label.textContent = `${progress.watched}/${progress.total} watched · ${progress.remaining} left · ${progress.percentage}%`;
  const track = document.createElement("div");
  track.className = "progress-track";
  track.setAttribute("role", "progressbar");
  track.setAttribute("aria-label", scope === "season" ? `Season ${seasonNumber || "specials"} progress` : "Show progress");
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", "100");
  track.setAttribute("aria-valuenow", String(progress.percentage));
  const fill = document.createElement("span");
  fill.className = "progress-fill";
  fill.style.width = `${progress.percentage}%`;
  track.append(fill);
  meter.append(label, track);
  return meter;
}

function renderTrackingPrompt(show, episodes) {
  const progress = progressSnapshot(show.id, episodes);
  const status = watchlist.get(show.id)?.status;
  let type = "";
  if (progress.total > 0 && progress.remaining === 0 && status !== "completed") type = "complete";
  else if (progress.watched > 0 && status !== "watching") type = "watching";
  const promptKey = type ? `${show.id}:${type}:${progress.watched}` : "";
  if (!type || dismissedPrompts.has(promptKey)) {
    trackingPrompt.hidden = true;
    return;
  }
  trackingPrompt.dataset.promptType = type;
  trackingPrompt.dataset.promptKey = promptKey;
  trackingPromptText.textContent = type === "complete"
    ? `You've watched all ${progress.total} available episodes of ${show.name}. Mark it as completed?`
    : `You've started ${show.name}. Move it to Currently Watching?`;
  trackingPromptAction.textContent = type === "complete" ? "Mark as Completed" : "Move to Currently Watching";
  trackingPrompt.hidden = false;
}

function statusLabel(status) {
  return WATCH_STATUSES.find((item) => item.value === status)?.label || "Not in Watchlist";
}

function updateWatchlistCount() {
  watchlistNavCount.textContent = watchlist.size;
}

function renderWatchlistFilters() {
  const filters = [{ value: "all", label: "All" }, ...WATCH_STATUSES];
  watchlistFilters.replaceChildren(...filters.map(({ value, label }) => {
    const count = value === "all" ? watchlist.size : [...watchlist.values()].filter((entry) => entry.status === value).length;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `filter-tab${watchlistFilter === value ? " active" : ""}`;
    button.dataset.watchFilter = value;
    button.setAttribute("aria-pressed", String(watchlistFilter === value));
    button.textContent = `${label} ${count}`;
    return button;
  }));
}

function renderWatchlist() {
  renderWatchlistFilters();
  const entries = [...watchlist].filter(([, entry]) => watchlistFilter === "all" || entry.status === watchlistFilter);
  watchlistCount.textContent = `${watchlist.size} ${watchlist.size === 1 ? "show" : "shows"}`;
  watchlistEmpty.hidden = entries.length !== 0;
  watchlistList.hidden = entries.length === 0;
  watchlistEmpty.textContent = watchlist.size
    ? `No shows in ${statusLabel(watchlistFilter)}.`
    : "Your watchlist is empty. Add a show from Explore to choose a viewing status.";
  watchlistList.replaceChildren(...entries.map(([showId]) => createCollectionLoading(showId)));
  const sequence = ++watchlistSequence;

  for (const [showId, entry] of entries) {
    getWatchlistShow(showId).then((show) => {
      if (sequence !== watchlistSequence || watchlist.get(showId)?.status !== entry.status) return;
      const placeholder = watchlistList.querySelector(`[data-collection-show="${showId}"]`);
      if (placeholder) placeholder.replaceWith(createShowCard(show, { watchlistView: true }));
    }).catch(() => {
      if (sequence !== watchlistSequence) return;
      const placeholder = watchlistList.querySelector(`[data-collection-show="${showId}"]`);
      if (placeholder) showCollectionError(placeholder, "Show details couldn't be loaded.");
    });
  }
}

function renderContinueWatching() {
  const entries = [...watchlist].filter(([, entry]) => entry.status === "watching");
  continueCount.textContent = `${entries.length} ${entries.length === 1 ? "show" : "shows"}`;
  continueEmpty.hidden = entries.length !== 0;
  continueList.hidden = entries.length === 0;
  continueList.replaceChildren(...entries.map(([showId]) => createCollectionLoading(showId)));
  const sequence = ++continueSequence;

  for (const [showId] of entries) {
    Promise.all([getWatchlistShow(showId), getEpisodes(showId)]).then(([show, episodes]) => {
      if (sequence !== continueSequence || watchlist.get(showId)?.status !== "watching") return;
      const placeholder = continueList.querySelector(`[data-collection-show="${showId}"]`);
      if (!placeholder) return;
      const card = createShowCard(show, { continueView: true });
      fillContinueCard(card, show, episodes);
      placeholder.replaceWith(card);
    }).catch(() => {
      if (sequence !== continueSequence) return;
      const placeholder = continueList.querySelector(`[data-collection-show="${showId}"]`);
      if (placeholder) showCollectionError(placeholder, "Show progress couldn't be loaded.");
    });
  }
}

function getWatchlistShow(showId) {
  const known = knownShows.get(showId) || favorites.get(showId) || showCache.get(showId);
  return known ? Promise.resolve(known) : getShow(showId);
}

function createCollectionLoading(showId) {
  const card = document.createElement("article");
  card.className = "collection-loading";
  card.dataset.collectionShow = String(showId);
  card.setAttribute("role", "status");
  card.textContent = "Loading show details…";
  return card;
}

function showCollectionError(card, message) {
  card.className = "collection-loading collection-error";
  card.replaceChildren();
  const text = document.createElement("span");
  text.textContent = message;
  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "small-action";
  retry.textContent = "Retry";
  retry.addEventListener("click", () => {
    if (currentView === "watchlist") renderWatchlist();
    else renderContinueWatching();
  });
  card.append(text, retry);
}

function fillContinueCard(card, show, episodes) {
  const progress = progressSnapshot(show.id, episodes);
  const next = episodes.slice().sort(compareEpisodes).find((episode) =>
    Number.isInteger(episode.id) && episode.id > 0 && !watchlist.get(show.id)?.watchedEpisodeIds.has(episode.id));
  const nextText = card.querySelector(`[data-next-for="${show.id}"]`);
  nextText.textContent = next
    ? `Next up · ${episodePosition(next)} · ${next.name || "Untitled episode"}`
    : progress.total ? "All available episodes watched" : "No episodes available yet";
  if (progress.total > 0 && progress.remaining === 0) {
    const completeButton = document.createElement("button");
    completeButton.type = "button";
    completeButton.className = "small-action primary";
    completeButton.textContent = "Mark as Completed";
    completeButton.addEventListener("click", () => setWatchStatus(show, "completed"));
    card.querySelector(".show-card-actions").append(completeButton);
  }
}

function compareEpisodes(a, b) {
  return (a.season ?? 0) - (b.season ?? 0)
    || (a.number ?? Number.MAX_SAFE_INTEGER) - (b.number ?? Number.MAX_SAFE_INTEGER);
}

function episodePosition(episode) {
  const season = Number.isInteger(episode.season) ? `S${String(episode.season).padStart(2, "0")}` : "Special";
  const number = Number.isInteger(episode.number) ? `E${String(episode.number).padStart(2, "0")}` : "Special";
  return `${season} ${number}`;
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
  const views = ["explore", "favorites", "watchlist", "continue"];
  currentView = views.includes(view) ? view : "explore";
  if (currentView !== "explore") {
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
  watchlistSection.hidden = currentView !== "watchlist";
  continueSection.hidden = currentView !== "continue";
  clearStatus();
  if (currentView === "favorites") renderFavorites();
  if (currentView === "watchlist") renderWatchlist();
  if (currentView === "continue") renderContinueWatching();
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
