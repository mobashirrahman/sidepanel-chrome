document.addEventListener('DOMContentLoaded', () => {
  const textInput = document.getElementById('text-input');
  const sendBtn = document.getElementById('send-btn');
  const attachBtn = document.getElementById('attach-btn');
  const fileInput = document.getElementById('file-input');
  const historyContainer = document.getElementById('drop-history');
  const emptyState = document.getElementById('empty-state');

  // Load existing drops
  function loadDrops() {
    chrome.storage.local.get(['drops'], (result) => {
      const drops = result.drops || [];
      if (drops.length > 0) {
        emptyState.style.display = 'none';
      } else {
        emptyState.style.display = 'flex';
      }

      // Clear current elements (except empty state)
      Array.from(historyContainer.children).forEach(child => {
        if (child.id !== 'empty-state') child.remove();
      });

      drops.forEach(drop => renderDropItem(drop));
      historyContainer.scrollTop = historyContainer.scrollHeight;
    });
  }

  function renderDropItem(drop) {
    const div = document.createElement('div');
    div.className = 'drop-item';
    
    // Auto-link URLs
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    let contentHtml = '';
    
    if (drop.type === 'image') {
      contentHtml += `<img src="${drop.data}" alt="Dropped Image" />`;
    } else if (drop.type === 'text') {
      const escapedText = drop.data.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      contentHtml += escapedText.replace(urlRegex, '<a href="$1" target="_blank">$1</a>');
    }

    const date = new Date(drop.timestamp);
    contentHtml += `<span class="timestamp">${date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>`;
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.innerHTML = '&times;';
    deleteBtn.title = 'Delete';
    deleteBtn.onclick = () => deleteDrop(drop.id);
    
    div.innerHTML = contentHtml;
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
      const drops = result.drops || [];
      drops.push(drop);
      chrome.storage.local.set({ drops }, () => {
        loadDrops();
        // Clear input
        textInput.value = '';
        textInput.style.height = 'auto';
      });
    });
  }

  function deleteDrop(id) {
    chrome.storage.local.get(['drops'], (result) => {
      let drops = result.drops || [];
      drops = drops.filter(d => d.id !== id);
      chrome.storage.local.set({ drops }, () => {
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

  loadDrops();

  // Listen for storage changes from other contexts (like if main extension window adds something)
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.drops) {
      loadDrops();
    }
  });
});
