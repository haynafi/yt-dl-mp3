const express = require('express');
const youtubedl = require('youtube-dl-exec');
const ffmpeg = require('fluent-ffmpeg');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');

if (process.env.FFMPEG_PATH) {
  ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
}

let cookiesFile = null;
if (process.env.COOKIES_FILE && fs.existsSync(process.env.COOKIES_FILE)) {
  cookiesFile = path.join(os.tmpdir(), 'yt-cookies.txt');
  fs.copyFileSync(process.env.COOKIES_FILE, cookiesFile);
  console.log('Using YouTube cookies');
}

const ytdlpOptions = {
  noCheckCertificates: true,
  noWarnings: true,
  ...(cookiesFile && { cookies: cookiesFile }),
};

const app = express();
const PORT = process.env.PORT || 3000;

if (process.env.TRUST_PROXY) {
  app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
}

const BASE_PATH = (process.env.BASE_PATH || '').replace(/\/+$/, '');
const router = express.Router();

app.use(cors());
app.use(express.json());
router.use(express.static(path.join(__dirname, 'public')));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many requests from this IP, please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.use('/convert', limiter);

const YOUTUBE_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'];
const MAX_DURATION_SECONDS = 60 * 60;

function parseYoutubeUrl(input) {
  try {
    const parsed = new URL(input);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    if (!YOUTUBE_HOSTS.includes(parsed.hostname)) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function buildFilename(title) {
  const clean = title.replace(/[\x00-\x1f\x7f"\\/:*?<>|]/g, '').replace(/\s+/g, ' ').trim() || 'audio';
  const ascii = clean.replace(/[^\x20-\x7e]/g, '').trim() || 'audio';
  return {
    clean,
    header: `attachment; filename="${ascii}.mp3"; filename*=UTF-8''${encodeURIComponent(clean)}.mp3`,
  };
}

router.post('/convert', async (req, res) => {
  const url = typeof req.body?.url === 'string' ? parseYoutubeUrl(req.body.url.trim()) : null;

  if (!url) {
    return res.status(400).json({ error: 'Invalid YouTube URL' });
  }

  try {
    const info = await youtubedl(url, {
      dumpSingleJson: true,
      noPlaylist: true,
      ...ytdlpOptions,
    });

    if (info.duration > MAX_DURATION_SECONDS) {
      return res.status(400).json({ error: 'Video is too long (max 60 minutes).' });
    }

    const { clean, header } = buildFilename(info.title || '');

    const source = youtubedl.exec(
      url,
      {
        format: 'bestaudio',
        noPlaylist: true,
        output: '-',
        ...ytdlpOptions,
      },
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    const converter = ffmpeg(source.stdout)
      .noVideo()
      .audioCodec('libmp3lame')
      .audioBitrate(192)
      .format('mp3')
      .outputOptions('-metadata', `title=${clean}`);

    const stop = () => {
      source.kill('SIGKILL');
      converter.kill('SIGKILL');
    };

    let started = false;
    converter.on('start', () => {
      started = true;
      res.setHeader('Content-Disposition', header);
      res.setHeader('Content-Type', 'audio/mpeg');
    });

    const fail = (err) => {
      console.error('Conversion error:', err.message);
      stop();
      if (!res.headersSent) {
        res.status(500).json({ error: 'Conversion failed. Please try again.' });
      } else {
        res.destroy();
      }
    };

    source.on('error', fail);
    converter.on('error', fail);
    converter.on('end', () => console.log('Conversion finished successfully'));
    res.on('close', () => {
      if (!res.writableFinished) stop();
    });

    converter.pipe(res, { end: true });
  } catch (error) {
    console.error('Error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Failed to process the video. Please check the URL and try again.',
      });
    }
  }
});

app.use(BASE_PATH || '/', router);

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
