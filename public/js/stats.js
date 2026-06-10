// Holt die anonyme Nutzungsstatistik (nur Gesamtzahlen) und zeigt sie dezent an.
// Schlägt der Abruf fehl, bleibt die Zeile versteckt — rein optionales Beiwerk.

fetch('/api/stats')
  .then((r) => (r.ok ? r.json() : null))
  .then((d) => {
    if (!d || typeof d.created !== 'number' || d.created < 1) return;
    const wrap = document.getElementById('usage-stat');
    const num = document.getElementById('usage-created');
    if (!wrap || !num) return;
    num.textContent = d.created.toLocaleString('de-DE');
    wrap.hidden = false;
  })
  .catch(() => { /* offline / Endpoint weg → Zeile bleibt versteckt */ });
