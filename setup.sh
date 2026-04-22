#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# MedSoft Compliance Platform — Local Setup Script
# Run once after cloning on a new machine: bash setup.sh
# ─────────────────────────────────────────────────────────────────────────────
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
info()    { echo -e "${CYAN}[INFO]${NC}  $1"; }
success() { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }
header()  { echo -e "\n${BOLD}$1${NC}"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║        MedSoft Compliance Platform — Setup                   ║"
echo "║        IEC 62304 Traceability & AI Requirements Tool         ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ── 1. Check prerequisites ─────────────────────────────────────────────────
header "1. Checking prerequisites..."

command -v python3 >/dev/null 2>&1 || error "Python 3.10+ is required. Install: sudo apt install python3 python3-pip python3-venv"
PY_VER=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
info "  Python $PY_VER found"

# Prefer nvm Node if available (system Node may be too old)
if [ -f "$HOME/.nvm/nvm.sh" ]; then
  source "$HOME/.nvm/nvm.sh"
  nvm use 20 2>/dev/null || nvm install 20 2>/dev/null || true
fi
command -v node >/dev/null 2>&1 || error "Node.js 18+ required. Install via nvm: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash"
NODE_VER=$(node --version)
info "  Node $NODE_VER found"

command -v npm >/dev/null 2>&1 || error "npm is required (comes with Node.js)"
command -v psql >/dev/null 2>&1 || error "PostgreSQL client not found. Install: sudo apt install postgresql postgresql-client"
info "  PostgreSQL client found"

success "All prerequisites met."

# ── 2. PostgreSQL database setup ───────────────────────────────────────────
header "2. Setting up PostgreSQL database..."

DB_USER="medsoft"; DB_PASS="medsoft"; DB_NAME="medsoft"
DB_HOST="localhost"; DB_PORT="5432"

if ! pg_isready -h $DB_HOST -p $DB_PORT -q 2>/dev/null; then
  warn "PostgreSQL not running. Attempting to start..."
  sudo systemctl start postgresql 2>/dev/null || warn "Could not auto-start PostgreSQL. Start it manually and re-run."
fi

sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';" 2>/dev/null || warn "  User '$DB_USER' already exists (OK)"
sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" 2>/dev/null || warn "  Database '$DB_NAME' already exists (OK)"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;" 2>/dev/null || true

success "Database '$DB_NAME' ready."

# ── 3. Backend setup ───────────────────────────────────────────────────────
header "3. Setting up backend..."
cd "$SCRIPT_DIR/backend"

if [ ! -d ".venv" ]; then
  info "  Creating Python virtual environment..."
  python3 -m venv .venv
fi
source .venv/bin/activate

info "  Installing Python dependencies (includes anthropic SDK)..."
pip install -q --upgrade pip
pip install -q -r requirements.txt
success "  Python packages installed."

# .env file
if [ ! -f ".env" ]; then
  cp .env.example .env
  success "  Created backend/.env from .env.example"
  echo ""
  warn  "  ┌─────────────────────────────────────────────────────────┐"
  warn  "  │  ACTION REQUIRED: Add your Anthropic API key            │"
  warn  "  │                                                          │"
  warn  "  │  1. Get a key at: https://console.anthropic.com         │"
  warn  "  │  2. Open:  backend/.env                                  │"
  warn  "  │  3. Replace ANTHROPIC_API_KEY=sk-ant-REPLACE_WITH_...   │"
  warn  "  │     with your actual key                                 │"
  warn  "  │                                                          │"
  warn  "  │  Without this key, AI requirements generation will not  │"
  warn  "  │  work. All other features work without it.              │"
  warn  "  └─────────────────────────────────────────────────────────┘"
  echo ""
else
  info "  backend/.env already exists, skipping."
fi

# Run migrations
info "  Running database migrations..."
alembic upgrade head
success "  Migrations applied (all tables created including knowledge_entries)."

# ── 4. Seed data ───────────────────────────────────────────────────────────
header "4. Seed data"
echo ""
echo "  Options:"
echo "    [1] Full demo data — 5 IEC 62304 projects + users/roles (recommended)"
echo "    [2] Minimal seed only (Phase 1 demo, single project)"
echo "    [3] Skip seeding (empty database)"
echo ""
read -p "  Choose [1/2/3] (default: 1): " SEED_CHOICE
SEED_CHOICE="${SEED_CHOICE:-1}"

case "$SEED_CHOICE" in
  1)
    info "  Seeding full demo data (5 projects + users)..."
    python seed_all.py
    success "  Full demo data loaded."
    ;;
  2)
    info "  Seeding Phase 1 demo data..."
    python seed.py
    python seed_phase2.py
    success "  Phase 1-2 demo data loaded."
    ;;
  3)
    info "  Skipping seed — database is empty."
    warn  "  Note: IEC 62304 knowledge base entries auto-seed on first app use."
    ;;
esac

# ── 5. Knowledge base import ───────────────────────────────────────────────
FIXTURE="$SCRIPT_DIR/backend/fixtures/knowledge_base.sql"
if [ -f "$FIXTURE" ]; then
  info "  Importing knowledge base from fixtures/knowledge_base.sql..."
  PGPASSWORD="medsoft" psql -h localhost -p 5432 -U medsoft -d medsoft \
    -c "TRUNCATE TABLE knowledge_entries RESTART IDENTITY CASCADE;" 2>/dev/null || true
  PGPASSWORD="medsoft" psql -h localhost -p 5432 -U medsoft -d medsoft < "$FIXTURE"
  COUNT=$(grep -c "^INSERT" "$FIXTURE" || echo "?")
  success "  $COUNT knowledge entries imported (IEC 62304, ISO 14971, MDR, etc.)"
else
  warn "  No fixture found at backend/fixtures/knowledge_base.sql — knowledge base will auto-seed on first use."
fi

deactivate
echo ""

# ── 6. Frontend setup ──────────────────────────────────────────────────────
header "5. Setting up frontend..."
cd "$SCRIPT_DIR/frontend"

if [ ! -f ".env.local" ]; then
  cp .env.local.example .env.local
  success "  Created frontend/.env.local from example"
else
  info "  frontend/.env.local already exists, skipping."
fi

info "  Installing Node.js dependencies..."
npm install --silent
success "  Node packages installed."

# ── 7. Done ────────────────────────────────────────────────────────────────
cd "$SCRIPT_DIR"
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Setup complete!                                             ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║                                                              ║"
echo "║  Terminal 1 — Backend:                                       ║"
echo "║    cd backend && source .venv/bin/activate                   ║"
echo "║    uvicorn app.main:app --reload                             ║"
echo "║    → http://localhost:8000/docs                              ║"
echo "║                                                              ║"
echo "║  Terminal 2 — Frontend:                                      ║"
echo "║    cd frontend && npm run dev                                ║"
echo "║    → http://localhost:3000                                   ║"
echo "║                                                              ║"
echo "║  Default login:                                              ║"
echo "║    admin@medsoft.local / Admin@123                           ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  Next steps:"
echo "   1. Add ANTHROPIC_API_KEY to backend/.env"
echo "   2. Visit http://localhost:3000/knowledge → Standards Library"
echo "      auto-populates with IEC 62304 / ISO 14971 / MDR data"
echo ""
