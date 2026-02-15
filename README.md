# Privalytics Widget

Drop-in widget analytics for static sites.

## Features

- Drop-in widget with mini counter
- Customizable widget color
- Fully self-hosted
- Privacy-first tracking

## Installation

```bash
npm install
npm start
```

Server runs on http://localhost:3003

## Usage

1. Add a site via the dashboard
2. Copy the widget embed code
3. Add to your static site

The widget displays a small analytics icon on your site and tracks pageviews.

## Widget Embed

```html
<script src="http://localhost:3003/api/sites/YOUR_SITE_ID/widget.js"></script>
```

## API

- `POST /api/sites` - Create site
- `GET /api/sites` - List sites
- `POST /api/track` - Track pageview
- `GET /api/sites/:id/stats` - Get stats
- `GET /api/sites/:id/widget.js` - Widget script
