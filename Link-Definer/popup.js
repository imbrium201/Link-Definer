let linksData = [];
let currentTabDomain = '';
let showUrlsOnly = false;
let currentFilter = '';
let currentSort = 'default';

// Fetch links from the page
async function getLinksFromPage() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({active: true, currentWindow: true}, async (tabs) => {
      const tab = tabs[0];
      try {
        const url = new URL(tab.url);
        currentTabDomain = url.host;
      } catch(e) {
        currentTabDomain = '';
      }

      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: () => {
          const anchors = document.querySelectorAll('a[href]');
          const results = [];
          anchors.forEach(a => {
            const href = a.href;
            const text = a.innerText.trim() || href;
            results.push({text, href});
          });
          return results;
        }
      }, (injectionResults) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        if (injectionResults && injectionResults[0]) {
          resolve(injectionResults[0].result);
        } else {
          resolve([]);
        }
      });
    });
  });
}

// Determine if a link is internal or external
function isInternalLink(link) {
  try {
    const linkHost = new URL(link.href).host;
    return linkHost === currentTabDomain;
  } catch(e) {
    return false;
  }
}

// Render links to the UI
function renderLinks() {
  const linksList = document.getElementById('linksList');
  linksList.innerHTML = '';

  // Filter
  let filtered = linksData.filter(l => {
    const search = currentFilter.toLowerCase();
    return l.text.toLowerCase().includes(search) || l.href.toLowerCase().includes(search);
  });

  // Sort
  if (currentSort === 'text') {
    filtered.sort((a, b) => a.text.localeCompare(b.text));
  } else if (currentSort === 'domain') {
    // Internal first, then external
    filtered.sort((a, b) => {
      const aInt = isInternalLink(a) ? 0 : 1;
      const bInt = isInternalLink(b) ? 0 : 1;
      if (aInt !== bInt) return aInt - bInt;
      return a.text.localeCompare(b.text);
    });
  }

  // Display mode (text or URL)
  let displayProp = showUrlsOnly ? 'href' : 'text';

  if (filtered.length === 0) {
    linksList.textContent = 'No links found.';
    updateInfoBar(0,0,0);
    return;
  }

  // Create list items
  filtered.forEach(link => {
    const div = document.createElement('div');
    div.className = 'link-item';

    if (isInternalLink(link)) {
      div.classList.add('internal');
    }

    const linkInfo = document.createElement('span');
    linkInfo.className = 'link-info';
    linkInfo.textContent = link[displayProp];
    linkInfo.title = link.href;
    linkInfo.addEventListener('click', () => copyToClipboard(link.href));
    div.appendChild(linkInfo);

    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent triggering linkInfo click
      copyToClipboard(link.href);
    });
    div.appendChild(copyBtn);

    linksList.appendChild(div);
  });

  // Update info bar
  const total = filtered.length;
  const internalCount = filtered.filter(l => isInternalLink(l)).length;
  const externalCount = total - internalCount;
  updateInfoBar(total, internalCount, externalCount);
}

function updateInfoBar(total, internal, external) {
  const infoBar = document.getElementById('infoBar');
  infoBar.textContent = `Found ${total} link(s) | Internal: ${internal}, External: ${external}`;
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
  } catch (err) {
    console.error('Failed to copy text: ', err);
  }
}

function exportAsCSV(links) {
  const rows = [];
  rows.push(['Text', 'URL']);
  links.forEach(l => {
    rows.push([l.text, l.href]);
  });
  const csvContent = rows.map(r => r.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
  copyToClipboard(csvContent);
}

function exportAsJSON(links) {
  const jsonStr = JSON.stringify(links, null, 2);
  copyToClipboard(jsonStr);
}

// Refresh data
async function refreshLinks() {
  document.getElementById('linksList').textContent = 'Loading...';
  linksData = await getLinksFromPage();
  renderLinks();
}

document.addEventListener('DOMContentLoaded', async () => {
  const searchInput = document.getElementById('searchInput');
  const sortSelect = document.getElementById('sortSelect');
  const viewToggle = document.getElementById('viewToggle');
  const exportCSVBtn = document.getElementById('exportCSVBtn');
  const exportJSONBtn = document.getElementById('exportJSONBtn');
  const refreshBtn = document.getElementById('refreshBtn');

  searchInput.addEventListener('input', () => {
    currentFilter = searchInput.value;
    renderLinks();
  });

  sortSelect.addEventListener('change', () => {
    currentSort = sortSelect.value;
    renderLinks();
  });

  viewToggle.addEventListener('change', () => {
    showUrlsOnly = viewToggle.checked;
    renderLinks();
  });

  exportCSVBtn.addEventListener('click', () => {
    // Get currently visible links after filtering and sorting
    const filtered = filterAndSortLinks();
    exportAsCSV(filtered);
  });

  exportJSONBtn.addEventListener('click', () => {
    const filtered = filterAndSortLinks();
    exportAsJSON(filtered);
  });

  refreshBtn.addEventListener('click', refreshLinks);

  // Initial load
  await refreshLinks();
});

function filterAndSortLinks() {
  let filtered = linksData.filter(l => {
    const search = currentFilter.toLowerCase();
    return l.text.toLowerCase().includes(search) || l.href.toLowerCase().includes(search);
  });

  if (currentSort === 'text') {
    filtered.sort((a, b) => a.text.localeCompare(b.text));
  } else if (currentSort === 'domain') {
    filtered.sort((a, b) => {
      const aInt = isInternalLink(a) ? 0 : 1;
      const bInt = isInternalLink(b) ? 0 : 1;
      if (aInt !== bInt) return aInt - bInt;
      return a.text.localeCompare(b.text);
    });
  }

  return filtered;
}
