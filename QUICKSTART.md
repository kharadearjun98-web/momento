# 🚀 QUICK START - Everything You Need To Do

## ✅ Step-by-Step Checklist

### 1️⃣ Install Dependencies (2 minutes)
```powershell
cd C:\Users\bagra\Documents\OneDrive\Desktop\Memento\memento
npm install
```

### 2️⃣ Get OpenAI API Key (5 minutes)
1. Go to https://platform.openai.com/signup
2. Sign up or log in
3. Add payment method: https://platform.openai.com/account/billing/overview
4. Get API key: https://platform.openai.com/api-keys
5. Copy your key (starts with `sk-proj-...` or `sk-...`)

### 3️⃣ Create .env File (1 minute)
```powershell
# Copy the example file
Copy-Item .env.example .env

# Then open .env in VS Code and add your OpenAI key:
# VITE_OPENAI_API_KEY=sk-your-key-here
```

Your `.env` should look like:
```env
VITE_SUPABASE_URL=https://dsklqvjfquvfuvnuzgrr.supabase.co
VITE_SUPABASE_ANON_KEY=your-existing-key
VITE_WEB3FORMS_KEY=your-existing-key
VITE_OPENAI_API_KEY=sk-proj-xxxxx  # ← ADD THIS!
VITE_GOOGLE_API_KEY=  # Optional for now
```

### 4️⃣ Set Up Database (10 minutes)

**Go to Supabase Dashboard:**
- URL: https://supabase.com/dashboard/project/dsklqvjfquvfuvnuzgrr

**Execute SQL Files:**

1. **Click "SQL Editor"** in left sidebar
2. **Click "New Query"**
3. **Copy ENTIRE contents** of `supabase/schema.sql`
4. **Paste and click "Run"** ✅
5. **Create another New Query**
6. **Copy contents** of `supabase/match_document_chunks.sql`
7. **Paste and click "Run"** ✅

**Verify it worked:**
```sql
-- Run this query to check tables were created
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' ORDER BY table_name;
```

You should see: `conversations`, `document_chunks`, `flashcards`, `generated_assets`, `graph_edges`, `graph_nodes`, `messages`, `notebooks`, `profiles`, `sources`, `user_activity`

### 5️⃣ Create Storage Buckets (5 minutes)

**In Supabase Dashboard:**
1. Click **"Storage"** in left sidebar
2. Click **"Create a new bucket"**

**Create Bucket #1:**
- Name: `documents`
- Public: ❌ UNCHECK (Private)
- Click "Create Bucket"

**Create Bucket #2:**
- Name: `assets`
- Public: ✅ CHECK (Public)
- Click "Create Bucket"

**Set up policies for `documents` bucket:**
1. Click on `documents` bucket
2. Go to **"Policies"** tab
3. Click **"New Policy"** → **"Create policy from scratch"**
4. Name: "Users can manage their documents"
5. Paste this SQL:

```sql
-- For INSERT
CREATE POLICY "Users can upload to their notebooks"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM notebooks WHERE user_id = auth.uid()
  )
);

-- For SELECT
CREATE POLICY "Users can view their documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM notebooks WHERE user_id = auth.uid()
  )
);
```

### 6️⃣ Start the App (1 minute)
```powershell
npm run dev
```

App will open at: http://localhost:5173

### 7️⃣ Test It! (5 minutes)

1. **Sign in** to Memento
2. Click **"New Notebook"**
3. Click **"Upload Sources"**
4. **Upload a PDF** (any PDF file)
5. Click **"Upload 1 Files"**

**You should see:**
- ✅ "Creating notebook..."
- ✅ "Processing [filename].pdf (1/1)..."
- ✅ Redirected to notebook with your PDF listed

6. **Try the chat:**
   - Ask a question about your PDF
   - AI should respond with context from the document

7. **Try audio generation:**
   - Click **"Studio"** panel (right side)
   - Click **"Audio Overview"**
   - Select "Deep Dive" format
   - Select "10 min" duration
   - Click **"Generate"**
   - Wait ~30-60 seconds
   - You'll get a success message!

---

## 🐛 Common Issues

### "Cannot find module 'openai'"
**Fix:** Run `npm install` again

### "Invalid API key"
**Fix:** 
1. Check `.env` has `VITE_OPENAI_API_KEY=sk-...`
2. Restart dev server: Stop (Ctrl+C), then `npm run dev`

### "Insufficient quota"
**Fix:** Add payment method at https://platform.openai.com/account/billing/overview

### "relation 'document_chunks' does not exist"
**Fix:** Re-run `supabase/schema.sql` in SQL Editor

### "Storage bucket not found"
**Fix:** Create `documents` and `assets` buckets in Storage

---

## 💰 Cost Estimate

**For testing (first 10 PDFs + 5 audio overviews):**
- ~$2-3 total

**Typical monthly usage:**
- 10 documents: ~$0.05
- 50 chat messages: ~$0.50
- 5 audio overviews: ~$0.75
- **Total: ~$1.30/month**

---

## 📚 Full Documentation

See `AI_SETUP_GUIDE.md` for detailed explanations and troubleshooting.

---

## ✨ What's Implemented

✅ **PDF Upload** → Supabase Storage
✅ **Text Extraction** → PDF.js
✅ **Chunking & Embeddings** → OpenAI `text-embedding-3-small`
✅ **Vector Search** → Supabase pgvector
✅ **AI Chat** → OpenAI GPT-4 with RAG
✅ **Audio Generation** → Script generation + OpenAI TTS
✅ **Database Schema** → All tables with RLS policies

## 🔜 What's Next (Optional)

- Update `Notebook.tsx` to load real sources from database (currently using mock data)
- Update `StudioPanel.tsx` to show generated audio files
- Add progress bars for long operations
- Implement LightRAG graph extraction
- Add multi-speaker audio with Google TTS

---

**Ready? Start with Step 1!** 🎯
