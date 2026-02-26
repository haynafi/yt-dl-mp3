const express = require('express');
const youtubedl = require('youtube-dl-exec');
const ffmpeg = require('fluent-ffmpeg');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const path = require('path');
const { Readable } = require('stream');

ffmpeg.setFfmpegPath('C:\\ffmpeg\\bin\\ffmpeg.exe');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many requests from this IP, please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/convert', limiter);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/convert', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'YouTube URL is required' });
  }

  if (!url.includes('youtube.com') && !url.includes('youtu.be')) {
    return res.status(400).json({ error: 'Invalid YouTube URL' });
  }

  try {
    const info = await youtubedl(url, {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true,
    });

    const title = info.title.replace(/[^\w\s-]/g, '').trim() || 'audio';

    res.setHeader('Content-Disposition', `attachment; filename="${title}.mp3"`);
    res.setHeader('Content-Type', 'audio/mpeg');

    const audioStream = youtubedl.exec(url, {
      extractAudio: true,
      audioFormat: 'mp3',
      audioQuality: 0,
      output: '-',
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true,
    });

    audioStream.stdout.pipe(res);

    audioStream.on('error', (err) => {
      console.error('youtube-dl-exec error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Conversion failed. Please try again.' });
      }
    });

    audioStream.on('close', () => {
      console.log('Conversion finished successfully');
    });

  } catch (error) {
    console.error('Error:', error);
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Failed to process the video. Please check the URL and try again.' 
      });
    }
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
