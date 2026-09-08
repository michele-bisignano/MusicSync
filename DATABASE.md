# MusicSync — Database

## 1. Scopo

Il database rappresenta la **libreria musicale desiderata**.

Non rappresenta una copia dello stato fisico della USB.

```text
Database
   ↓
cosa vogliamo nella libreria

USB
   ↓
cosa esiste fisicamente

Windows Client
   ↓
confronta e sincronizza
```

Il database utilizza **Cloudflare D1 (SQLite)**.

---

# 2. Entità

MusicSync utilizza due entità principali:

```text
Song
 │
 └── Track
```

### Song

Rappresenta una canzone nella libreria.

Esempio:

```text
Artist: "Lady Gaga & Bruno Mars"
Title:  "Die With A Smile"
```

Un duetto o una collaborazione tra più artisti è **una singola Song**.

### Track

Rappresenta il file MP3 fisico associato alla Song sulla USB.

Esempio:

```text
Music/Lady Gaga & Bruno Mars - Die With A Smile.mp3
```

---

# 3. Candidate di ricerca

Le candidate ottenute durante una ricerca sono **temporanee**.

Esempio:

```text
Ricerca
   ↓
3 candidate YouTube
   ↓
utente sceglie
   ↓
solo quella scelta viene salvata
```

Le candidate non confermate non vengono mai inserite nel database.

Il database contiene solamente la Song che l'utente ha effettivamente scelto.

---

# 4. Tabelle

Il database contiene solamente:

```text
songs
tracks
sync_state
```

Non sono necessarie tabelle per:

- utenti Telegram;
- candidate di ricerca;
- sorgenti YouTube alternative;
- stato completo della USB;
- storico delle sincronizzazioni.

Gli ID Telegram autorizzati sono configurazione del backend, non dati del database.

---

# 5. `songs`

Contiene le Song della libreria desiderata.

```sql
CREATE TABLE songs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    artist TEXT NOT NULL,
    title TEXT NOT NULL,

    normalized_artist TEXT NOT NULL,
    normalized_title TEXT NOT NULL,

    version_type TEXT NOT NULL DEFAULT 'standard'
        CHECK (
            version_type IN (
                'standard',
                'cover',
                'remix',
                'acoustic',
                'live'
            )
        ),

    youtube_url TEXT NOT NULL,

    status TEXT NOT NULL DEFAULT 'active'
        CHECK (
            status IN ('active', 'removed')
        ),

    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    UNIQUE (
        normalized_artist,
        normalized_title,
        version_type
    )
);
```

## Campi

| Campo | Significato |
|---|---|
| `id` | Identificatore interno |
| `artist` | Artista mostrato all'utente |
| `title` | Titolo mostrato all'utente |
| `normalized_artist` | Artista normalizzato per i confronti |
| `normalized_title` | Titolo normalizzato per i confronti |
| `version_type` | Tipo di versione |
| `youtube_url` | URL YouTube definitivo scelto dall'utente |
| `status` | Stato logico della Song |
| `created_at` | Data di creazione |
| `updated_at` | Ultima modifica |

---

# 6. Identità della Song

L'identità logica di una Song è:

```text
normalized_artist
+
normalized_title
+
version_type
```

Questa combinazione è unica.

Per esempio:

```text
Lady Gaga & Bruno Mars
Die With A Smile
standard
```

rappresenta una sola Song.

La normalizzazione può gestire:

- maiuscole/minuscole;
- accenti;
- punteggiatura;
- spazi;
- suffissi irrilevanti come `Official Video`, `Lyrics`, `Audio`.

Non deve eliminare differenze significative come:

```text
Remix
Acoustic
Cover
Live
```

---

# 7. Artisti multipli

Gli artisti vengono memorizzati come una singola stringa.

Esempio:

```text
artist = "Lady Gaga & Bruno Mars"
```

Non viene creata una tabella separata `artists`.

Non vengono create più Song per un duetto.

Quindi:

```text
Lady Gaga & Bruno Mars - Die With A Smile
```

è una sola Song.

---

# 8. Versioni

Le versioni musicalmente distinte vengono considerate Song differenti.

Sono supportate:

```text
standard
cover
remix
acoustic
live
```

Esempio:

```text
Artist - Song
Artist - Song (Remix)
Artist - Song (Acoustic)
Artist - Song (Live)
```

possono essere Song diverse.

Una `Radio Edit`, invece, viene considerata la stessa Song della versione standard salvo diversa richiesta esplicita.

---

# 9. YouTube URL

Ogni Song ha una sola `youtube_url` definitiva.

Il flusso è:

```text
Ricerca YouTube
      ↓
candidate
      ↓
utente sceglie
      ↓
youtube_url salvato nella Song
```

Le altre candidate vengono scartate.

L'URL confermato dall'utente viene conservato senza sostituirlo automaticamente con un altro video.

Anche quando l'utente fornisce direttamente un URL YouTube, quello specifico URL viene utilizzato dopo la conferma.

---

# 10. Rimozione delle Song

Quando l'utente esegue `/remove`, la Song viene marcata:

```text
status = 'removed'
```

Non è necessario cancellarla immediatamente dal database.

Questo permette al client Windows di riconoscere che l'eventuale Track associata deve essere rimossa dalla USB durante la sincronizzazione successiva.

Se la stessa Song viene aggiunta nuovamente, il record esistente può essere riattivato:

```text
removed
   ↓
active
```

senza creare un duplicato.

---

# 11. `tracks`

Rappresenta i file fisici gestiti da MusicSync sulla USB.

```sql
CREATE TABLE tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    song_id INTEGER NOT NULL,

    relative_path TEXT NOT NULL UNIQUE,

    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY (song_id)
        REFERENCES songs(id)
        ON DELETE RESTRICT
);
```

Una Track contiene solamente le informazioni necessarie per associare un file fisico a una Song.

---

# 12. Percorso della Track

Il database memorizza solamente un percorso **relativo alla cartella gestita**.

Esempio:

```text
Artist - Title.mp3
```

oppure:

```text
subfolder/Artist - Title.mp3
```

Non vengono mai memorizzati percorsi assoluti come:

```text
D:\Music\Artist - Title.mp3
```

Il percorso della USB è configurazione locale del Windows Client.

---

# 13. Nessuno stato `missing`

Il database **non memorizza lo stato fisico corrente della USB**.

Se il database contiene:

```text
Song A
Track A
```

ma il file viene eliminato manualmente dalla USB, il database non viene modificato immediatamente.

Alla sincronizzazione successiva:

```text
Database
    +
Scansione USB
    ↓
file assente
    ↓
DOWNLOAD
```

Il client ricava quindi lo stato fisico direttamente dalla USB ogni volta.

---

# 14. File presenti sulla USB ma non nel database

Durante la sincronizzazione il client può trovare un MP3 che non corrisponde a una Track conosciuta.

Esempio:

```text
DB:
A
B

USB:
A
B
C
```

Il client tenta di identificare `C`.

Se riesce:

```text
C
 ↓
Song
 ↓
Track
 ↓
Database
```

Il file rimane sulla USB.

Se non riesce a identificarlo con sufficiente sicurezza, il file viene lasciato intatto.

MusicSync non deve cancellare automaticamente file che non riesce a riconoscere.

---

# 15. `sync_state`

Contiene solamente lo stato necessario per coordinare le sincronizzazioni.

```sql
CREATE TABLE sync_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),

    sync_version INTEGER NOT NULL DEFAULT 0
        CHECK (sync_version >= 0),

    last_sync_started_at TEXT,

    last_sync_completed_at TEXT,

    last_sync_status TEXT
        CHECK (
            last_sync_status IS NULL
            OR last_sync_status IN (
                'success',
                'failed'
            )
        )
);
```

La tabella contiene una sola riga:

```text
id = 1
```

---

# 16. `sync_version`

`sync_version` identifica la versione della libreria desiderata.

Esempio:

```text
version 10
```

L'utente aggiunge una Song:

```text
version 11
```

L'utente rimuove una Song:

```text
version 12
```

Il Windows Client comunica quale versione ha sincronizzato.

Questo permette al backend di sapere se il client ha lavorato su una versione ormai vecchia della libreria.

---

# 17. Quando aumenta `sync_version`

La versione aumenta quando cambia la libreria desiderata.

Per esempio:

```text
/add
/remove
riattivazione di una Song
cambio della URL YouTube definitiva
```

La semplice lettura della libreria non modifica la versione.

---

# 18. Indici

Le constraint `UNIQUE` creano già gli indici necessari per:

```text
songs(
    normalized_artist,
    normalized_title,
    version_type
)

tracks(relative_path)
```

Aggiungiamo inoltre:

```sql
CREATE INDEX idx_tracks_song_id
ON tracks(song_id);
```

---

# 19. Migrazione iniziale

File:

```text
backend/migrations/0001_initial.sql
```

Contenuto:

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE songs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    artist TEXT NOT NULL,
    title TEXT NOT NULL,

    normalized_artist TEXT NOT NULL,
    normalized_title TEXT NOT NULL,

    version_type TEXT NOT NULL DEFAULT 'standard'
        CHECK (
            version_type IN (
                'standard',
                'cover',
                'remix',
                'acoustic',
                'live'
            )
        ),

    youtube_url TEXT NOT NULL,

    status TEXT NOT NULL DEFAULT 'active'
        CHECK (
            status IN ('active', 'removed')
        ),

    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    UNIQUE (
        normalized_artist,
        normalized_title,
        version_type
    )
);

CREATE TABLE tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    song_id INTEGER NOT NULL,

    relative_path TEXT NOT NULL UNIQUE,

    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY (song_id)
        REFERENCES songs(id)
        ON DELETE RESTRICT
);

CREATE TABLE sync_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),

    sync_version INTEGER NOT NULL DEFAULT 0,

    last_sync_started_at TEXT,

    last_sync_completed_at TEXT,

    last_sync_status TEXT
        CHECK (
            last_sync_status IS NULL
            OR last_sync_status IN (
                'success',
                'failed'
            )
        )
);

CREATE INDEX idx_tracks_song_id
ON tracks(song_id);

INSERT INTO sync_state (id, sync_version)
VALUES (1, 0);
```

---

# 20. Regola fondamentale

Il modello del database è volutamente semplice:

```text
┌──────────────────────┐
│      DATABASE        │
│                      │
│ Song                 │
│   └── YouTube URL    │
│                      │
│ Track                │
│   └── USB path       │
│                      │
│ sync_version         │
└──────────┬───────────┘
           │
           │ desired state
           ▼
┌──────────────────────┐
│   WINDOWS CLIENT     │
│                      │
│ confronta DB + USB   │
│ e applica il piano   │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│         USB          │
│                      │
│ stato fisico reale   │
└──────────────────────┘
```

**Il database dice cosa vogliamo.**

**La USB dice cosa abbiamo.**

**Il client confronta le due cose e le allinea.**