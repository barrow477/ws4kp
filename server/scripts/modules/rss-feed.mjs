// RSS feed display - scrolls through headlines from a configured RSS feed URL
import STATUS from './status.mjs';
import { text } from './utils/fetch.mjs';
import WeatherDisplay from './weatherdisplay.mjs';
import { registerDisplay } from './navigation.mjs';
import { parseQueryString } from './share.mjs';

class RssFeed extends WeatherDisplay {
	constructor(navId, elemId) {
		const hasRssFeed = !!parseQueryString()?.rssFeedUrl;
		super(navId, elemId, 'RSS Feed', hasRssFeed);
		this.showOnProgress = false;
		this.timing.totalScreens = 0;
	}

	async getData(weatherParameters, refresh) {
		const superResult = super.getData(weatherParameters, refresh);
		if (!superResult) return;

		const feedUrl = parseQueryString()?.rssFeedUrl;
		if (!feedUrl) {
			this.timing.totalScreens = 0;
			this.setStatus(STATUS.loaded);
			return;
		}

		try {
			const rawXml = await text(`/rss-feed?url=${encodeURIComponent(feedUrl)}`, {
				retryCount: 2,
				stillWaiting: () => this.stillWaiting(),
			});
			const parser = new DOMParser();
			const doc = parser.parseFromString(rawXml, 'application/xml');
			if (doc.querySelector('parsererror')) throw new Error('Invalid RSS XML');

			this.data = [...doc.querySelectorAll('item')].map((item) => ({
				title: item.querySelector('title')?.textContent?.trim() ?? '',
				pubDate: item.querySelector('pubDate')?.textContent?.trim() ?? '',
				description: decodeHtmlEntities(
					(item.querySelector('description')?.textContent ?? '').replace(/<[^>]*>/g, ''),
				).trim(),
			})).slice(0, 20);
		} catch (e) {
			console.error('RSS feed load failed:', e);
			if (this.isEnabled) this.setStatus(STATUS.failed);
			this.getDataCallback();
			return;
		}

		this.getDataCallback();
		this.drawLongCanvas();
	}

	drawLongCanvas() {
		const list = this.elem.querySelector('.rss-items');
		list.innerHTML = '';

		if (!this.data || this.data.length === 0) {
			this.timing.totalScreens = 0;
			this.setStatus(STATUS.loaded);
			return;
		}

		const items = this.data.map((item) => this.fillTemplate('rss-item', {
			'rss-title': item.title.toUpperCase(),
			'rss-date': formatPubDate(item.pubDate),
			'rss-desc': item.description.length > 110
				? `${item.description.substring(0, 110)}...`
				: item.description,
		}));

		list.append(...items);

		this.timing.baseDelay = 20;
		const pages = Math.max(Math.ceil(list.scrollHeight / 310) - 1, 1);
		const timingStep = 400;
		this.timing.delay = [150 + timingStep];
		for (let i = 0; i < pages; i += 1) this.timing.delay.push(timingStep);
		this.timing.delay.push(250);
		this.calcNavTiming();
		this.setStatus(STATUS.loaded);
	}

	drawCanvas() {
		super.drawCanvas();
		this.finishDraw();
	}

	showCanvas(navCmd) {
		// reset scroll before the element becomes visible to avoid a flash of wrong position
		this.elem.querySelector('.main').scrollTo(0, 0);
		this.drawCanvas();
		super.showCanvas(navCmd);
	}

	screenIndexChange() {
		this.baseCountChange(this.navBaseCount);
	}

	baseCountChange(count) {
		const itemsEl = this.elem.querySelector('.rss-items');
		let offsetY = Math.min(itemsEl.offsetHeight - 300, count - 150);
		if (offsetY < 0) offsetY = 0;
		this.elem.querySelector('.main').scrollTo(0, offsetY);
	}

	screenIndexFromBaseCount() {
		const superValue = super.screenIndexFromBaseCount();
		if (superValue === false) this.timing.totalScreens = 0;
		return superValue;
	}
}

const formatPubDate = (pubDate) => {
	if (!pubDate) return '';
	try {
		const d = new Date(pubDate);
		if (Number.isNaN(d.getTime())) return '';
		return d.toLocaleDateString('en-US', {
			weekday: 'short', month: 'short', day: 'numeric',
		});
	} catch {
		return '';
	}
};

const decodeHtmlEntities = (str) => str
	.replace(/&amp;/g, '&')
	.replace(/&lt;/g, '<')
	.replace(/&gt;/g, '>')
	.replace(/&quot;/g, '"')
	.replace(/&#39;/g, "'")
	.replace(/&nbsp;/g, ' ');

registerDisplay(new RssFeed(12, 'rss-feed'));
