# 🧠 Memento - Harness Your Brilliance

> An AI-powered learning platform that transforms your documents into interactive knowledge experiences.

[![React](https://img.shields.io/badge/React-19.2.0-blue)](https://react.dev/) [![TypeScript](https://img.shields.io/badge/TypeScript-5.8.2-blue)](https://www.typescriptlang.org/) [![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-green)](https://supabase.com/) [![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4-orange)](https://openai.com/)

**Upload PDFs → Ask AI Questions → Generate Audio Overviews**

---

## ✨ Features

### 🤖 AI-Powered Learning
- **Document Analysis** - Upload PDFs and extract knowledge automatically
- **RAG Chat** - Ask questions and get answers with citations from your documents
- **Audio Overviews** - Generate NotebookLM-style podcast summaries (Deep Dive, Critical, Debate, Analysis)
- **Vector Search** - Semantic search across all your uploaded content
- **Smart Embeddings** - OpenAI text-embedding-3-small for accurate context retrieval

### 📚 Notebook Management
- **Organized Learning** - Create notebooks for different topics
- **Multi-Source Support** - PDFs, text files, audio, video, web links
- **Processing Pipeline** - Automatic text extraction, chunking, and embedding generation
- **Source Tracking** - View processing status and metadata for each upload

### 🔐 Authentication & Security
- **Email/Password** - Secure authentication with Supabase
- **Google OAuth** - One-click sign-in
- **Password Reset** - 6-digit email verification with expiration
- **Row Level Security (RLS)** - Database-level access control
- **Protected Routes** - Route guards for authenticated pages

### 🎨 Modern UI/UX
- **Glass Morphism** - Beautiful glassmorphic design with purple/cyan gradients
- **Dark Theme** - Eye-friendly dark interface
- **Responsive** - Mobile-first design
- **Real-time Updates** - Live progress indicators for AI operations
- **Digital Rain Effects** - Cyberpunk-inspired background animations

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm
- Supabase account (free tier works)
- OpenAI API key
- NVIDIA NIM API key (for embeddings)
- Lingshi API key (server-side, for LLM)

### 1. Clone & Install
```bash
git clone https://github.com/LUNARTECH-X/memento.git
cd memento
npm install
```

### 2. Environment Setup
Copy the example env file and fill in your keys:
```bash
cp .env.example .env.local
```

Required variables:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_OPENAI_API_KEY=sk-your-openai-key
VITE_NVIDIA_API_KEY=nvapi-your-nvidia-key
LINGSHI_API_KEY=sk-your-lingshi-key
VITE_WEB3FORMS_KEY=your-web3forms-key
```

> See [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md) for where to get each key.

### 3. Database Setup

In your Supabase project → **SQL Editor**, run these files **in order**:

1. `supabase/setup-database.sql` — all tables, RLS policies, pgvector
2. `supabase/lightrag-functions.sql` — knowledge graph search functions
3. `supabase/match_document_chunks.sql` — vector similarity search
4. `supabase/setup-storage-assets.sql` — storage bucket policies

**Create Storage Buckets** (Supabase Dashboard → Storage):
- `documents` — Private
- `assets` — Public
- `avatars` — Public

### 4. Run Development Server
```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

> **Note:** NVIDIA embeddings (PDF processing) require `npm run dev` — they use a local Vite proxy to bypass CORS. They will not work with `npm run preview` or a static build without additional setup. See [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md).

---

## 📖 Usage

### Upload & Analyze Documents
1. Click **"New Notebook"**
2. Select **"Upload Sources"**
3. Drop PDF files or click to browse
4. Wait for processing (text extraction → chunking → embeddings)

### Ask AI Questions
1. Open a notebook with processed documents
2. Type your question in the chat
3. Get AI responses with citations from your sources

### Generate Audio Overview
1. In notebook, click **"Studio"** panel
2. Select **"Audio Overview"**
3. Choose format (Deep Dive, Critical, Debate, Analysis)
4. Select duration (10min - 3hr)
5. Click **"Generate"**
6. Wait 30-60 seconds for AI to create podcast script and audio

---

## 🏗️ Project Structure

```
memento/
├── components/           # React components
│   ├── auth/            # Authentication components
│   ├── ui/              # Reusable UI components
│   ├── ChatInterface.tsx
│   ├── AudioOverviewModal.tsx
│   └── ...
├── lib/                 # Utilities and services
│   ├── supabase/        # Supabase client
│   ├── documentProcessor.ts  # PDF extraction & embeddings
│   ├── aiChat.ts        # RAG chat implementation
│   ├── audioGenerator.ts # Audio overview generation
│   └── ...
├── pages/              # Route pages
│   ├── Dashboard.tsx
│   ├── Notebook.tsx
│   ├── NewNotebookSetup.tsx
│   └── ...
├── supabase/           # Database SQL files
│   ├── schema_safe.sql
│   ├── match_document_chunks.sql
│   └── ...
└── documentation/      # Project docs
```

---

## 🧪 Technology Stack

| Category | Technology |
|----------|-----------|
| **Frontend** | React 19.2.0, TypeScript 5.8.2, Vite 6.2.0 |
| **Styling** | TailwindCSS (utility-first) |
| **Routing** | React Router DOM 7.9.6 |
| **Backend** | Supabase (PostgreSQL + Auth + Storage) |
| **AI/ML** | OpenAI GPT-4, text-embedding-3-small, TTS |
| **Vector DB** | Supabase pgvector extension |
| **Forms** | React Hook Form + Zod validation |
| **PDF Processing** | pdf.js (pdfjs-dist) |
| **Icons** | Lucide React |
| **Email** | Web3Forms API |

---

## 💡 Key Features Explained

### Document Processing Pipeline
1. **Upload** - File stored in Supabase Storage
2. **Extraction** - PDF.js extracts text from each page
3. **Chunking** - Text split into 1000-char chunks with 200-char overlap
4. **Embedding** - OpenAI generates 1536-dimensional vectors
5. **Storage** - Chunks and embeddings stored in PostgreSQL with pgvector

### RAG Chat System
1. **Query** - User asks a question
2. **Embedding** - Question converted to vector
3. **Search** - pgvector finds top-5 similar chunks (cosine similarity)
4. **Context** - Relevant chunks added to prompt
5. **Generation** - GPT-4 responds with citations

### Audio Overview Generation
1. **Script** - GPT-4 generates multi-speaker podcast script
2. **TTS** - OpenAI text-to-speech converts to audio
3. **Storage** - MP3 uploaded to Supabase Storage
4. **Metadata** - Saved to `generated_assets` table

---

## 📊 Database Schema

### Core Tables
- `profiles` - User accounts (extends auth.users)
- `notebooks` - Document collections
- `sources` - Uploaded files with metadata
- `document_chunks` - Text chunks with vector embeddings
- `conversations` - Chat sessions
- `messages` - Chat history with citations
- `generated_assets` - AI-created audio/video/summaries

### Future Tables (LightRAG)
- `graph_nodes` - Knowledge graph entities
- `graph_edges` - Entity relationships

See [database_schema.md](documentation/database_schema.md) for complete schema.

---

## 🔒 Security

- **Row Level Security (RLS)** - All tables protected
- **User Isolation** - Users can only access their own data
- **Public Notebooks** - Optional sharing via `is_public` flag
- **Secure Storage** - Private documents bucket, public assets bucket
- **Password Hashing** - Bcrypt via Supabase Auth
- **API Key Protection** - Environment variables, never exposed client-side

---

## 🌐 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | ✅ | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | ✅ | Supabase anonymous key |
| `VITE_OPENAI_API_KEY` | ✅ | OpenAI key — TTS, image gen, entity extraction |
| `VITE_NVIDIA_API_KEY` | ✅ | NVIDIA NIM key — nv-embedqa-e5-v5 embeddings (1024-dim) |
| `LINGSHI_API_KEY` | ✅ | Lingshi key - chat and script generation (Supabase secret) |
| `VITE_WEB3FORMS_KEY` | ✅ | Web3Forms key — password reset emails |
| `VITE_FAL_API_KEY` | ❌ | fal.ai key — FLUX image generation for video slides |
| `VITE_GOOGLE_API_KEY` | ❌ | Google AI API — optional alternative |

> See [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md) for setup instructions and where to obtain each key.

---

## 💰 Cost Estimates

### OpenAI API Costs
- **Embeddings** (text-embedding-3-small): $0.020 / 1M tokens
  - 100-page PDF (~50k tokens): ~$0.001
- **Chat** (GPT-4 Turbo): $0.01 input + $0.03 output / 1K tokens
  - Typical chat: ~$0.01 per response
- **TTS** (tts-1-hd): $15.00 / 1M characters
  - 10-min podcast (~1,500 words): ~$0.15

**Typical Monthly Usage:**
- 10 PDFs processed: $0.05
- 50 AI chats: $0.50
- 5 audio overviews: $0.75
- **Total: ~$1.30/month**

### Supabase Costs
- **Free Tier**: 500MB database, 1GB file storage, 50k MAU
- Most projects stay within free tier

---

## 🛠️ Development

### Available Scripts
```bash
npm run dev      # Start dev server (localhost:5173)
npm run build    # Build for production
npm run preview  # Preview production build
```

### Adding Features
1. Create component in `components/`
2. Add route in `App.tsx`
3. Create database tables in `supabase/`
4. Add utilities in `lib/`

### Debugging
- Check browser console for logs
- Supabase Dashboard → Logs for database errors
- Network tab for API calls

---

## 🚧 Roadmap

### Coming Soon
- [ ] LightRAG graph-based retrieval
- [ ] Multi-speaker TTS (Google Cloud TTS)
- [ ] Video overview generation
- [ ] Flashcard generation from documents
- [ ] Quiz creation with spaced repetition
- [ ] Mind map visualization
- [ ] Handbook/summary exports (PDF)
- [ ] Real-time collaboration
- [ ] Mobile app (React Native)

### Completed
- [x] PDF upload and processing
- [x] AI chat with RAG
- [x] Audio overview generation
- [x] Vector search
- [x] Authentication system

---

## 📚 Documentation

- [Product Overview](documentation/overview.md)
- [Feature Details](documentation/product_details.md)
- [Database Schema](documentation/database_schema.md)
- [Authentication Guide](documentation/authentication.md)
- [Tech Stack (NotebookLM)](documentation/insightlm.md)
- [Git Collaboration](documentation/git_collaboration_guide.md)

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

---

## 📝 License

This project is proprietary and confidential.

---

## 🙏 Acknowledgments

- [OpenAI](https://openai.com/) - GPT-4, Embeddings, TTS
- [Supabase](https://supabase.com/) - Backend infrastructure
- [Vite](https://vitejs.dev/) - Lightning-fast build tool
- [React](https://react.dev/) - UI framework
- [TailwindCSS](https://tailwindcss.com/) - Styling
- [Lucide](https://lucide.dev/) - Beautiful icons
- [pdf.js](https://mozilla.github.io/pdf.js/) - PDF processing

---

## 📧 Contact

**LunarTech AI** - [GitHub](https://github.com/LunarTechAI)

**Project Link**: [https://github.com/LunarTechAI/memento](https://github.com/LunarTechAI/memento)

---

<div align="center">
Made with 💜 by LunarTech AI
</div>
