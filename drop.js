document.addEventListener('DOMContentLoaded', () => {
  const textInput = document.getElementById('text-input');
  const sendBtn = document.getElementById('send-btn');
  const attachBtn = document.getElementById('attach-btn');
  const fileInput = document.getElementById('file-input');
  const historyContainer = document.getElementById('drop-history');
  const emptyState = document.getElementById('empty-state');
  const noResults = document.getElementById('no-results');
  const searchInput = document.getElementById('drop-search');
  const clearSearchBtn = document.getElementById('clear-search-btn');

  let allDrops = [];
  let searchQuery = '';

  // Load existing drops
  function loadDrops() {
    chrome.storage.local.get(['drops'], (result) => {
      if (chrome.runtime.lastError) {
        console.error('Error loading drops:', chrome.runtime.lastError);
        return;
      }

      allDrops = result.drops || [];
      renderDrops();
    });
  }

  function renderDrops() {
    const query = searchQuery.trim().toLowerCase();
    const visibleDrops = query
      ? allDrops.filter(drop => matchesSearch(drop, query))
      : allDrops;

    // Clear current elements (except empty/no-results states)
    Array.from(historyContainer.children).forEach(child => {
      if (child.id !== 'empty-state' && child.id !== 'no-results') child.remove();
    });

    if (allDrops.length === 0) {
      emptyState.style.display = 'flex';
      noResults.classList.add('hidden');
    } else if (query && visibleDrops.length === 0) {
      emptyState.style.display = 'none';
      noResults.classList.remove('hidden');
    } else {
      emptyState.style.display = 'none';
      noResults.classList.add('hidden');
    }

    visibleDrops.forEach(drop => renderDropItem(drop));
    historyContainer.scrollTop = historyContainer.scrollHeight;
  }

  function matchesSearch(drop, query) {
    if (drop.type === 'text') {
      return drop.data.toLowerCase().includes(query);
    }
    if (drop.type === 'image') {
      return 'image'.includes(query);
    }
    return false;
  }

  function renderDropItem(drop) {
    const div = document.createElement('div');
    div.className = 'drop-item';

    if (drop.type === 'image') {
      const img = document.createElement('img');
      img.src = drop.data;
      img.alt = 'Dropped Image';
      div.appendChild(img);
    } else if (drop.type === 'text') {
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      const escapedText = drop.data.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const textWithLinks = escapedText.replace(urlRegex, '<a href="$1" target="_blank">$1</a>');

      const textDiv = document.createElement('div');
      textDiv.innerHTML = textWithLinks;
      div.appendChild(textDiv);
    }

    const date = new Date(drop.timestamp);
    const timestamp = document.createElement('span');
    timestamp.className = 'timestamp';
    timestamp.textContent = date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    div.appendChild(timestamp);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.innerHTML = '&times;';
    deleteBtn.title = 'Delete';
    deleteBtn.onclick = () => deleteDrop(drop.id);
    div.appendChild(deleteBtn);

    historyContainer.appendChild(div);
  }

  function saveDrop(type, data) {
    const drop = {
      id: Date.now().toString(),
      type: type,
      data: data,
      timestamp: Date.now()
    };

    chrome.storage.local.get(['drops'], (result) => {
      if (chrome.runtime.lastError) {
        console.error('Error reading drops:', chrome.runtime.lastError);
        return;
      }

      const drops = result.drops || [];
      drops.push(drop);
      chrome.storage.local.set({ drops }, () => {
        if (chrome.runtime.lastError) {
          console.error('Error saving drop:', chrome.runtime.lastError);
          return;
        }
        loadDrops();
        // Clear input
        textInput.value = '';
        textInput.style.height = 'auto';
      });
    });
  }

  function deleteDrop(id) {
    chrome.storage.local.get(['drops'], (result) => {
      if (chrome.runtime.lastError) {
        console.error('Error reading drops:', chrome.runtime.lastError);
        return;
      }

      let drops = result.drops || [];
      drops = drops.filter(d => d.id !== id);
      chrome.storage.local.set({ drops }, () => {
        if (chrome.runtime.lastError) {
          console.error('Error saving drops:', chrome.runtime.lastError);
          return;
        }
        loadDrops();
      });
    });
  }

  // Auto-resize textarea
  textInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
  });

  textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const text = textInput.value.trim();
      if (text) {
        saveDrop('text', text);
      }
    }
  });

  sendBtn.addEventListener('click', () => {
    const text = textInput.value.trim();
    if (text) saveDrop('text', text);
  });

  attachBtn.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) { // 2MB limit for storage.local
      alert("File is too large! Please select a file smaller than 2MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = function(event) {
      const base64data = event.target.result;
      if (file.type.startsWith('image/')) {
        saveDrop('image', base64data);
      } else {
        // Just store file name as text for now
        saveDrop('text', `File uploaded: ${file.name}`);
      }
    };
    reader.readAsDataURL(file);
    fileInput.value = ''; // reset
  });

  // Handle Drag and Drop on container
  document.body.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  document.body.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = function(event) {
          saveDrop('image', event.target.result);
        };
        reader.readAsDataURL(file);
      }
    } else {
      const text = e.dataTransfer.getData('text/plain');
      if (text) saveDrop('text', text);
    }
  });

  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    clearSearchBtn.classList.toggle('hidden', searchQuery.length === 0);
    renderDrops();
  });

  clearSearchBtn.addEventListener('click', () => {
    searchQuery = '';
    searchInput.value = '';
    clearSearchBtn.classList.add('hidden');
    searchInput.focus();
    renderDrops();
  });

  loadDrops();

  // Listen for storage changes from other contexts (like if main extension window adds something)
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.drops) {
      allDrops = changes.drops.newValue || [];
      renderDrops();
    }
  });
});
