# AI Knowledge Workspace

AI Knowledge Workspace is a production-grade, full-stack, AI-powered knowledge management SaaS platform. The application allows users to register, upload PDF documents, organize them into collections, search semantically across files, and chat with their knowledge base using Retrieval-Augmented Generation (RAG) powered by **Google Gemini** and **Qdrant**.

---

## 🏗️ Architecture & Technology Stack

The application is split into a modern decoupled architecture:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           USER (Browser)                                │
│                                │                                        │
│                      ┌─────────▼──────────┐                             │
│                      │   Next.js Frontend  │ :3000                      │
│                      │   (npm run dev)     │                            │
│                      └─────────┬──────────┘                             │
│                                │ HTTP (REST API)                        │
│                      ┌─────────▼──────────┐                             │
│                      │   FastAPI Backend   │ :8000                      │
│    LOCAL              │   (uvicorn)         │                             │
│    (processes)        └──┬───┬───────────┘                             │
│                         │   │                                           │
│            ┌────────────┘   └──────────────┐                            │
│            ▼                                ▼                            │
│     ┌────────────┐         ┌────────────────────┐                      │
│     │ Qdrant     │         │  Redis    │ Celery  │                      │
│     │ (Embedded/ │         │  :6379    │ Worker  │                      │
│     │ File-based)│         │(Local Svc)│         │                      │
│     └────────────┘         └──────────┬─────────┘                      │
│                                        │                                │
│────────────────────────────────────────┼────────────────────────────────│
│    CLOUD                                 │                               │
│    (External APIs)                       ▼                               │
│     ┌────────────────┐  ┌──────────────┐  ┌─────────────┐              │
│     │   Supabase     │  │  Cloudinary  │  │  Gemini API │              │
│     │  (PostgreSQL)  │  │  (PDF Store) │  │ (Embed+LLM) │              │
│     └────────────────┘  └──────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────────────┘
```

### Core Technologies:
* **Frontend:** Next.js (App Router), React, Tailwind CSS, Lucide Icons, and Sonner Toast notifications.
* **Backend:** FastAPI (REST API endpoints, JWT Auth, CORS middleware).
* **Task Queue:** Celery + Redis (broker & backend) for asynchronous document parsing, chunking, and embedding.
* **AI Orchestration:** LangChain (`RecursiveCharacterTextSplitter`, `ChatGoogleGenerativeAI`, `GoogleGenerativeAIEmbeddings`).
* **LLM Provider:** Google Gemini API (`text-embedding-004` for vectors, `gemini-2.0-flash` for chat & RAG generation).
* **Relational Database:** Supabase (PostgreSQL) + SQLAlchemy ORM + Alembic migrations.
* **Vector Database:** Qdrant (Runs locally in **file-based mode** inside the Python process; no Docker server setup required!).
* **File Storage:** Cloudinary (Secure raw PDF storage).

---

## ⚙️ Prerequisites

Make sure you have the following installed/configured:
1. **Python 3.10+**
2. **Node.js 18+** & **npm**
3. **Redis Server** (Installed locally or via Docker)
4. **Google Gemini API Key** (Get a free key from [Google AI Studio](https://aistudio.google.com/))
5. **Cloudinary Account** (Get free credentials from [Cloudinary](https://cloudinary.com/))
6. **Supabase Project** (Create a free Postgres database at [Supabase](https://supabase.com/))

---

## 🚀 Setup & Local Installation

### 1. Database & Git Setup
1. Create a Supabase project and copy your **Database URI** (under Database Settings -> Connection String -> URI -> select Transaction Pooler mode at port `6543`).
2. Add your **Database URI** as a secret on GitHub:
   - Go to your GitHub repository -> **Settings** -> **Secrets and variables** -> **Actions**.
   - Create a repository secret named `DATABASE_URL` with your Supabase URI (replacing `[password]` with your database password). Pushing to `main` will now automatically deploy schema migrations via GitHub Actions!

### 2. Backend Setup
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create and activate a Python virtual environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```
3. Install the dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Copy the `.env.example` file to `.env`:
   ```bash
   cp .env.example .env
   ```
5. Edit the `.env` file and fill in your Supabase connection string, Gemini API Key, and Cloudinary credentials:
   * **Database:** `DATABASE_URL=postgresql://...` (Make sure to replace `[password]` with your DB password)
   * **Qdrant:** `QDRANT_URL=./qdrant_db` (Sets up local directory storage; no Qdrant server config needed!)
   * **Gemini Key:** `GEMINI_API_KEY=your-api-key`
   * **Cloudinary:** `CLOUDINARY_CLOUD_NAME=`, `CLOUDINARY_API_KEY=`, `CLOUDINARY_API_SECRET=`
   * **JWT Key:** `JWT_SECRET_KEY=your-random-32-character-key`
6. Run the database migrations locally:
   ```bash
   alembic upgrade head
   ```

### 3. Redis Setup (Local Service)
Install and run Redis natively on Linux without Docker:
```bash
sudo apt update
sudo apt install redis-server -y
sudo service redis-server start
```

### 4. Running the Backend & Worker
To run the application, open two terminal windows inside the `backend` directory (with the virtual environment activated):

* **Terminal 1 (Start FastAPI Server):**
  ```bash
  uvicorn app.main:app --port 8000 --reload
  ```
* **Terminal 2 (Start Celery Worker):**
  ```bash
  celery -A app.worker.celery_app worker --loglevel=info
  ```

---

### 5. Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd ../frontend
   ```
2. Install the node packages:
   ```bash
   npm install
   ```
3. Copy the `.env.example` file to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
4. Start the Next.js development server:
   ```bash
   npm run dev
   ```
5. Open your browser and navigate to `http://localhost:3000/register` to create your account!

---

## 📂 Project Structure

```
├── .github/
│   └── workflows/
│       └── db-migrate.yml        # CI/CD: Automated migrations to Supabase
├── backend/
│   ├── alembic/                  # Database migration version files
│   ├── app/
│   │   ├── core/                 # Auth, security, and dependency injections
│   │   ├── routers/              # API Route handlers (auth, chat, documents, collections, search)
│   │   ├── services/
│   │   │   ├── ai/               # RAG, chunking, and vector embedding services
│   │   │   └── cloudinary_service.py # Cloudinary file handling
│   │   ├── worker/               # Celery app configuration and async tasks
│   │   ├── main.py               # Application entry point
│   │   ├── models.py             # SQLAlchemy models
│   │   └── schemas.py            # Pydantic schemas (validation)
│   ├── .env.example
│   ├── alembic.ini
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── app/                  # Next.js app page routing (documents, collections, chat, search)
│   │   ├── components/ui/        # Shared Shadcn UI components
│   │   ├── lib/                  # API client and local AuthContext provider
│   │   └── types/                # Shared TypeScript type definitions
│   ├── .env.example
│   ├── tailwind.config.ts
│   └── package.json
```

---

## 🔒 Security & Row-Level Isolation
* **Hashing:** Passwords are hashed using `bcrypt` (pinned to `4.0.1` for maximum compatibility).
* **Token Auth:** Uses custom stateless Access & Refresh JWT tokens.
* **Row-Level Isolation:** Users can only query, delete, and view documents or collections that belong to their unique `user_id`. Vector payloads in Qdrant are automatically filtered by `user_id` at query time.
