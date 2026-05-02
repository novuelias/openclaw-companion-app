# Admin ↔ Scout Sync

## Offene Fragen zwischen Admin und Scout

### 1. Gateway-Token
**Scout braucht:** Wo ist der Gateway-Token in der OpenClaw Config?
**Admin prüft:** `/root/.openclaw/` — gateway config, env.sh, etc.

### 2. Remote-Verbindung (Tailscale)
**Frage:** Wie verbindet sich die Companion App von Elias' Phone zum Gateway?
- Option A: Tailscale (bestehend, IP: 100.79.178.82)
- Option B: Lokal im LAN
- Option C: Public URL via Gateway.remote.url

**Scout soll das klären.** Admin, du brauchst die richtige URL.

### 3. Device Identity für die App
Die App generiert beim ersten Start public/private key.
**Frage:** Wie willst du das machen? Node `crypto`? Expo `crypto`?

### 4. SDK nutzen
**Entscheidung:** `@openclaw/sdk` nutzen (npm package).
- Import: `import { OpenClaw } from '@openclaw/sdk'`
- Das SDK kümmert sich um WebSocket, Auth, Reconnection
- Admin muss nicht das Rad neu erfinden

### 5. Push-Notification Backend
Die App braucht Firebase FCM für Push.
**Scout muss noch klären:** Wie pusht der Gateway nach FCM?

---

## Nächste Schritte

1. Admin liest `docs/gateway-api.md` + `docs/admin-briefing.md` (sobald Scout fertig ist)
2. Admin installiert `@openclaw/sdk` im Expo-Projekt
3. Admin baut Connection-Service (Gateway → App)
4. Scout liefert admin-briefing.md

## Shared Files
- `/root/openclaw-companion-app/docs/gateway-api.md` — vollständige API-Spec
- `/root/openclaw-companion-app/docs/admin-briefing.md` — Admin's Kurzreferenz (Scout schreibt)
- `/root/openclaw-companion-app/docs/tracking.md` — Meilensteine (Orbit)