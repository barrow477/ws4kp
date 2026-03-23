// Calendar display - shows upcoming events from a configured iCal feed URL
import STATUS from './status.mjs';
import { text } from './utils/fetch.mjs';
import WeatherDisplay from './weatherdisplay.mjs';
import { registerDisplay } from './navigation.mjs';
import { parseQueryString } from './share.mjs';

const EVENTS_PER_SCREEN = 8;

class CalendarDisplay extends WeatherDisplay {
	constructor(navId, elemId) {
		const hasCalendar = !!parseQueryString()?.calendarUrl;
		super(navId, elemId, 'Calendar', hasCalendar);
		this.timing.totalScreens = 0;
	}

	async getData(weatherParameters, refresh) {
		const superResult = super.getData(weatherParameters, refresh);
		if (!superResult) return;

		const feedUrl = parseQueryString()?.calendarUrl;
		if (!feedUrl) {
			this.timing.totalScreens = 0;
			this.setStatus(STATUS.loaded);
			return;
		}

		try {
			const rawIcal = await text(`/calendar-feed?url=${encodeURIComponent(feedUrl)}`, {
				retryCount: 2,
				stillWaiting: () => this.stillWaiting(),
			});
			const events = parseIcal(rawIcal);
			const now = new Date();
			// use start of today so all-day events starting today are included
			const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
			const future = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
			this.data = events
				.filter((e) => e.start >= today && e.start <= future)
				.sort((a, b) => a.start - b.start)
				.slice(0, 40);
		} catch (e) {
			console.error('Calendar feed load failed:', e);
			if (this.isEnabled) this.setStatus(STATUS.failed);
			this.getDataCallback();
			return;
		}

		this.getDataCallback();
		this.setupScreens();
		this.setStatus(STATUS.loaded);
	}

	setupScreens() {
		if (!this.data || this.data.length === 0) {
			this.timing.totalScreens = 0;
			return;
		}
		this.timing.totalScreens = Math.ceil(this.data.length / EVENTS_PER_SCREEN);
		this.timing.baseDelay = 9000;
		this.timing.delay = 1;
		this.calcNavTiming();
	}

	async drawCanvas() {
		super.drawCanvas();

		const list = this.elem.querySelector('.cal-events');
		list.innerHTML = '';

		if (!this.data || this.data.length === 0) {
			this.finishDraw();
			return;
		}

		const start = this.screenIndex * EVENTS_PER_SCREEN;
		const pageEvents = this.data.slice(start, start + EVENTS_PER_SCREEN);

		const rows = pageEvents.map((event) => this.fillTemplate('cal-event', {
			'cal-date': event.start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
			'cal-time': event.allDay ? 'All Day' : event.start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
			'cal-title': event.summary.toUpperCase(),
		}));

		list.append(...rows);
		this.finishDraw();
	}
}

// Minimal iCal parser
const parseIcal = (icalText) => {
	// Unfold continuation lines (lines starting with space or tab)
	const unfolded = icalText.replace(/\r?\n[ \t]/g, '');
	const lines = unfolded.split(/\r?\n/);

	const events = [];
	let inEvent = false;
	let current = null;

	for (const line of lines) {
		if (line === 'BEGIN:VEVENT') {
			inEvent = true;
			current = {};
		} else if (line === 'END:VEVENT') {
			if (current) {
				const event = processEvent(current);
				if (event) events.push(event);
			}
			inEvent = false;
			current = null;
		} else if (inEvent && current) {
			const colonIdx = line.indexOf(':');
			if (colonIdx === -1) continue;
			const keyPart = line.substring(0, colonIdx);
			const value = line.substring(colonIdx + 1);
			// Strip parameters (e.g. DTSTART;TZID=America/New_York → DTSTART)
			const [baseKey] = keyPart.split(';');
			// Only store first occurrence of each key
			if (!current[baseKey]) current[baseKey] = value;
		}
	}

	return events;
};

const processEvent = (raw) => {
	const summary = raw.SUMMARY ?? '';
	const dtstart = raw.DTSTART ?? '';
	const dtend = raw.DTEND ?? '';

	if (!dtstart) return null;

	const start = parseIcalDate(dtstart);
	if (!start) return null;

	const end = dtend ? (parseIcalDate(dtend) ?? start) : start;
	const allDay = /^\d{8}$/.test(dtstart);

	return {
		summary: summary || '(No Title)',
		start,
		end,
		allDay,
	};
};

const parseIcalDate = (value) => {
	if (!value) return null;
	// Date only: YYYYMMDD
	const dateOnly = value.match(/^(\d{4})(\d{2})(\d{2})$/);
	if (dateOnly) {
		const [, y, m, d] = dateOnly;
		return new Date(+y, +m - 1, +d);
	}
	// DateTime: YYYYMMDDTHHMMSS[Z or ±HHMM or ±HH:MM]
	const dateTime = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z|[+-]\d{2}:?\d{2})?$/);
	if (dateTime) {
		const [, y, m, d, h, min, s, tz] = dateTime;
		if (!tz) return new Date(+y, +m - 1, +d, +h, +min, +s);
		if (tz === 'Z') return new Date(Date.UTC(+y, +m - 1, +d, +h, +min, +s));
		// handle offset like +0530, -0500, +05:30
		const sign = tz[0] === '+' ? 1 : -1;
		const digits = tz.slice(1).replace(':', '');
		const offsetMs = sign * ((+digits.slice(0, 2) * 60) + +digits.slice(2, 4)) * 60000;
		return new Date(Date.UTC(+y, +m - 1, +d, +h, +min, +s) - offsetMs);
	}
	return null;
};

registerDisplay(new CalendarDisplay(13, 'calendar'));
