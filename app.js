"use strict";

const API_BASE = (window.CAMPUS_API_BASE || "/api").replace(/\/$/, "");
const CATEGORY_COLORS = {
  Academic: "category-academic",
  Social: "category-social",
  Career: "category-career",
  "Arts & culture": "category-arts-culture",
  Sports: "category-sports"
};

const sampleEvents = [
  { id: "sample-1", title: "Design your own future", category: "Career", date: "2026-10-17", time: "14:00", location: "Innovation Hub", description: "A hands-on workshop to turn big ideas into a plan.", organizer: "Career Center", attendees: 42 },
  { id: "sample-2", title: "Pumpkin painting & chai", category: "Social", date: "2026-10-19", time: "16:30", location: "The Quad", description: "A cozy little creative break. All supplies are on us.", organizer: "Campus Life", attendees: 28 },
  { id: "sample-3", title: "The science of sleep", category: "Academic", date: "2026-10-21", time: "12:00", location: "Hawthorne Hall 204", description: "A lunchtime talk with Dr. Lin and the wellness team.", organizer: "Student Wellness", attendees: 67 },
  { id: "sample-4", title: "Campus After Dark", category: "Social", date: "2026-10-24", time: "19:00", location: "South Lawn", description: "One night, a hundred stories. Music, food, and good people.", organizer: "Campus Life", attendees: 89 },
  { id: "sample-5", title: "Sunday morning run club", category: "Sports", date: "2026-10-25", time: "09:00", location: "Meet at the Library steps", description: "Every pace, every face. Coffee after the loop.", organizer: "Run Club", attendees: 31 },
  { id: "sample-6", title: "Printmaking for beginners", category: "Arts & culture", date: "2026-10-28", time: "15:30", location: "Fine Arts Studio", description: "Make a one-of-a-kind print and meet fellow makers.", organizer: "Arts Society", attendees: 19 },
  { id: "sample-7", title: "Research, reimagined", category: "Academic", date: "2026-11-02", time: "13:00", location: "Library, West Wing", description: "Student researchers share what they're working on.", organizer: "Research Office", attendees: 54 }
];

let events = [];
let demoMode = false;
let viewMode = "overview";
let selectedDate = null;
let sortAscending = true;
let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let toastTimer;
let editingEventId = null;
let activeDetailsEvent = null;
let displayLimit = 8;
const FAVORITES_KEY = "campusly:saved-events";
const RSVPS_KEY = "campusly:rsvps";
const RATINGS_KEY = "campusly:event-ratings";
const NOTIFICATIONS_READ_KEY = "campusly:notifications-read";
const favoriteIds = readStoredIds(FAVORITES_KEY);
const rsvpIds = readStoredIds(RSVPS_KEY);
const readNotificationIds = readStoredIds(NOTIFICATIONS_READ_KEY);
const eventRatings = readStoredRatings();

const $ = (selector) => document.querySelector(selector);
const eventList = $("#event-list");
const emptyState = $("#empty-state");
const searchInput = $("#search-input");
const categoryFilter = $("#category-filter");
const banner = $("#api-banner");
const dialog = $("#event-dialog");
const detailsDialog = $("#details-dialog");
let spotlightEventId = null;

function readStoredIds(key) {
  try {
    const stored = JSON.parse(localStorage.getItem(key) || "[]");
    return new Set(Array.isArray(stored) ? stored.map(String) : []);
  } catch (error) {
    console.warn(`Could not load saved Campusly preferences (${key}).`, error);
    return new Set();
  }
}

function readStoredRatings() {
  try {
    const ratings = JSON.parse(localStorage.getItem(RATINGS_KEY) || "{}");
    return ratings && typeof ratings === "object" && !Array.isArray(ratings) ? ratings : {};
  } catch (error) {
    console.warn("Could not load saved Campusly ratings.", error);
    return {};
  }
}

function persistRatings() {
  try {
    localStorage.setItem(RATINGS_KEY, JSON.stringify(eventRatings));
    return true;
  } catch (error) {
    console.error("Could not save Campusly ratings.", error);
    showToast("Your rating is active for this session but couldn't be saved on this device.");
    return false;
  }
}

function persistIds(key, ids) {
  try {
    localStorage.setItem(key, JSON.stringify([...ids]));
    return true;
  } catch (error) {
    console.error(`Could not save Campusly preferences (${key}).`, error);
    showToast("Your change is active for this session but couldn't be saved on this device.");
    return false;
  }
}

function attendeeCount(event) {
  const id = String(event.id);
  const localEvent = demoMode || id.startsWith("sample-") || id.startsWith("local-");
  return event.attendees + (localEvent && rsvpIds.has(id) ? 1 : 0);
}

function dateAtLocalMidnight(value) {
  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeEvent(event) {
  if (!event || typeof event !== "object") return null;
  const dateValue = event.date || event.event_date || event.start_date;
  const id = event.id ?? event.event_id;
  if (!event.title || !dateValue || id == null) return null;
  const date = String(dateValue).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || toDateString(dateAtLocalMidnight(date)) !== date) return null;
  return {
    id,
    title: String(event.title),
    category: String(event.category || "Social"),
    date,
    time: String(event.time || event.start_time || "12:00").slice(0, 5),
    location: String(event.location || "Campus"),
    description: String(event.description || ""),
    organizer: String(event.organizer || event.organizer_name || ""),
    attendees: Number(event.attendees ?? event.attendee_count ?? 0) || 0,
    capacity: event.capacity == null || !Number.isFinite(Number(event.capacity)) ? null : Number(event.capacity),
    rating: Number(event.average_rating ?? event.rating) || 0
  };
}

function showBanner(message, canRetry = true) {
  $("#api-banner-text").textContent = message;
  $("#retry-api").hidden = !canRetry;
  banner.hidden = false;
}

function hideBanner() {
  banner.hidden = true;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers }
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `API request failed (${response.status})`);
  }
  if (response.status === 204) return null;
  const body = await response.text();
  return body ? JSON.parse(body) : null;
}

function unwrapEvents(payload) {
  const list = Array.isArray(payload) ? payload : payload?.events;
  if (!Array.isArray(list)) throw new Error("The events API should return a JSON array or an { events: [] } object.");
  return list.map((event, index) => {
    const normalized = normalizeEvent(event);
    if (!normalized) throw new Error(`Event at position ${index + 1} is missing a valid id, title, or date.`);
    return normalized;
  });
}

async function loadEvents() {
  try {
    events = unwrapEvents(await requestJson(`${API_BASE}/events`));
    demoMode = false;
    hideBanner();
  } catch (error) {
    events = sampleEvents.map(normalizeEvent).filter(Boolean);
    demoMode = true;
    showBanner("API unavailable here. Showing sample events; changes stay in this browser session. Check the Flask API or serve the page from the same origin.", true);
  }
  render();
}

function formatTime(time) {
  if (!time) return "12:00 PM";
  const [hours, minutes] = time.split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 || 12}:${String(minutes || 0).padStart(2, "0")} ${suffix}`;
}

function getVisibleEvents() {
  const today = dateAtLocalMidnight(toDateString(new Date()));
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + 7);
  const query = searchInput.value.trim().toLowerCase();
  const category = categoryFilter.value;
  return events.filter((event) => {
    const eventDate = dateAtLocalMidnight(event.date);
    const isUpcoming = eventDate >= today;
    const matchesView = viewMode === "all" || ((viewMode === "overview" || viewMode === "upcoming") && isUpcoming) || (viewMode === "week" && isUpcoming && eventDate <= weekEnd) || (viewMode === "past" && !isUpcoming) || (viewMode === "saved" && favoriteIds.has(String(event.id))) || (viewMode === "rated" && (event.rating > 0 || Number(eventRatings[String(event.id)]) > 0));
    const matchesQuery = !query || [event.title, event.category, event.location, event.description, event.organizer].join(" ").toLowerCase().includes(query);
    return matchesView && matchesQuery && (!category || event.category === category) && (!selectedDate || event.date === selectedDate);
  }).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time) * (sortAscending ? 1 : -1));
}

function renderEvents() {
  const visible = getVisibleEvents();
  eventList.replaceChildren();
  $("#results-count").textContent = `${visible.length} ${visible.length === 1 ? "event" : "events"}`;
  $("#event-heading").textContent = ({
    overview: "Coming up",
    upcoming: "Upcoming events",
    week: "This week",
    all: "All events",
    saved: "Saved events",
    rated: "Rated events",
    past: "Past events"
  })[viewMode] || "Campus events";
  renderActiveFilters();
  emptyState.hidden = visible.length > 0;
  eventList.hidden = visible.length === 0;
  visible.slice(0, displayLimit).forEach((event) => {
    const date = dateAtLocalMidnight(event.date);
    const card = document.createElement("article");
    card.className = "event-card";
    const dateTile = document.createElement("div");
    dateTile.className = "event-date-tile";
    dateTile.innerHTML = `<span class="date-month">${date.toLocaleDateString("en-US", { month: "short" })}</span><strong>${date.getDate()}</strong><small>${formatTime(event.time)}</small>`;

    const main = document.createElement("div");
    main.className = "event-main";
    const meta = document.createElement("div");
    meta.className = "event-meta";
    const category = document.createElement("span");
    category.className = `event-category ${CATEGORY_COLORS[event.category] || ""}`;
    category.textContent = event.category;
    const location = document.createElement("span");
    location.textContent = `⌖ ${event.location}`;
    meta.append(category, location);
    const title = document.createElement("h3");
    const titleButton = document.createElement("button");
    titleButton.className = "event-title-button";
    titleButton.type = "button";
    titleButton.textContent = event.title;
    titleButton.addEventListener("click", () => openEventDetails(event));
    title.append(titleButton);
    const description = document.createElement("p");
    description.className = "event-description";
    description.textContent = event.description || `Organized by ${event.organizer || "Campus community"}`;
    main.append(meta, title, description);

    const side = document.createElement("div");
    side.className = "event-side";
    const attendees = document.createElement("span");
    attendees.className = "attendee-count";
    const attendingCount = attendeeCount(event);
    attendees.innerHTML = `<b>${attendingCount}</b>${event.capacity ? ` / ${event.capacity}` : ""} going`;
    const actions = document.createElement("div");
    actions.className = "event-actions";
    const eventControls = document.createElement("div");
    eventControls.className = "event-controls";
    const favorite = document.createElement("button");
    favorite.type = "button";
    favorite.className = `favorite-button${favoriteIds.has(String(event.id)) ? " is-favorite" : ""}`;
    favorite.setAttribute("aria-label", favoriteIds.has(String(event.id)) ? `Remove ${event.title} from saved events` : `Save ${event.title}`);
    favorite.setAttribute("aria-pressed", String(favoriteIds.has(String(event.id))));
    favorite.textContent = favoriteIds.has(String(event.id)) ? "♥" : "♡";
    favorite.addEventListener("click", () => toggleFavorite(event));
    const rsvp = document.createElement("button");
    const isGoing = rsvpIds.has(String(event.id));
    const isFull = !isGoing && event.capacity !== null && attendingCount >= event.capacity;
    rsvp.type = "button";
    rsvp.className = `rsvp-button${isGoing ? " is-going" : ""}`;
    rsvp.textContent = isGoing ? "Going ✓" : isFull ? "Full" : "RSVP";
    rsvp.disabled = isFull;
    rsvp.setAttribute("aria-label", isGoing ? `Cancel RSVP for ${event.title}` : `RSVP to ${event.title}`);
    rsvp.addEventListener("click", () => toggleRsvp(event));
    const more = document.createElement("button");
    more.className = "event-more";
    more.type = "button";
    more.setAttribute("aria-label", `Manage ${event.title}`);
    more.title = "Manage event";
    more.textContent = "···";
    const menu = document.createElement("div");
    menu.className = "event-menu";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "Edit event";
    edit.addEventListener("click", () => openEditDialog(event));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "delete-action";
    remove.textContent = "Delete event";
    remove.addEventListener("click", () => deleteEvent(event));
    menu.append(edit, remove);
    more.addEventListener("click", (clickEvent) => {
      clickEvent.stopPropagation();
      document.querySelectorAll(".event-menu.open").forEach((openMenu) => {
        if (openMenu !== menu) openMenu.classList.remove("open");
      });
      menu.classList.toggle("open");
    });
    eventControls.append(favorite, rsvp, more);
    actions.append(eventControls, menu);
    side.append(attendees, actions);
    card.append(dateTile, main, side);
    eventList.append(card);
  });
  if (visible.length > displayLimit) {
    const more = document.createElement("button");
    more.type = "button";
    more.className = "load-more-button";
    more.textContent = `Show ${Math.min(8, visible.length - displayLimit)} more events`;
    more.addEventListener("click", () => {
      displayLimit += 8;
      renderEvents();
    });
    eventList.append(more);
  }
}

function getNotifications() {
  const today = dateAtLocalMidnight(toDateString(new Date()));
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + 7);
  return events
    .filter((event) => {
      const date = dateAtLocalMidnight(event.date);
      return date >= today && date <= weekEnd;
    })
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    .map((event) => {
      const daysUntil = Math.round((dateAtLocalMidnight(event.date) - today) / 86400000);
      const isGoing = rsvpIds.has(String(event.id));
      const dayLabel = daysUntil === 0 ? "Today" : daysUntil === 1 ? "Tomorrow" : `In ${daysUntil} days`;
      return {
        id: `event-${event.id}`,
        event,
        title: isGoing ? "Your event is coming up" : "Coming up on campus",
        message: `${event.title} · ${dayLabel} at ${formatTime(event.time)}`,
        icon: isGoing ? "✓" : "✦",
        isGoing
      };
    })
    .slice(0, 8);
}

function renderNotifications() {
  const notifications = getNotifications();
  const list = $("#notification-list");
  list.replaceChildren();
  const unreadCount = notifications.filter((item) => !readNotificationIds.has(item.id)).length;
  $("#notification-indicator").hidden = unreadCount === 0;
  $("#notification-count").hidden = unreadCount === 0;
  $("#notification-count").textContent = unreadCount > 9 ? "9+" : String(unreadCount);
  $("#notification-button").setAttribute("aria-label", unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications");
  $("#notification-summary").textContent = unreadCount ? `${unreadCount} new · Next 7 days` : "Your next 7 days on campus";
  $("#mark-notifications-read").disabled = unreadCount === 0;

  if (!notifications.length) {
    const empty = document.createElement("div");
    empty.className = "notification-empty";
    empty.innerHTML = "<span>✧</span><strong>A little quiet around here</strong><p>New events will show up here when they're happening soon.</p>";
    list.append(empty);
    return;
  }

  notifications.forEach((notification) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `notification-item${readNotificationIds.has(notification.id) ? "" : " unread"}`;
    const icon = document.createElement("span");
    icon.className = `notification-item-icon${notification.isGoing ? " going" : ""}`;
    icon.textContent = notification.icon;
    const copy = document.createElement("span");
    copy.className = "notification-item-copy";
    const title = document.createElement("strong");
    title.textContent = notification.title;
    const message = document.createElement("span");
    message.textContent = notification.message;
    copy.append(title, message);
    const unread = document.createElement("i");
    unread.className = "notification-unread-dot";
    unread.hidden = readNotificationIds.has(notification.id);
    button.append(icon, copy, unread);
    button.addEventListener("click", () => {
      readNotificationIds.add(notification.id);
      persistIds(NOTIFICATIONS_READ_KEY, readNotificationIds);
      closeNotificationPopover();
      renderNotifications();
      openEventDetails(notification.event);
    });
    list.append(button);
  });
}

function renderSpotlight() {
  const today = dateAtLocalMidnight(toDateString(new Date()));
  const upcoming = events
    .filter((event) => dateAtLocalMidnight(event.date) >= today)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const event = upcoming.find((item) => item.category === "Social") || upcoming[0];
  spotlightEventId = event ? String(event.id) : null;
  const card = $("#spotlight-card");
  card.classList.toggle("spotlight-empty", !event);
  if (!event) {
    $("#spotlight-badge").textContent = "✦ CAMPUS SPOTLIGHT";
    $("#spotlight-category").textContent = "Campus life";
    $("#spotlight-category").className = "event-category";
    $("#spotlight-date").textContent = "No upcoming events yet";
    $("#spotlight-title").textContent = "Start something good";
    $("#spotlight-description").textContent = "Create the next event your campus will be talking about.";
    $("#spotlight-attendees").textContent = "Be the first to organize";
    return;
  }
  const date = dateAtLocalMidnight(event.date);
  $("#spotlight-badge").textContent = "✦ UP NEXT ON CAMPUS";
  $("#spotlight-category").textContent = event.category;
  $("#spotlight-category").className = `event-category ${CATEGORY_COLORS[event.category] || ""}`;
  $("#spotlight-date").textContent = `${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${formatTime(event.time)}`;
  $("#spotlight-title").textContent = event.title;
  $("#spotlight-description").textContent = event.description || `Join ${event.organizer || "the campus community"} at ${event.location}.`;
  $("#spotlight-attendees").textContent = `${attendeeCount(event)} ${attendeeCount(event) === 1 ? "student" : "students"} going`;
}

function renderActiveFilters() {
  const container = $("#active-filters");
  container.replaceChildren();
  const filters = [];
  if (searchInput.value.trim()) filters.push(["Search", () => { searchInput.value = ""; }]);
  if (categoryFilter.value) filters.push([categoryFilter.value, () => { categoryFilter.value = ""; }]);
  if (selectedDate) filters.push([dateAtLocalMidnight(selectedDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }), () => { selectedDate = null; }]);
  filters.forEach(([label, clear]) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "filter-chip";
    chip.setAttribute("aria-label", `Remove ${label} filter`);
    const text = document.createElement("span");
    text.textContent = label;
    const close = document.createElement("span");
    close.setAttribute("aria-hidden", "true");
    close.textContent = "×";
    chip.append(text, close);
    chip.addEventListener("click", () => {
      clear();
      displayLimit = 8;
      render();
    });
    container.append(chip);
  });
  $("#clear-filters").hidden = filters.length === 0;
}

function renderStats() {
  const today = dateAtLocalMidnight(toDateString(new Date()));
  const upcoming = events.filter((event) => dateAtLocalMidnight(event.date) >= today);
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + 7);
  const thisWeek = upcoming.filter((event) => dateAtLocalMidnight(event.date) <= weekEnd).length;
  $("#upcoming-stat").textContent = upcoming.length;
  $("#week-stat").textContent = thisWeek;
  $("#attendee-stat").textContent = upcoming.reduce((sum, event) => sum + attendeeCount(event), 0).toLocaleString();
  const ratedEvents = events
    .map((event) => Number(eventRatings[String(event.id)]) || event.rating)
    .filter((rating) => rating > 0);
  const averageRating = ratedEvents.length
    ? (ratedEvents.reduce((sum, rating) => sum + rating, 0) / ratedEvents.length).toFixed(1)
    : "0";
  $("#love-stat").textContent = averageRating;
  $("#event-nav-count").textContent = events.length;
  $("#saved-nav-count").textContent = favoriteIds.size;
}

function renderCalendar() {
  const grid = $("#calendar-grid");
  grid.replaceChildren();
  $("#calendar-month").textContent = calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  ["S", "M", "T", "W", "T", "F", "S"].forEach((name) => {
    const label = document.createElement("span");
    label.className = "calendar-day-name";
    label.textContent = name;
    grid.append(label);
  });
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const startOffset = new Date(year, month, 1).getDay();
  const monthDays = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();
  const count = Math.ceil((startOffset + monthDays) / 7) * 7;
  const eventDates = new Set(events.map((event) => event.date));
  for (let index = 0; index < count; index += 1) {
    let day, date, muted = false;
    if (index < startOffset) {
      day = prevMonthDays - startOffset + index + 1;
      date = new Date(year, month - 1, day);
      muted = true;
    } else if (index >= startOffset + monthDays) {
      day = index - startOffset - monthDays + 1;
      date = new Date(year, month + 1, day);
      muted = true;
    } else {
      day = index - startOffset + 1;
      date = new Date(year, month, day);
    }
    const dateValue = toDateString(date);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `calendar-day${muted ? " muted" : ""}${dateValue === toDateString(new Date()) ? " today" : ""}${dateValue === selectedDate ? " selected" : ""}${eventDates.has(dateValue) ? " has-event" : ""}`;
    button.textContent = day;
    button.setAttribute("aria-label", date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }));
    button.addEventListener("click", () => {
      selectedDate = selectedDate === dateValue ? null : dateValue;
      viewMode = "all";
      displayLimit = 8;
      render();
    });
    grid.append(button);
  }
}

function render() {
  renderStats();
  renderEvents();
  renderCalendar();
  renderNotifications();
  renderSpotlight();
  document.querySelectorAll(".nav-link").forEach((link) => {
    link.classList.toggle("active", link.dataset.view === viewMode);
  });
  document.querySelectorAll(".stat-interactive").forEach((card) => {
    card.classList.toggle("stat-selected", card.dataset.dashboardView === viewMode || (viewMode === "overview" && card.dataset.dashboardView === "upcoming"));
  });
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 3200);
}

function toggleFavorite(event) {
  const id = String(event.id);
  if (favoriteIds.has(id)) {
    favoriteIds.delete(id);
    showToast("Removed from your saved events.");
  } else {
    favoriteIds.add(id);
    showToast("Saved for later. Find it in Saved events.");
  }
  persistIds(FAVORITES_KEY, favoriteIds);
  render();
}

async function toggleRsvp(event) {
  const id = String(event.id);
  const isGoing = rsvpIds.has(id);
  const isDemoEvent = demoMode || id.startsWith("sample-") || id.startsWith("local-");
  if (!isDemoEvent) {
    try {
      const response = await requestJson(`${API_BASE}/events/${encodeURIComponent(event.id)}/rsvp`, {
        method: isGoing ? "DELETE" : "POST"
      });
      const responseEvent = response?.event ?? response;
      const updated = normalizeEvent(responseEvent);
      const hasAttendeeCount = responseEvent && (responseEvent.attendees != null || responseEvent.attendee_count != null);
      const replacement = updated ? {
        ...updated,
        attendees: hasAttendeeCount ? updated.attendees : Math.max(0, event.attendees + (isGoing ? -1 : 1))
      } : {
        ...event,
        attendees: Math.max(0, event.attendees + (isGoing ? -1 : 1))
      };
      events = events.map((item) => String(item.id) === id ? replacement : item);
      if (activeDetailsEvent && String(activeDetailsEvent.id) === id) activeDetailsEvent = replacement;
    } catch (error) {
      showToast(`Couldn't ${isGoing ? "cancel" : "confirm"} your RSVP: ${error.message}`);
      return;
    }
  }
  if (isGoing) {
    rsvpIds.delete(id);
    showToast("Your RSVP was cancelled.");
  } else {
    rsvpIds.add(id);
    showToast("You're on the list! See you there.");
  }
  persistIds(RSVPS_KEY, rsvpIds);
  render();
  if (activeDetailsEvent && String(activeDetailsEvent.id) === id) updateDetailsRsvpButton();
}

function openEventDetails(event) {
  activeDetailsEvent = event;
  $("#details-title").textContent = event.title;
  $("#details-meta").replaceChildren();
  const category = document.createElement("span");
  category.className = `event-category ${CATEGORY_COLORS[event.category] || ""}`;
  category.textContent = event.category;
  const when = document.createElement("span");
  when.textContent = `${dateAtLocalMidnight(event.date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} · ${formatTime(event.time)}`;
  $("#details-meta").append(category, when);
  $("#details-description").textContent = event.description || "No description has been added yet.";
  renderRatingPicker(event);
  const facts = $("#details-facts");
  facts.replaceChildren();
  [
    ["Location", event.location],
    ["Hosted by", event.organizer || "Campus community"],
    ["Attending", `${attendeeCount(event)}${event.capacity ? ` / ${event.capacity}` : ""} people`]
  ].forEach(([label, value]) => {
    const row = document.createElement("div");
    row.className = "details-fact";
    const name = document.createElement("span");
    name.textContent = label;
    const content = document.createElement("strong");
    content.textContent = value;
    row.append(name, content);
    facts.append(row);
  });
  updateDetailsRsvpButton();
  detailsDialog.showModal();
}

function renderRatingPicker(event) {
  const picker = $("#rating-picker");
  picker.replaceChildren();
  const rating = Number(eventRatings[String(event.id)]) || 0;
  for (let value = 1; value <= 5; value += 1) {
    const star = document.createElement("button");
    star.type = "button";
    star.className = `rating-star${value <= rating ? " selected" : ""}`;
    star.textContent = value <= rating ? "★" : "☆";
    star.setAttribute("aria-label", `Rate ${value} out of 5`);
    star.setAttribute("aria-pressed", String(value === rating));
    star.addEventListener("click", () => {
      if (Number(eventRatings[String(event.id)]) === value) delete eventRatings[String(event.id)];
      else eventRatings[String(event.id)] = value;
      persistRatings();
      renderRatingPicker(event);
      showToast(eventRatings[String(event.id)] ? `Thanks for rating this event ${value} out of 5!` : "Your event rating was removed.");
    });
    picker.append(star);
  }
}

async function shareEvent() {
  if (!activeDetailsEvent) return;
  const event = activeDetailsEvent;
  const url = new URL(window.location.href);
  url.hash = `event=${encodeURIComponent(event.id)}`;
  const shareData = {
    title: event.title,
    text: `${event.title} · ${dateAtLocalMidnight(event.date).toLocaleDateString("en-US", { month: "long", day: "numeric" })} at ${formatTime(event.time)} · ${event.location}`,
    url: url.toString()
  };
  try {
    if (navigator.share) {
      await navigator.share(shareData);
      return;
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareData.url);
    } else {
      const input = document.createElement("textarea");
      input.value = shareData.url;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.append(input);
      input.select();
      const copied = document.execCommand("copy");
      input.remove();
      if (!copied) throw new Error("Clipboard access is unavailable.");
    }
    showToast("Event link copied. Send it to a friend!");
  } catch (error) {
    if (error.name === "AbortError") return;
    showToast(`Couldn't share the event: ${error.message}`);
  }
}

function updateDetailsRsvpButton() {
  if (!activeDetailsEvent) return;
  const isGoing = rsvpIds.has(String(activeDetailsEvent.id));
  const currentCount = attendeeCount(activeDetailsEvent);
  const full = !isGoing && activeDetailsEvent.capacity !== null &&
    currentCount >= activeDetailsEvent.capacity;
  const button = $("#details-rsvp");
  button.textContent = isGoing ? "Cancel RSVP" : full ? "Event is full" : "RSVP to this event";
  button.disabled = full;
  button.classList.toggle("button-quiet", isGoing);
  button.classList.toggle("button-primary", !isGoing);
}

function escapeCalendarText(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function downloadCalendarEvent() {
  if (!activeDetailsEvent) return;
  const event = activeDetailsEvent;
  const start = `${event.date.replace(/-/g, "")}T${event.time.replace(":", "")}00`;
  const endDate = dateAtLocalMidnight(event.date);
  const [hours, minutes] = event.time.split(":").map(Number);
  endDate.setHours(hours + 1, minutes, 0, 0);
  const end = `${toDateString(endDate).replace(/-/g, "")}T${String(endDate.getHours()).padStart(2, "0")}${String(endDate.getMinutes()).padStart(2, "0")}00`;
  const content = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Campusly//Campus Events//EN",
    "BEGIN:VEVENT", `UID:${escapeCalendarText(event.id)}@campusly`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`,
    `DTSTART:${start}`, `DTEND:${end}`, `SUMMARY:${escapeCalendarText(event.title)}`,
    `LOCATION:${escapeCalendarText(event.location)}`, `DESCRIPTION:${escapeCalendarText(event.description)}`,
    "END:VEVENT", "END:VCALENDAR"
  ].join("\r\n");
  const link = document.createElement("a");
  const downloadUrl = URL.createObjectURL(new Blob([content], { type: "text/calendar;charset=utf-8" }));
  link.href = downloadUrl;
  link.download = `${event.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "campus-event"}.ics`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  showToast("Calendar file downloaded.");
}

function openCreateDialog() {
  $("#event-form").reset();
  editingEventId = null;
  $("#form-error").hidden = true;
  $("#form-error").textContent = "";
  $("#dialog-title").innerHTML = "Create an event <span>✳</span>";
  $("#publish-label").textContent = "Publish event";
  const today = toDateString(new Date());
  $("input[name='date']").min = today;
  $("input[name='date']").value = today;
  dialog.showModal();
  $("input[name='title']").focus();
}

function openEditDialog(event) {
  editingEventId = event.id;
  $("#form-error").hidden = true;
  $("#form-error").textContent = "";
  $("#dialog-title").innerHTML = "Edit your event <span>✳</span>";
  $("#publish-label").textContent = "Save changes";
  const form = $("#event-form");
  form.elements.title.value = event.title;
  form.elements.category.value = event.category;
  form.elements.location.value = event.location;
  form.elements.date.value = event.date;
  form.elements.date.min = "";
  form.elements.time.value = event.time;
  form.elements.organizer.value = event.organizer;
  form.elements.capacity.value = event.capacity ?? "";
  form.elements.description.value = event.description;
  dialog.showModal();
  form.elements.title.focus();
}

async function saveEvent(formData) {
  const existing = editingEventId === null ? null : events.find((item) => item.id === editingEventId);
  const event = {
    title: formData.get("title").trim(),
    category: formData.get("category"),
    location: formData.get("location").trim(),
    date: formData.get("date"),
    time: formData.get("time"),
    organizer: formData.get("organizer").trim() || "Campus community",
    capacity: formData.get("capacity") ? Number(formData.get("capacity")) : null,
    description: formData.get("description").trim(),
    attendees: existing?.attendees || 0,
    rating: existing?.rating || 0
  };
  if (demoMode || String(editingEventId).startsWith("sample-") || String(editingEventId).startsWith("local-")) {
    if (editingEventId !== null) {
      events = events.map((item) => item.id === editingEventId ? { ...item, ...event, attendees: item.attendees, rating: item.rating } : item);
    } else {
      events.push({ ...event, id: `local-${Date.now()}` });
    }
    render();
    dialog.close();
    showToast(demoMode ? "Changes saved to this demo session. Connect the API to save them permanently." : "Event updated.");
    return;
  }
  try {
    const isEditing = editingEventId !== null;
    const fallback = { ...event, id: editingEventId ?? `local-${Date.now()}` };
    const result = await requestJson(
      isEditing ? `${API_BASE}/events/${encodeURIComponent(editingEventId)}` : `${API_BASE}/events`,
      { method: isEditing ? "PUT" : "POST", body: JSON.stringify(event) }
    );
    const payload = result?.event ?? (result && Object.keys(result).length ? result : fallback);
    const saved = normalizeEvent(payload);
    if (!saved) throw new Error("The API did not return a valid event.");
    if (isEditing) events = events.map((item) => item.id === editingEventId ? saved : item);
    else events.push(saved);
    render();
    dialog.close();
    showToast(isEditing ? "Event updated." : "Your event is live. Let the good times begin!");
  } catch (error) {
    $("#form-error").textContent = `Couldn't publish event: ${error.message}`;
    $("#form-error").hidden = false;
  }
}

async function deleteEvent(event) {
  const confirmed = window.confirm(`Delete "${event.title}"? This can't be undone.`);
  if (!confirmed) return;
  if (demoMode || String(event.id).startsWith("sample-") || String(event.id).startsWith("local-")) {
    events = events.filter((item) => item.id !== event.id);
    favoriteIds.delete(String(event.id));
    rsvpIds.delete(String(event.id));
    persistIds(FAVORITES_KEY, favoriteIds);
    persistIds(RSVPS_KEY, rsvpIds);
    render();
    showToast(demoMode ? "Event removed from this demo session." : "Event deleted.");
    return;
  }
  try {
    await requestJson(`${API_BASE}/events/${encodeURIComponent(event.id)}`, { method: "DELETE" });
    events = events.filter((item) => item.id !== event.id);
    favoriteIds.delete(String(event.id));
    rsvpIds.delete(String(event.id));
    persistIds(FAVORITES_KEY, favoriteIds);
    persistIds(RSVPS_KEY, rsvpIds);
    render();
    showToast("Event deleted.");
  } catch (error) {
    showToast(`Couldn't delete event: ${error.message}`);
  }
}

function setView(view) {
  viewMode = view;
  selectedDate = null;
  displayLimit = 8;
  render();
  $("#events").scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeNotificationPopover() {
  $("#notification-popover").hidden = true;
  $("#notification-button").setAttribute("aria-expanded", "false");
}

$("#today-label").textContent = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date()).toUpperCase();
$("#create-event-button").addEventListener("click", openCreateDialog);
$("#empty-create-button").addEventListener("click", openCreateDialog);
$("#tip-create-button").addEventListener("click", openCreateDialog);
$("#dialog-close").addEventListener("click", () => dialog.close());
$("#cancel-event").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
$("#details-close").addEventListener("click", () => detailsDialog.close());
detailsDialog.addEventListener("click", (event) => { if (event.target === detailsDialog) detailsDialog.close(); });
$("#details-rsvp").addEventListener("click", () => {
  if (activeDetailsEvent) toggleRsvp(activeDetailsEvent);
});
$("#calendar-download").addEventListener("click", downloadCalendarEvent);
$("#share-event").addEventListener("click", shareEvent);
$("#event-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!event.currentTarget.reportValidity()) return;
  saveEvent(new FormData(event.currentTarget));
});
searchInput.addEventListener("input", () => { displayLimit = 8; renderEvents(); });
categoryFilter.addEventListener("change", () => { displayLimit = 8; renderEvents(); });
$("#sort-button").addEventListener("click", () => {
  sortAscending = !sortAscending;
  $("#sort-button").title = sortAscending ? "Sort by date, earliest first" : "Sort by date, latest first";
  renderEvents();
});
$("#prev-month").addEventListener("click", () => { calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1); renderCalendar(); });
$("#next-month").addEventListener("click", () => { calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1); renderCalendar(); });
$("#clear-date").addEventListener("click", () => { selectedDate = null; render(); });
$("#clear-filters").addEventListener("click", () => {
  searchInput.value = "";
  categoryFilter.value = "";
  selectedDate = null;
  displayLimit = 8;
  render();
});
$("#view-all-link").addEventListener("click", () => setView("all"));
$("#spotlight-action").addEventListener("click", () => {
  const spotlight = events.find((event) => String(event.id) === spotlightEventId);
  if (spotlight) {
    openEventDetails(spotlight);
  } else openCreateDialog();
});
document.querySelectorAll(".nav-link").forEach((link) => link.addEventListener("click", (event) => {
  event.preventDefault();
  const view = link.dataset.view;
  if (view === "overview") {
    viewMode = "overview";
    selectedDate = null;
    displayLimit = 8;
    render();
  } else setView(view);
  if (window.innerWidth <= 620) $("#sidebar").classList.remove("open");
}));
document.querySelectorAll(".category-link").forEach((button) => button.addEventListener("click", () => {
  categoryFilter.value = categoryFilter.value === button.dataset.category ? "" : button.dataset.category;
  viewMode = "all";
  displayLimit = 8;
  render();
  $("#events").scrollIntoView({ behavior: "smooth", block: "start" });
}));
document.querySelectorAll(".stat-interactive").forEach((card) => {
  const openDashboardView = () => {
    searchInput.value = "";
    categoryFilter.value = "";
    setView(card.dataset.dashboardView);
  };
  card.addEventListener("click", openDashboardView);
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openDashboardView();
    }
  });
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".event-actions")) {
    document.querySelectorAll(".event-menu.open").forEach((menu) => menu.classList.remove("open"));
  }
});
$("#mobile-menu").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
$("#help-button").addEventListener("click", () => showToast("Browse events, filter by what you love, or create one for your community."));
$("#notification-button").addEventListener("click", () => {
  const popover = $("#notification-popover");
  const isOpening = popover.hidden;
  popover.hidden = !isOpening;
  $("#notification-button").setAttribute("aria-expanded", String(isOpening));
  if (isOpening) renderNotifications();
});
$("#mark-notifications-read").addEventListener("click", () => {
  getNotifications().forEach((notification) => readNotificationIds.add(notification.id));
  persistIds(NOTIFICATIONS_READ_KEY, readNotificationIds);
  renderNotifications();
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".notification-wrap")) closeNotificationPopover();
});
$("#dismiss-banner").addEventListener("click", hideBanner);
$("#retry-api").addEventListener("click", loadEvents);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeNotificationPopover();
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    searchInput.focus();
  }
});

loadEvents().then(() => {
  const eventId = new URLSearchParams(window.location.hash.slice(1)).get("event");
  if (!eventId) return;
  const sharedEvent = events.find((event) => String(event.id) === eventId);
  if (sharedEvent) openEventDetails(sharedEvent);
});
