# Arsitektur Chatbot

Diagram di bawah menggambarkan kode yang sudah jalan sekarang. Bahasa Indonesia, nama modul dan endpoint sesuai kode.

Sumber utama: `docs/chatbot-routing-map.md` untuk alur lengkap dan `docs/chat-api-untuk-fe.md` untuk pemakaian dari FE.

## 1. Gambaran besar sistem

```mermaid
flowchart TD
    subgraph FE["Frontend"]
        HTML["chat-test.html<br/>atau FE React nanti"]
    end

    subgraph API["Backend apps/api - /api/v1"]
        R["routes.ts"]
        CHAT_API["chat/api/chat.ts"]
        ITI_API["itinerary/api/itinerary.api.ts"]
        ROUTE_API["routing/api/routing.api.ts"]
    end

    subgraph SVC["Service"]
        CHAT_SVC["chat.service.ts<br/>orkestrasi pesan"]
        CLS["classifier.ts"]
        CTX["conversation-context.ts"]
        TOOLS["tools.ts"]
        GEN["itinerary-generator.ts"]
        DRAFT["draft-store.ts<br/>memori + TTL"]
        ITI_SVC["itinerary.service.ts"]
        ROUTE_SVC["routing.service.ts"]
        CACHE["route-cache.repository.ts<br/>LRU + TTL"]
    end

    subgraph DATA["Data"]
        PG[("PostgreSQL<br/>users, chat_sessions,<br/>chat_messages, itinerary,<br/>destinations")]
        OSRM["OSRM<br/>demo / self-host nanti"]
    end

    HTML -->|"POST /chat/sessions/:id/messages<br/>POST /itineraries/confirm<br/>POST /routes/driving"| R
    R --> CHAT_API
    R --> ITI_API
    R --> ROUTE_API

    CHAT_API --> CHAT_SVC
    ITI_API --> ITI_SVC
    ROUTE_API --> ROUTE_SVC

    CHAT_SVC --> CLS
    CHAT_SVC --> CTX
    CHAT_SVC --> TOOLS
    CHAT_SVC --> GEN
    CHAT_SVC --> DRAFT
    ITI_SVC --> DRAFT

    CHAT_SVC --> PG
    ITI_SVC --> PG
    ROUTE_SVC --> CACHE
    ROUTE_SVC -->|"route/v1/driving"| OSRM
```

Aturan lapisan tetap: `api -> service -> repository -> DB/integrasi`. Route tidak query Prisma langsung. Fitur tidak saling impor, kode lintas fitur di `src/shared/`.

## 2. Alur kirim pesan sampai draft

```mermaid
sequenceDiagram
    autonumber
    participant FE as FE
    participant API as POST /chat/sessions/:id/messages
    participant SVC as chat.service.ts
    participant CLS as classifier
    participant DB as PostgreSQL
    participant AI as Model + Tools
    participant DS as draft-store

    FE->>API: userId + content
    API->>SVC: sendMessage
    SVC->>SVC: productionGate tolak kalau NODE_ENV=production
    SVC->>DB: cek user aktif + session milik user
    SVC->>DB: simpan pesan user ke chat_messages
    SVC->>DB: ambil 20 riwayat terakhir
    SVC->>CLS: tentukan intent
    CLS-->>SVC: general_chat / generate_itinerary /<br/>modify / regenerate / confirm / missing_information

    alt info belum lengkap
        SVC-->>FE: intent=missing_information, draft=null,<br/>message menyebut tanggal/jam/kategori yang kurang
    else itinerary lengkap
        SVC->>AI: toolChoice required, maks AI_TOOL_MAX_ROUNDS
        AI->>AI: search_destinations lalu get_destination_details
        Note over AI: filter city Padang, isActive, maks 10.<br/>validasi di tools.ts
        AI-->>SVC: hasil tool terstruktur
        SVC->>SVC: generateItinerary susun urutan + jam + garis lurus
        SVC->>DS: replaceSessionDraft, 1 session 1 draft aktif
        SVC->>DB: simpan pesan assistant + metadata intent/draftId
        SVC-->>FE: message + intent + draft + assistantMessageId + sessionId
    end
```

Bentuk `draft`: `draftId, travelDate, startTime, endTime, destinations[{order, destinationId, name, latitude, longitude, visitAt, durationMinutes}], route LineString [lon,lat] atau null`.

## 3. Alur confirm itinerary

```mermaid
sequenceDiagram
    autonumber
    participant FE as FE
    participant API as POST /itineraries/confirm
    participant SVC as itinerary.service.ts
    participant DS as draft-store
    participant DB as PostgreSQL

    FE->>API: draftId + userId + sessionId
    API->>SVC: confirm
    SVC->>DS: getDraft cek id, user, session, TTL
    SVC->>DB: cek user aktif
    SVC->>DB: kalau draftId sudah pernah confirm, kembalikan lama
    SVC->>DB: tulis itinerary + itinerary_destinations satu transaksi
    alt baru
        DB-->>FE: 201 + data itinerary
    else sudah pernah
        DB-->>FE: 200 + data yang sama, tanpa baris ganda
    end
```

Draft hanya di memori. Restart API mengosongkan draft. Hasil confirm tidak selengkap draft, jadi FE simpan draft untuk gambar marker peta.

## 4. Alur routing jalan + cache

```mermaid
flowchart TD
    A["FE: POST /api/v1/routes/driving<br/>points 2-50, profile car/motorcycle"] --> B["routing.api.ts<br/>validasi Zod"]
    B --> C["routing.service.ts<br/>getRoute"]
    C --> D{"hitung kunci:<br/>profile + koordinat<br/>bulat 5 desimal"}
    D --> E["cek route-cache"]
    E -->|ketemu| F["kembalikan source=cache"]
    E -->|miss| G["hit OSRM route/v1/driving<br/>overview=full, geometries=geojson<br/>timeout 8 dtk"]
    G -->|429/5xx| H["tunggu 400ms<br/>coba 1x lagi"]
    H --> G
    G -->|sukses| I["source=osrm<br/>motor: durasi x1.2<br/>estimated=true"]
    I --> J["simpan ke cache"]
    J --> F
    G -->|gagal| K["source=fallback<br/>garis lurus + jarak Haversine<br/>durationMin=null + error"]
```

Catatan koordinat: input `{latitude, longitude}`, output `geometry.coordinates` urutan `[longitude, latitude]`, langsung cocok untuk MapLibre.

## 5. Relasi data yang dipakai chatbot

```mermaid
erDiagram
    users ||--o{ chat_sessions : punya
    chat_sessions ||--o{ chat_messages : berisi
    models ||--o{ chat_sessions : dipakai
    models ||--o{ chat_messages : mencatat
    chat_sessions ||--o| itinerary : jadi_draft
    itinerary ||--o{ itinerary_destinations : berisi
    destinations ||--o{ itinerary_destinations : dikunjungi
    destinations ||--o{ destination_categories : punya
    categories ||--o{ destination_categories : mengelompokkan

    users {
        string id PK
        boolean isActive
    }
    chat_sessions {
        string id PK
        string userId FK
        string modelId FK
        string title
    }
    chat_messages {
        string id PK
        string sessionId FK
        string role
        string content
        json metadata
    }
    itinerary {
        string id PK
        string userId FK
        string sessionId FK
    }
    destinations {
        string id PK
        string city
        boolean isActive
        decimal latitude
        decimal longitude
    }
```

Tidak ada tabel chat baru. Draft dan cache rute sengaja di memori, bukan di DB.
