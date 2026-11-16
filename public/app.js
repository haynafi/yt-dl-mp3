const youtubeUrlInput = document.getElementById('youtubeUrl');
const convertBtn = document.getElementById('convertBtn');
const loadingState = document.getElementById('loadingState');
const downloadState = document.getElementById('downloadState');
const downloadBtn = document.getElementById('downloadBtn');
const errorState = document.getElementById('errorState');
const errorMessage = document.getElementById('errorMessage');

let downloadUrl = null;
let downloadName = 'audio.mp3';

function getFilename(response) {
  const header = response.headers.get('Content-Disposition') || '';
  const encoded = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1]);
    } catch {}
  }
  const plain = header.match(/filename="([^"]+)"/i);
  return plain ? plain[1] : 'audio.mp3';
}

function hideAllStates() {
  loadingState.classList.add('hidden');
  downloadState.classList.add('hidden');
  errorState.classList.add('hidden');
}

function showError(message) {
  hideAllStates();
  errorMessage.textContent = message.toUpperCase();
  errorState.classList.remove('hidden');
  convertBtn.disabled = false;
  convertBtn.textContent = 'CONVERT TO MP3';
  convertBtn.classList.remove('opacity-50', 'cursor-not-allowed');
}

function showLoading() {
  hideAllStates();
  loadingState.classList.remove('hidden');
  convertBtn.disabled = true;
  convertBtn.textContent = 'CONVERTING...';
  convertBtn.classList.add('opacity-50', 'cursor-not-allowed');
}

function showDownload() {
  hideAllStates();
  downloadState.classList.remove('hidden');
  convertBtn.disabled = false;
  convertBtn.textContent = 'CONVERT TO MP3';
  convertBtn.classList.remove('opacity-50', 'cursor-not-allowed');
}

convertBtn.addEventListener('click', async () => {
  const url = youtubeUrlInput.value.trim();

  if (!url) {
    showError('Please enter a YouTube URL');
    return;
  }

  if (!url.includes('youtube.com') && !url.includes('youtu.be')) {
    showError('Please enter a valid YouTube URL');
    return;
  }

  showLoading();

  try {
    const response = await fetch('/convert', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Conversion failed');
    }

    downloadName = getFilename(response);
    const blob = await response.blob();
    downloadUrl = URL.createObjectURL(blob);
    
    showDownload();
  } catch (error) {
    console.error('Error:', error);
    showError(error.message || 'An error occurred. Please try again.');
  }
});

downloadBtn.addEventListener('click', () => {
  if (downloadUrl) {
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = downloadName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    setTimeout(() => {
      URL.revokeObjectURL(downloadUrl);
      downloadUrl = null;
      hideAllStates();
      youtubeUrlInput.value = '';
    }, 100);
  }
});

youtubeUrlInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    convertBtn.click();
  }
});
