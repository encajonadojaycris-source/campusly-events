# Campusly — Campus Event Management

A responsive HTML, CSS, and JavaScript dashboard for discovering and managing campus events. It can run on its own with clearly labeled sample data, or connect to a Flask API.

## Run the interface

Open `index.html` in a browser for demo mode. To use the Flask API, serve the files from the same origin as the API (for example, from Flask's `static` directory) and open the served page. By default, the interface requests `/api/events`.

If your API uses another base path, set `window.CAMPUS_API_BASE` before `app.js` loads:

```html
<script>window.CAMPUS_API_BASE = "/campus-api";</script>
<script src="app.js"></script>
```

For cross-origin APIs, configure CORS on the Flask application for the website's origin.

## Flask API contract

The interface expects these endpoints:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/events` | Return a JSON array of events, or `{ "events": [...] }` |
| `POST` | `/api/events` | Create an event from a JSON request body |
| `PUT` | `/api/events/<id>` | Replace/update an event from a JSON request body |
| `DELETE` | `/api/events/<id>` | Delete an event; an empty `204 No Content` response is supported |
| `POST` | `/api/events/<id>/rsvp` | Register the current attendee |
| `DELETE` | `/api/events/<id>/rsvp` | Cancel the current attendee's RSVP |

An event should include `id`, `title`, `category`, `date` (`YYYY-MM-DD`), `time` (`HH:MM`), and `location`. Optional fields include `description`, `organizer`, `attendees`, `capacity`, and `rating` (or `average_rating`). The API may also use `event_date`, `start_date`, `start_time`, `organizer_name`, or `attendee_count` for the corresponding fields.

Successful `POST` and `PUT` requests may return the saved event as JSON (optionally wrapped in `{ "event": ... }`) or an empty response. RSVP requests may also return the updated event or an empty response. API errors are shown to the user; if the initial event request cannot be reached, sample events are shown instead and event changes are kept only for the current browser session.

## Interface features

- Responsive overview with event and attendee statistics
- Upcoming, all, past, saved, category, date, and text-search filters
- Monthly calendar with event-day indicators
- Create, edit, and delete event actions
- Save favorites and view them from Saved events (stored on this device)
- RSVP and cancel attendance; the interface checks capacity and the API should enforce it server-side as well
- View event details and download a calendar `.ics` file
- Rate events, share a deep link, and open shared links directly to event details
- Click dashboard statistics to jump into upcoming, weekly, all-event, and rated-event views
- See active search/category/date filters, clear them individually or together, and reveal more results
- Open the notification bell for unread reminders about events in the next seven days, mark them read, or jump straight to event details
- Notification read state is saved on this device; on mobile, the notification bell remains available in the top bar
- See the next upcoming social event (or the next event of any category) in the live campus spotlight, and open it directly from the dashboard
- Keyboard shortcut `Ctrl/⌘ + K` to focus event search
- Demo-mode notice and retry action when the API is unavailable
