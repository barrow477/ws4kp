// server-side proxy for RSS feeds
import https from 'https';
import http from 'http';

const rssFeed = (req, res) => {
	const feedUrl = req.query.url;

	if (!feedUrl) {
		res.status(400).send('Missing url parameter');
		return;
	}

	let parsedUrl;
	try {
		parsedUrl = new URL(feedUrl);
	} catch {
		res.status(400).send('Invalid URL');
		return;
	}

	if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
		res.status(400).send('Only http and https URLs are allowed');
		return;
	}

	const client = parsedUrl.protocol === 'https:' ? https : http;

	const options = {
		headers: {
			'user-agent': '(WeatherStar 4000+, ws4000@netbymatt.com)',
			accept: 'application/rss+xml, application/xml, text/xml, */*',
		},
	};

	client.get(feedUrl, options, (getRes) => {
		res.status(getRes.statusCode);
		res.header('content-type', 'application/xml; charset=utf-8');
		getRes.pipe(res);
	}).on('error', (e) => {
		console.error(e);
		if (!res.headersSent) res.status(500).send('Error fetching RSS feed');
	});
};

export default rssFeed;
