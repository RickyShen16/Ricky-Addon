const express = require('express');
const axios = require('axios');
const app = express();

const ADDON_NAME = 'Ricky Addon';
const ADDON_VERSION = '1.0.0';

const http = axios.create({
  timeout: 10000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  }
});

app.get('/manifest.json', (req, res) => {
  res.json({
    id: 'com.ricky.addon',
    version: ADDON_VERSION,
    name: ADDON_NAME,
    description: 'Ricky\'s Test Addon - HTTP streams',
    resources: ['stream'],
    types: ['movie', 'series'],
    idPrefixes: ['tt'],
    catalogs: []
  });
});

app.get('/stream/:type/:id.json', async (req, res) => {
  try {
    const { type, id } = req.params;
    
    // Placeholder - returns test stream
    const testStreams = [
      {
        url: 'https://example.com/stream',
        title: `${ADDON_NAME} | 1080p | Test Stream`
      }
    ];
    
    res.json({ streams: testStreams });
    
  } catch (error) {
    console.error('Error:', error.message);
    res.json({ streams: [] });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`${ADDON_NAME} running`);
});
