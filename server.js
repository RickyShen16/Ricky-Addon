const express = require('express');
const axios = require('axios');
const app = express();

const ADDON_NAME = 'Ricky Addon';
const ADDON_VERSION = '1.0.0';
const VIDSRC_API = 'https://api.vidsrc.me/search';

// Manifest - tells Stremio what this addon does
app.get('/manifest.json', (req, res) => {
  res.json({
    id: 'com.ricky.vidsrc',
    version: ADDON_VERSION,
    name: ADDON_NAME,
    description: 'VidSrc scraper with 4K support - English, Tamil, Hindi',
    logo: 'https://via.placeholder.com/256x256/4CAF50/FFFFFF?text=Ricky',
    resources: ['stream'],
    types: ['movie', 'series'],
    idPrefixes: ['tt'],
    catalogs: []
  });
});

// Stream endpoint - returns available streams
app.get('/stream/:type/:id.json', async (req, res) => {
  try {
    const { type, id } = req.params;
    
    // Query VidSrc API
    const response = await axios.get(`${VIDSRC_API}?query=${id}`, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });

    const streams = parseVidSrcResponse(response.data, type);
    
    res.json({ streams: streams || [] });
  } catch (error) {
    console.error('Error fetching streams:', error.message);
    res.json({ streams: [] });
  }
});

// Parse VidSrc response and format for Stremio
function parseVidSrcResponse(data, type) {
  if (!data || !data.results) return [];

  const streams = [];
  const result = data.results[0]; // Get first result

  if (!result || !result.sources) return [];

  // Quality priority: 4K > 1080p > 720p > 480p
  const qualityPriority = {
    '4K': 0,
    '2160p': 0,
    '1080p': 1,
    '720p': 2,
    '480p': 3,
    'Unknown': 4
  };

  // Language preference: English, Tamil, Hindi
  const languages = ['English', 'Tamil', 'Hindi', 'Dubbed', 'Unknown'];

  result.sources.forEach((source, index) => {
    const quality = source.quality || 'Unknown';
    const language = source.language || 'Unknown';

    // Only include if language matches
    if (!languages.includes(language) && language !== 'Unknown') return;

    const stream = {
      url: source.url,
      title: `${ADDON_NAME} | ${quality} | ${language}`,
      qualityScore: qualityPriority[quality] || 999,
      languageScore: languages.indexOf(language),
      subtitles: source.subtitles ? source.subtitles.map(sub => ({
        url: sub.url,
        lang: sub.language || 'Unknown'
      })) : []
    };

    streams.push(stream);
  });

  // Sort by quality first, then language
  streams.sort((a, b) => {
    if (a.qualityScore !== b.qualityScore) {
      return a.qualityScore - b.qualityScore;
    }
    return a.languageScore - b.languageScore;
  });

  // Format for Stremio
  return streams.slice(0, 20).map(s => ({
    url: s.url,
    title: s.title,
    subtitles: s.subtitles
  }));
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', addon: ADDON_NAME });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`${ADDON_NAME} running on port ${PORT}`);
});
