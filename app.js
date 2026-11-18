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
const searchShowsMode = document.querySelector("#search-shows-mode");
const searchActorsMode = document.querySelector("#search-actors-mode");
const searchHeading = document.querySelector("#search-heading");
const searchEyebrow = document.querySelector("#search-eyebrow");
const searchLabel = document.querySelector('label[for="show-query"]');
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
const actorSection = document.querySelector("#actor-section");
const actorProfile = document.querySelector("#actor-profile");
const actorBackButton = document.querySelector("#actor-back-button");
const showCastList = document.querySelector("#show-cast-list");
const relatedShowsList = document.querySelector("#related-shows-list");
const actorRecommendations = document.querySelector("#actor-recommendations");
const filmographyFilters = document.querySelector("#filmography-filters");
const filmographyList = document.querySelector("#filmography-list");
const filmographyCount = document.querySelector("#filmography-count");
const filmographyEmpty = document.querySelector("#filmography-empty");
const trackingPrompt = document.querySelector("#tracking-prompt");
const trackingPromptText = document.querySelector("#tracking-prompt-text");
const trackingPromptAction = document.querySelector("#tracking-prompt-action");
const trackingPromptDismiss = document.querySelector("#tracking-prompt-dismiss");

const searchCache = new Map();
const peopleSearchCache = new Map();
const showCache = new Map();
const showRequests = new Map();
const showCastCache = new Map();
const showCastRequests = new Map();
const actorCastCreditsCache = new Map();
const actorCastCreditRequests = new Map();
const actorGuestCreditsCache = new Map();
const actorGuestCreditRequests = new Map();
const personCache = new Map();
const personRequests = new Map();
const actorProfileCache = new Map();
const actorProfileRequests = new Map();
const episodeCache = new Map();
const episodeRequests = new Map();
const knownShows = new Map();
let favorites = loadFavorites();
let watchlist = loadTracking();
let currentView = "explore";
let detailReturnView = "explore";
let watchlistFilter = "all";
let searchMode = "shows";
let hasSearchResults = false;
let activeSearchController;
let searchSequence = 0;
let episodeSequence = 0;
let actorSequence = 0;
let showDiscoverySequence = 0;
let watchlistSequence = 0;
let continueSequence = 0;
let activeShow;
let activeEpisodes = [];
let activeActor;
let activeFilmography = [];
let actorReturnState;
let previousShowState;
let currentRootView = "explore";
let filmographyFiltersState = { genre: "all", year: "all", role: "all", sort: "significance" };
const dismissedPrompts = new Set();

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  searchShows(searchInput.value);
});

searchShowsMode.addEventListener("click", () => setSearchMode("shows"));
searchActorsMode.addEventListener("click", () => setSearchMode("actors"));
actorBackButton.addEventListener("click", returnFromActorProfile);
filmographyFilters.addEventListener("change", (event) => {
  const select = event.target instanceof HTMLSelectElement ? event.target : null;
  if (!select) return;
  filmographyFiltersState[select.name] = select.value;
  renderFilmography();
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
    showStatus(`Enter ${searchMode === "actors" ? "an actor" : "a show"} name to start your search.`, "error");
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
    const cache = searchMode === "actors" ? peopleSearchCache : searchCache;
    let matches = cache.get(key);
    if (!matches) {
      const endpoint = searchMode === "actors" ? "people" : "shows";
      const response = await fetch(`${API_BASE}/search/${endpoint}?q=${encodeURIComponent(query)}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`TVmaze returned HTTP ${response.status} while searching.`);
      matches = await response.json();
      if (!Array.isArray(matches)) throw new Error("TVmaze returned an unexpected search response.");
      cache.set(key, matches);
    }
    if (sequence !== searchSequence) return;
    const validMatches = matches.filter((match) => searchMode === "actors"
      ? Number.isInteger(match?.person?.id)
      : Number.isInteger(match?.show?.id));
    if (!validMatches.length) {
      showStatus(`No ${searchMode === "actors" ? "actors" : "shows"} found for “${query}”. Try another search.`, "error");
      return;
    }

    renderSearchResults(validMatches, searchMode);
    clearStatus();
  } catch (error) {
    if (error.name === "AbortError") return;
    if (sequence === searchSequence) showStatus(error.message || "Could not reach TVmaze. Please try again.", "error");
  } finally {
    if (sequence === searchSequence) searchButton.disabled = false;
  }
}

function renderSearchResults(matches, mode) {
  resultsContainer.replaceChildren(...matches.map(({ show, person }) =>
    mode === "actors" ? createPersonSearchCard(person) : createShowCard(show)));
  searchHeading.textContent = mode === "actors" ? "Actor results" : "Search results";
  searchEyebrow.textContent = mode === "actors" ? "FIND YOUR FAVORITE ACTOR" : "PICK YOUR SHOW";
  resultCount.textContent = `${matches.length} ${matches.length === 1 ? "match" : "matches"}`;
  hasSearchResults = true;
  searchSection.hidden = false;
}

function setSearchMode(mode) {
  const previousMode = searchMode;
  searchMode = mode === "actors" ? "actors" : "shows";
  const actors = searchMode === "actors";
  searchShowsMode.classList.toggle("active", !actors);
  searchActorsMode.classList.toggle("active", actors);
  searchShowsMode.setAttribute("aria-pressed", String(!actors));
  searchActorsMode.setAttribute("aria-pressed", String(actors));
  searchInput.placeholder = actors ? "Try an actor name, like “Johnny Galecki”" : "Try “The Big Bang Theory”";
  searchInput.setAttribute("aria-label", actors ? "Search for an actor" : "Search for a TV show");
  searchLabel.textContent = actors ? "Search for an actor" : "Search for a TV show";
  searchEyebrow.textContent = actors ? "FIND YOUR FAVORITE ACTOR" : "PICK YOUR SHOW";
  if (previousMode !== searchMode) clearStatus();
  if (hasSearchResults) {
    hasSearchResults = false;
    searchSection.hidden = true;
    resultsContainer.replaceChildren();
    resultCount.textContent = "";
  }
}

function createPersonSearchCard(person) {
  const card = document.createElement("article");
  card.className = "person-search-card";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "person-search-main";
  const image = createImage(person?.image?.medium, person?.name);
  button.append(image || createPlaceholder("actor-placeholder", "♟"));
  const copy = document.createElement("span");
  copy.className = "person-search-copy";
  const name = document.createElement("strong");
  name.textContent = person?.name || "Unknown actor";
  const details = document.createElement("span");
  details.textContent = [person?.country?.name, person?.birthday ? `Born ${premiereYear(person.birthday)}` : ""].filter(Boolean).join(" · ") || "TV actor";
  copy.append(name, details);
  button.append(copy);
  if (Number.isInteger(person?.id)) button.addEventListener("click", () => openActorProfile(person));
  card.append(button);
  return card;
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
  if (returnView === "show" && currentView === "show" && activeShow && activeEpisodes.length) {
    previousShowState = { show: activeShow, episodes: activeEpisodes, returnView: detailReturnView };
  } else if (returnView !== "actor") {
    previousShowState = undefined;
  }
  detailReturnView = returnView;
  setView("show");
  searchSection.hidden = true;
  favoritesSection.hidden = true;
  watchlistSection.hidden = true;
  continueSection.hidden = true;
  actorSection.hidden = true;
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
      returnFromShow();
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

async function getShowCast(showId) {
  if (showCastCache.has(showId)) return showCastCache.get(showId);
  if (showCastRequests.has(showId)) return showCastRequests.get(showId);
  const request = fetch(`${API_BASE}/shows/${showId}/cast`).then(async (response) => {
    if (!response.ok) throw new Error(`TVmaze returned HTTP ${response.status} while loading the cast.`);
    const cast = await response.json();
    if (!Array.isArray(cast)) throw new Error("TVmaze returned an unexpected cast response.");
    showCastCache.set(showId, cast);
    return cast;
  });
  showCastRequests.set(showId, request);
  try {
    return await request;
  } finally {
    if (showCastRequests.get(showId) === request) showCastRequests.delete(showId);
  }
}

function getPerson(personId) {
  if (personCache.has(personId)) return Promise.resolve(personCache.get(personId));
  if (personRequests.has(personId)) return personRequests.get(personId);
  const request = fetch(`${API_BASE}/people/${personId}`).then(async (response) => {
    if (!response.ok) throw new Error(`TVmaze returned HTTP ${response.status} while loading an actor profile.`);
    const person = await response.json();
    if (!person || person.id !== personId) throw new Error("TVmaze returned unexpected actor details.");
    personCache.set(personId, person);
    return person;
  });
  personRequests.set(personId, request);
  return request.finally(() => {
    if (personRequests.get(personId) === request) personRequests.delete(personId);
  });
}

function getActorCastCredits(personId) {
  return getCreditList(personId, "castcredits", actorCastCreditsCache, actorCastCreditRequests);
}

function getActorGuestCredits(personId) {
  return getCreditList(personId, "guestcastcredits", actorGuestCreditsCache, actorGuestCreditRequests);
}

function getCreditList(personId, path, cache, requests) {
  if (cache.has(personId)) return Promise.resolve(cache.get(personId));
  if (requests.has(personId)) return requests.get(personId);
  const request = fetch(`${API_BASE}/people/${personId}/${path}?embed=${path === "castcredits" ? "show" : "episode"}`)
    .then(async (response) => {
      if (!response.ok) throw new Error(`TVmaze returned HTTP ${response.status} while loading actor credits.`);
      const credits = await response.json();
      if (!Array.isArray(credits)) throw new Error("TVmaze returned an unexpected credits response.");
      cache.set(personId, credits);
      return credits;
    });
  requests.set(personId, request);
  return request.finally(() => {
    if (requests.get(personId) === request) requests.delete(personId);
  });
}

function createStatusNote(message, isError = false) {
  const note = document.createElement("p");
  note.className = isError ? "discovery-status error" : "discovery-status";
  note.setAttribute("role", isError ? "alert" : "status");
  note.textContent = message;
  return note;
}

async function loadShowDiscovery(show, sequence) {
  try {
    const cast = await getShowCast(show.id);
    if (sequence !== showDiscoverySequence || activeShow?.id !== show.id) return;
    renderShowCast(cast);
    if (!cast.length) {
      relatedShowsList.replaceChildren(createStatusNote("TVmaze has no cast credits for this show yet."));
      return;
    }

    const featuredCast = cast.slice(0, 12);
    const creditLoads = await mapWithLimit(featuredCast, 4, async ({ person }) => {
      if (!person?.id) return { credits: [], failed: true };
      try {
        return { credits: await getActorCastCredits(person.id), failed: false };
      } catch {
        return { credits: [], failed: true };
      }
    });
    if (sequence !== showDiscoverySequence || activeShow?.id !== show.id) return;
    const recommendations = collectCastRecommendations(show, featuredCast, creditLoads.map(({ credits }) => credits));
    const failedCredits = creditLoads.some(({ failed }) => failed);
    if (failedCredits && !recommendations.length) {
      relatedShowsList.replaceChildren(createStatusNote("TVmaze cast credits could not be loaded. Please try again later.", true));
    } else {
      renderDiscoveryShows(relatedShowsList, recommendations, "No other TV shows were found through this cast.");
      if (failedCredits) {
        relatedShowsList.prepend(createStatusNote("Some cast credits could not be loaded; these recommendations may be incomplete.", true));
      }
    }
  } catch (error) {
    if (sequence !== showDiscoverySequence || activeShow?.id !== show.id) return;
    showCastList.replaceChildren(createStatusNote(error.message || "Could not load this show's cast.", true));
    relatedShowsList.replaceChildren(createStatusNote("Cast-based recommendations are unavailable right now.", true));
  }
}

function renderShowCast(cast) {
  const uniqueCast = new Map();
  for (const entry of cast) {
    const person = entry.person;
    if (person?.id && !uniqueCast.has(person.id)) uniqueCast.set(person.id, entry);
  }
  showCastList.replaceChildren(...[...uniqueCast.values()].map(createActorCastCard));
  if (!uniqueCast.size) showCastList.append(createStatusNote("TVmaze has no cast credits for this show yet."));
}

function createActorCastCard(entry) {
  const person = entry.person;
  const card = document.createElement("article");
  card.className = "actor-card";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "actor-card-main";
  const portrait = createImage(person.image?.medium, person.name);
  if (portrait) {
    portrait.className = "actor-card-image";
    button.append(portrait);
  } else {
    button.append(createPlaceholder("actor-placeholder actor-card-image", "♟"));
  }
  const copy = document.createElement("span");
  copy.className = "actor-card-copy";
  const name = document.createElement("strong");
  name.textContent = person.name || "Unknown actor";
  const character = document.createElement("span");
  character.textContent = entry.character?.name ? `as ${entry.character.name}` : "Character details unavailable";
  const role = document.createElement("span");
  role.className = "actor-role";
  role.textContent = entry.voice ? "Voice" : "Main cast";
  copy.append(name, character, role);
  button.append(copy);
  button.addEventListener("click", () => openActorProfile(person));
  card.append(button);
  return card;
}

function collectCastRecommendations(currentShow, cast, creditsByActor) {
  const recommendations = new Map();
  cast.forEach(({ person }, index) => {
    if (!person?.id) return;
    const rankValue = Math.max(1, cast.length - index);
    for (const credit of creditsByActor[index] || []) {
      const show = credit?._embedded?.show;
      if (!show?.id || show.id === currentShow.id) continue;
      let recommendation = recommendations.get(show.id);
      if (!recommendation) {
        recommendation = { show, actors: new Set(), score: 0 };
        recommendations.set(show.id, recommendation);
      }
      recommendation.actors.add(person.name);
      recommendation.score += rankValue;
    }
  });
  return [...recommendations.values()]
    .sort((a, b) => b.actors.size - a.actors.size
      || b.score - a.score
      || (b.show.rating?.average || 0) - (a.show.rating?.average || 0))
    .slice(0, 6);
}

function renderDiscoveryShows(container, recommendations, emptyMessage) {
  if (!recommendations.length) {
    container.replaceChildren(createStatusNote(emptyMessage));
    return;
  }
  container.replaceChildren(...recommendations.map(({ show, actors, credit }) => {
    const card = createDiscoveryShowCard(show);
    const copy = card.querySelector(".show-card-copy");
    const rating = show.rating?.average;
    const meta = card.querySelector(".show-meta");
    if (meta && rating != null) meta.textContent = `${meta.textContent} · ★ ${rating}`;
    if (actors?.size) {
      const names = document.createElement("p");
      names.className = "actor-connections";
      names.textContent = `Connected by ${[...actors].join(", ")}`;
      copy.append(names);
    }
    if (credit) {
      const creditLine = document.createElement("p");
      creditLine.className = "show-credit-meta";
      creditLine.textContent = credit;
      copy.append(creditLine);
    }
    return card;
  }));
}

function createDiscoveryShowCard(show) {
  return createShowCard(show);
}

async function mapWithLimit(items, limit, handler) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await handler(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function openActorProfile(person) {
  if (!Number.isInteger(person?.id) || person.id <= 0) {
    showStatus("This actor result has an invalid TVmaze ID. Choose another actor.", "error");
    return;
  }
  actorReturnState = {
    view: currentView,
    show: currentView === "show" ? activeShow : undefined,
    episodes: currentView === "show" ? activeEpisodes : undefined,
  };
  actorBackButton.textContent = actorReturnState.view === "show" ? "← Back to show" : "← Back to results";
  activeActor = person;
  activeFilmography = [];
  filmographyFiltersState = { genre: "all", year: "all", role: "all", sort: "significance" };
  setView("actor");
  actorProfile.replaceChildren(createStatusNote(`Loading ${person.name}'s profile and TV credits…`));
  actorRecommendations.replaceChildren();
  filmographyList.replaceChildren();
  filmographyEmpty.hidden = true;
  filmographyFilters.replaceChildren();
  filmographyCount.textContent = "";
  const sequence = ++actorSequence;
  try {
    const profileData = await getActorProfileData(person.id);
    if (sequence !== actorSequence) return;
    activeActor = profileData.person;
    activeFilmography = profileData.filmography;
    renderActorProfile(profileData);
    if (profileData.creditErrors.length) {
      actorProfile.append(createStatusNote("Some TVmaze credit sources could not be loaded; the filmography may be incomplete.", true));
    }
  } catch (error) {
    if (sequence === actorSequence) {
      actorProfile.replaceChildren(createStatusNote(error.message || "Could not load this actor's profile. Please try again.", true));
      actorRecommendations.replaceChildren(createStatusNote("Actor recommendations are unavailable.", true));
    }
  }
}

async function getActorProfileData(personId) {
  if (actorProfileCache.has(personId)) return actorProfileCache.get(personId);
  if (actorProfileRequests.has(personId)) return actorProfileRequests.get(personId);
  const request = (async () => {
    const [personResult, castResult, guestResult] = await Promise.allSettled([
      getPerson(personId),
      getActorCastCredits(personId),
      getActorGuestCredits(personId),
    ]);
    if (personResult.status === "rejected") throw personResult.reason;
    const castCredits = castResult.status === "fulfilled" ? castResult.value : [];
    const guestCredits = guestResult.status === "fulfilled" ? guestResult.value : [];
    const records = new Map();
    for (const credit of castCredits) {
      const show = credit?._embedded?.show;
      if (!show?.id) continue;
      const record = getFilmographyRecord(records, show);
      record.roles.add("series");
      addCharacter(record, credit);
    }
    const guestByShow = new Map();
    for (const credit of guestCredits) {
      const episode = credit?._embedded?.episode;
      const showId = linkedShowId(credit?._links?.show?.href);
      if (!showId) continue;
      if (!guestByShow.has(showId)) guestByShow.set(showId, []);
      guestByShow.get(showId).push({ credit, episode });
    }
    const missingShows = [...guestByShow.keys()].filter((id) => !records.has(id));
    const unavailableShowIds = new Set();
    const showResults = await mapWithLimit(missingShows, 4, async (id) => {
      try {
        return await getShow(id);
      } catch {
        unavailableShowIds.add(id);
        return null;
      }
    });
    for (let index = 0; index < missingShows.length; index += 1) {
      const show = showResults[index];
      if (!show) continue;
      const record = getFilmographyRecord(records, show);
      for (const { credit, episode } of guestByShow.get(show.id)) {
        record.roles.add("guest");
        addCharacter(record, credit);
        const airdate = episode?.airdate || episode?.airstamp?.slice(0, 10);
        if (airdate) record.years.add(premiereYear(airdate));
      }
    }
    for (const [showId, guestEntries] of guestByShow) {
      const record = records.get(showId);
      if (!record) continue;
      for (const { credit, episode } of guestEntries) {
        record.roles.add("guest");
        addCharacter(record, credit);
        const airdate = episode?.airdate || episode?.airstamp?.slice(0, 10);
        if (airdate) record.years.add(premiereYear(airdate));
      }
    }
    const filmography = [...records.values()].map((record) => ({
      show: record.show,
      roles: record.roles,
      characters: [...record.characters],
      years: [...record.years].filter(Boolean).sort(),
    }));
    const result = {
      person: personResult.value,
      filmography,
      creditErrors: [
        ...[castResult, guestResult].filter((entry) => entry.status === "rejected"),
        ...[...unavailableShowIds].map(() => ({ status: "rejected" })),
      ],
    };
    if (!result.creditErrors.length) actorProfileCache.set(personId, result);
    return result;
  })();
  actorProfileRequests.set(personId, request);
  try {
    return await request;
  } finally {
    if (actorProfileRequests.get(personId) === request) actorProfileRequests.delete(personId);
  }
}

function getFilmographyRecord(records, show) {
  let record = records.get(show.id);
  if (!record) {
    record = { show, roles: new Set(), characters: new Set(), years: new Set() };
    records.set(show.id, record);
  } else if (record.show.name?.startsWith("TV show ")) {
    record.show = show;
  }
  return record;
}

function addCharacter(record, credit) {
  const name = credit?._links?.character?.name;
  if (name) record.characters.add(name);
}

function linkedShowId(href) {
  const match = typeof href === "string" ? href.match(/\/shows\/(\d+)(?:\/|$)/) : null;
  return match ? Number(match[1]) : null;
}

function renderActorProfile(profileData) {
  const { person, filmography } = profileData;
  const card = document.createElement("div");
  card.className = "actor-profile-card";
  const portrait = createImage(person.image?.original || person.image?.medium, person.name);
  if (portrait) {
    portrait.className = "actor-profile-image";
    card.append(portrait);
  } else {
    card.append(createPlaceholder("actor-placeholder actor-profile-image", "♟"));
  }
  const copy = document.createElement("div");
  copy.className = "actor-profile-copy";
  const title = document.createElement("h1");
  title.id = "actor-name";
  title.textContent = person.name || "Actor";
  const details = document.createElement("p");
  details.className = "actor-profile-facts";
  details.textContent = [
    person.birthday ? `Born ${formatDate(person.birthday)}` : "",
    person.country?.name || "",
    person.gender || "",
  ].filter(Boolean).join(" · ") || "Profile details provided by TVmaze";
  const bio = document.createElement("p");
  bio.className = "actor-biography";
  bio.textContent = summaryText(person.summary || person.biography)
    || "TVmaze does not provide a biography for this actor. Explore their credited TV roles below.";
  copy.append(title, details, bio);
  card.append(copy);
  actorProfile.replaceChildren(card);
  renderFilmographyFilters();
  renderFilmography();
  const recommendations = filmography
    .slice()
    .sort((a, b) => Number(b.roles.has("series")) - Number(a.roles.has("series"))
      || (b.show.rating?.average || 0) - (a.show.rating?.average || 0))
    .slice(0, 6)
    .map((entry) => ({
      show: entry.show,
      credit: `${[...entry.roles].map((role) => role === "series" ? "Series cast" : "Guest star").join(" · ")}${entry.characters.length ? ` · ${entry.characters.join(", ")}` : ""}`,
    }));
  renderDiscoveryShows(actorRecommendations, recommendations, "No TV show credits are currently listed for this actor.");
}

function renderFilmographyFilters() {
  const genres = [...new Set(activeFilmography.flatMap(({ show }) => show.genres || []))].sort();
  const years = [...new Set(activeFilmography.map(({ show }) => premiereYear(show.premiered)).filter(Boolean))].sort((a, b) => b.localeCompare(a));
  const controls = [
    ["genre", "Genre", genres],
    ["year", "Release year", years],
    ["role", "Role", ["series", "guest"]],
    ["sort", "Sort", ["significance", "popularity", "year"]],
  ];
  filmographyFilters.replaceChildren(...controls.map(([name, label, values]) => {
    const wrapper = document.createElement("label");
    wrapper.className = "filmography-filter";
    wrapper.textContent = label;
    const select = document.createElement("select");
    select.name = name;
    select.setAttribute("aria-label", `Filter filmography by ${label.toLowerCase()}`);
    if (name === "sort") {
      for (const [value, text] of [["significance", "Recommended"], ["popularity", "Popularity"], ["year", "Newest first"]]) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = text;
        select.append(option);
      }
    } else {
      const all = document.createElement("option");
      all.value = "all";
      all.textContent = `All ${label.toLowerCase()}s`;
      select.append(all);
      for (const value of values) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = name === "role"
          ? value === "series" ? "Series cast" : "Guest star"
          : value;
        select.append(option);
      }
    }
    select.value = filmographyFiltersState[name] || (name === "sort" ? "significance" : "all");
    wrapper.append(select);
    return wrapper;
  }));
}

function renderFilmography() {
  const filtered = activeFilmography.filter(({ show, roles }) =>
    (filmographyFiltersState.genre === "all" || show.genres?.includes(filmographyFiltersState.genre))
    && (filmographyFiltersState.year === "all" || premiereYear(show.premiered) === filmographyFiltersState.year)
    && (filmographyFiltersState.role === "all" || roles.has(filmographyFiltersState.role)));
  const sort = filmographyFiltersState.sort;
  filtered.sort((a, b) => sort === "popularity"
    ? (b.show.weight || b.show.rating?.average || 0) - (a.show.weight || a.show.rating?.average || 0)
    : sort === "year"
      ? premiereYear(b.show.premiered).localeCompare(premiereYear(a.show.premiered))
      : Number(b.roles.has("series")) - Number(a.roles.has("series"))
        || (b.show.rating?.average || 0) - (a.show.rating?.average || 0));
  filmographyCount.textContent = `${filtered.length} ${filtered.length === 1 ? "show" : "shows"}`;
  filmographyEmpty.hidden = filtered.length !== 0;
  filmographyList.hidden = filtered.length === 0;
  filmographyList.replaceChildren(...filtered.map((entry) => {
    const roleText = [...entry.roles].map((role) => role === "series" ? "Series cast" : "Guest star").join(" · ");
    const showRun = entry.roles.has("series")
      ? `Series aired ${premiereYear(entry.show.premiered)}${entry.show.ended && premiereYear(entry.show.ended) !== premiereYear(entry.show.premiered) ? `–${premiereYear(entry.show.ended)}` : ""}`
      : "";
    const guestYears = entry.roles.has("guest") && entry.years.length
      ? `Guest appearances ${entry.years.join(", ")}`
      : "";
    const creditText = [
      roleText,
      entry.characters.length ? `as ${entry.characters.join(", ")}` : "",
      showRun,
      guestYears,
    ].filter(Boolean).join(" · ");
    const card = createDiscoveryShowCard(entry.show);
    const copy = card.querySelector(".show-card-copy");
    const credit = document.createElement("p");
    credit.className = "show-credit-meta";
    credit.textContent = creditText;
    copy.append(credit);
    const rating = entry.show.rating?.average;
    const meta = card.querySelector(".show-meta");
    if (meta && rating != null) meta.textContent = `${meta.textContent} · ★ ${rating}`;
    return card;
  }));
}

function returnFromActorProfile() {
  const previous = actorReturnState || { view: "explore" };
  actorSequence += 1;
  if (previous.view === "show" && previous.show && previous.episodes) {
    detailReturnView = "show";
    setView("show");
    renderShow(previous.show, previous.episodes);
  } else {
    setView(previous.view);
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
  backButton.textContent = detailReturnView === "actor" ? "← Back to actor" :
    detailReturnView === "show" ? "← Back to show" :
      detailReturnView === "favorites" ? "← Back to favorites" :
        detailReturnView === "watchlist" ? "← Back to watchlist" :
          detailReturnView === "continue" ? "← Back to Continue Watching" : "← Back to results";
  backButton.addEventListener("click", returnFromShow);
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
  showCastList.replaceChildren(createStatusNote("Loading cast…"));
  relatedShowsList.replaceChildren(createStatusNote("Finding shows with overlapping cast…"));
  loadShowDiscovery(show, ++showDiscoverySequence);
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
  const views = ["explore", "favorites", "watchlist", "continue", "show", "actor"];
  currentView = views.includes(view) ? view : "explore";
  if (["explore", "favorites", "watchlist", "continue"].includes(currentView)) {
    currentRootView = currentView;
    previousShowState = undefined;
  }
  if (currentView !== "explore") {
    activeSearchController?.abort();
    activeSearchController = undefined;
    searchSequence += 1;
    searchButton.disabled = false;
  }
  for (const button of navButtons) {
    const active = button.dataset.view === currentRootView;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
  exploreHero.hidden = currentView !== "explore";
  searchSection.hidden = currentView !== "explore" || !hasSearchResults;
  showSection.hidden = currentView !== "show";
  actorSection.hidden = currentView !== "actor";
  favoritesSection.hidden = currentView !== "favorites";
  watchlistSection.hidden = currentView !== "watchlist";
  continueSection.hidden = currentView !== "continue";
  clearStatus();
  if (currentView === "favorites") renderFavorites();
  if (currentView === "watchlist") renderWatchlist();
  if (currentView === "continue") renderContinueWatching();
}

function returnFromShow() {
  showDiscoverySequence += 1;
  if (detailReturnView === "actor") {
    setView("actor");
    return;
  }
  if (detailReturnView === "show" && previousShowState) {
    const previous = previousShowState;
    previousShowState = undefined;
    detailReturnView = previous.returnView;
    setView("show");
    renderShow(previous.show, previous.episodes);
    return;
  }
  showSection.hidden = true;
  setView(detailReturnView);
}

function createImage(source, alt) {
  if (!source) return null;
  const image = document.createElement("img");
  image.src = source;
  image.alt = alt || "";
  image.loading = "lazy";
  image.addEventListener("error", () => {
    const placeholderClass = image.classList.contains("episode-image")
      ? "episode-image-placeholder"
      : image.classList.contains("actor-profile-image")
        ? "actor-placeholder actor-profile-image"
        : image.classList.contains("actor-card-image")
          ? "actor-placeholder actor-card-image"
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
