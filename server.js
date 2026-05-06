const express = require('express');
const axios = require('axios');
const app = express();

const ADDON_NAME = 'Ricky Addon';
const ADDON_VERSION = '1.0.0';
const VIDSRC_API = 'https://api.vidsrc.me/search';

// Create axios instance with anti-bot headers
const axiosInstance = axios.create({
  timeout: 10000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://vidsrc.me/',
    'Origin': 'https://vidsrc.me'
  }
});

// Manifest
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

// Stream endpoint
app.get('/stream/:type/:id.json', async (req, res) => {
  try {
    const { type, id } = req.params;
    
    // Remove 'tt' prefix for API call
    const cleanId = id.replace('tt', '');
    
    const response = await axiosInstance.get(`${VIDSRC_API}?query=${cleanId}`);
    const streams = parseVidSrcResponse(response.data, type);
    
    res.json({ streams: streams || [] });
  } catch (error) {
    console.error('Error fetching streams:', error.message);
    res.json({ streams: [] });
  }
});

// Parse response
function parseVidSrcResponse(data, type) {
  if (!data || !data.results || data.results.length === 0) return [];

  const streams = [];
  const result = data.results[0];

  if (!result || !result.sources) return [];

  const qualityPriority = {
    '4K': 0,
    '2160p': 0,
    '1080p': 1,
    '720p': 2,
    '480p': 3,
    'Unknown': 4
  };

  const languages = ['English', 'Tamil', 'Hindi', 'Dubbed', 'Unknown'];

  result.sources.forEach((source) => {
    const quality = source.quality || 'Unknown';
    const language = source.language || 'Unknown';

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

  streams.sort((a, b) => {
    if (a.qualityScore !== b.qualityScore) {
      return a.qualityScore - b.qualityScore;
    }
    return a.languageScore - b.languageScore;
  });

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
