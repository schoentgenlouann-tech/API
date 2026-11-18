const API_BASE = "https://api.tvmaze.com";
const searchForm = document.querySelector("#search-form");
const searchInput = document.querySelector("#show-query");
const searchButton = searchForm.querySelector("button");
const statusMessage = document.querySelector("#status-message");
const searchSection = document.querySelector("#search-section");
const resultsContainer = document.querySelector("#show-results");
const resultCount = document.querySelector("#result-count");
const showSection = document.querySelector("#show-section");
const showDetails = document.querySelector("#show-details");
const episodeTotal = document.querySelector("#episode-total");
const seasonSelect = document.querySelector("#season-select");
const seasonList = document.querySelector("#season-list");

const searchCache = new Map();
const episodeCache = new Map();
let activeSearchController;
let activeEpisodeController;
let searchSequence = 0;
let episodeSequence = 0;

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  searchShows(searchInput.value);
});

seasonSelect.addEventListener("change", () => {
  const season = document.querySelector(`#season-${CSS.escape(seasonSelect.value)}`);
  if (!season) return;
  season.open = true;
  season.scrollIntoView({ behavior: "smooth", block: "start" });
});

async function searchShows(rawQuery) {
  const query = rawQuery.trim();
  if (!query) {
    showStatus("Enter a show name to start your search.", "error");
    searchInput.focus();
    return;
  }

  activeSearchController?.abort();
  activeEpisodeController?.abort();
  const controller = new AbortController();
  activeSearchController = controller;
  const sequence = ++searchSequence;
  searchButton.disabled = true;
  showStatus("Searching TVmaze…");
  searchSection.hidden = true;
  showSection.hidden = true;
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
  searchSection.hidden = false;
}

function createShowCard(show) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "show-card";
  button.setAttribute("aria-label", `View episodes for ${show.name}`);

  const image = createImage(show.image?.medium, show.name);
  if (image) button.append(image);
  else button.append(createPlaceholder("poster-placeholder", "▣"));

  const copy = document.createElement("div");
  copy.className = "show-card-copy";
  const title = document.createElement("h3");
  title.textContent = show.name || "Untitled show";
  const description = document.createElement("p");
  description.textContent = summaryText(show.summary) || "No description available.";
  const meta = document.createElement("p");
  meta.className = "show-meta";
  meta.textContent = [premiereYear(show.premiered), show.genres?.slice(0, 2).join(" · ")].filter(Boolean).join(" · ") || "TV series";
  copy.append(title, description, meta);
  button.append(copy);
  button.addEventListener("click", () => loadShow(show));
  return button;
}

async function loadShow(show) {
  if (!Number.isInteger(show.id) || show.id <= 0) {
    showStatus("This result has an invalid TVmaze show ID. Choose another show.", "error");
    return;
  }
  activeEpisodeController?.abort();
  const controller = new AbortController();
  activeEpisodeController = controller;
  const sequence = ++episodeSequence;
  resultsContainer.querySelectorAll("button").forEach((button) => { button.disabled = true; });
  showSection.hidden = true;
  showStatus(`Loading episodes for ${show.name}…`);

  try {
    let episodes = episodeCache.get(show.id);
    if (!episodes) {
      const response = await fetch(`${API_BASE}/shows/${show.id}/episodes`, { signal: controller.signal });
      if (response.status === 404) throw new Error("TVmaze could not find this show. Please choose another result.");
      if (!response.ok) throw new Error(`TVmaze returned HTTP ${response.status} while loading episodes.`);
      episodes = await response.json();
      if (!Array.isArray(episodes)) throw new Error("TVmaze returned an unexpected episode response.");
      episodeCache.set(show.id, episodes);
    }
    if (sequence !== episodeSequence) return;
    renderShow(show, episodes);
    clearStatus();
    showSection.hidden = false;
  } catch (error) {
    if (error.name === "AbortError") return;
    if (sequence === episodeSequence) showStatus(error.message || "Could not load this show's episodes. Please try again.", "error");
  } finally {
    if (sequence === episodeSequence) {
      resultsContainer.querySelectorAll("button").forEach((button) => { button.disabled = false; });
    }
  }
}

function renderShow(show, episodes) {
  const image = createImage(show.image?.original || show.image?.medium, show.name);
  showDetails.replaceChildren();
  showDetails.append(image || createPlaceholder("show-poster-placeholder", "▣"));

  const info = document.createElement("div");
  info.className = "show-info";
  const title = document.createElement("h2");
  title.id = "show-title";
  title.textContent = show.name || "Untitled show";
  const facts = document.createElement("p");
  facts.className = "show-facts";
  facts.textContent = [premiereYear(show.premiered), show.status, show.type].filter(Boolean).join("  ·  ");
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
  info.append(title, facts, description, genres);
  showDetails.append(info);
  episodeTotal.textContent = episodes.length;
  renderSeasons(episodes);
}

function renderSeasons(episodes) {
  const seasons = new Map();
  for (const episode of episodes) {
    const season = Number.isInteger(episode.season) ? episode.season : 0;
    if (!seasons.has(season)) seasons.set(season, []);
    seasons.get(season).push(episode);
  }

  const sortedSeasons = [...seasons.entries()].sort(([a], [b]) => a - b);
  seasonSelect.replaceChildren();
  seasonList.replaceChildren();
  if (!sortedSeasons.length) {
    seasonSelect.disabled = true;
    const empty = document.createElement("p");
    empty.className = "empty-episodes";
    empty.textContent = "No episodes are currently available for this show.";
    seasonList.append(empty);
    return;
  }

  seasonSelect.disabled = false;
  for (const [seasonNumber, seasonEpisodes] of sortedSeasons) {
    const option = document.createElement("option");
    option.value = String(seasonNumber);
    option.textContent = seasonNumber === 0 ? "Specials" : `Season ${seasonNumber}`;
    seasonSelect.append(option);

    const details = document.createElement("details");
    details.className = "season";
    details.id = `season-${seasonNumber}`;
    details.open = seasonNumber === sortedSeasons[0][0];
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
  seasonSelect.value = String(sortedSeasons[0][0]);
}

function createEpisode(episode) {
  const article = document.createElement("article");
  article.className = "episode";
  if (episode.image?.medium) article.append(createImage(episode.image.medium, episode.name));
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

function createImage(source, alt) {
  if (!source) return null;
  const image = document.createElement("img");
  image.src = source;
  image.alt = alt ? `${alt} poster` : "";
  image.loading = "lazy";
  image.addEventListener("error", () => image.remove(), { once: true });
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
