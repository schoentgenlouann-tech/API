# TV Show Explorer

TV Show Explorer is a browser-based app for discovering TV shows and actors, exploring episode and cast information, and keeping track of what you want to watch.

## Purpose

The app lets you:

- Search TVmaze for TV shows or actors.
- Browse show details, seasons, episodes, and main cast.
- Explore an actor's TV filmography and discover related shows.
- Save favorite shows and organize a watchlist.
- Mark episodes as watched and track progress in the Continue Watching view.

## Data collection

Show, episode, cast, actor, and credit information is retrieved from the public [TVmaze API](https://www.tvmaze.com/api) when you use the app. Search terms entered in Explore are sent to TVmaze to retrieve results. Favorites, watch statuses, and watched episode IDs stay in your browser and are not sent to TVmaze or a project server. TVmaze API data is licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/): credit TVmaze and follow the ShareAlike provision when reusing the data. The app footer links to TVmaze and the license. This is separate from the license for this project's source code.

## Data persistence

Favorites, watch statuses, and watched episode IDs are saved in your browser's `localStorage`. This keeps your lists available on later visits in the same browser, but they are not synced between browsers or devices. TVmaze information is fetched from the API and cached in memory while the page is open.

## User interaction

Use the Explore page to search by show or actor name. Select a result to see its details and related discovery information. Use the navigation to open My Favorites, My Watchlist, or Continue Watching. From a show's page, you can mark episodes watched; in the watchlist, you can set a show to Want to Watch, Currently Watching, Completed, or Dropped.

## Setup

No package installation or build step is required. You need a modern browser and an internet connection to retrieve TVmaze data.

1. Clone the repository:

   ```sh
   git clone https://github.com/schoentgenlouann-tech/API.git
   cd API
   ```

2. Start a local static web server from the project directory. For example, with Python:

   ```sh
   python3 -m http.server 8000
   ```

3. Open the local preview at [http://127.0.0.1:8000](http://127.0.0.1:8000). This URL works only on the computer running the server while it is running; it is not a public deployment.

The app consists of `index.html`, `styles.css`, and `app.js`.

## Learning

This project demonstrates how to build a multi-view browser app using a public API without a backend or framework. A key challenge is that show and actor pages depend on several related API responses; the app loads these asynchronously, caches responses during the session, and displays status messages when requests fail. Browser `localStorage` provides a simple way to persist personal viewing data without creating accounts.

## Limitations and assistance

- The app requires an internet connection and TVmaze's API to search and load catalog information.
- Favorites and watch progress are local to the current browser profile. Clearing browser storage removes them.
- Catalog information depends on TVmaze's coverage and may be incomplete or change over time.
- GitHub Copilot assisted in preparing this README. TVmaze is the external data service; no external source code or additional runtime dependencies are required by the project.
