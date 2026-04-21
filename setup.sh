#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# MedSoft Compliance Platform — Local Setup Script
# Run once after cloning: bash setup.sh
# ─────────────────────────────────────────────────────────────────────────────
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[INFO]${NC}  $1"; }
success() { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║        MedSoft Compliance Platform — Setup                   ║"
echo "║        IEC 62304 Traceability & Compliance Tool              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ── 1. Check prerequisites ─────────────────────────────────────────────────
info "Checking prerequisites..."

command -v python3 >/dev/null 2>&1 || error "Python 3.10+ is required. Install: sudo apt install python3 python3-pip python3-venv"
PY_VER=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
info "  Python $PY_VER found"

command -v node >/dev/null 2>&1 || error "Node.js 18+ is required. Install: https://nodejs.org"
NODE_VER=$(node --version)
info "  Node $NODE_VER found"

command -v npm >/dev/null 2>&1 || error "npm is required (comes with Node.js)"

command -v psql >/dev/null 2>&1 || error "PostgreSQL client (psql) not found. Install: sudo apt install postgresql"
info "  PostgreSQL client found"

success "All prerequisites met."
echo ""

# ── 2. PostgreSQL database setup ───────────────────────────────────────────
info "Setting up PostgreSQL database..."

DB_USER="medsoft"
DB_PASS="medsoft"
DB_NAME="medsoft"
DB_HOST="localhost"
DB_PORT="5432"

# Check if PostgreSQL service is running
if ! pg_isready -h $DB_HOST -p $DB_PORT -q 2>/dev/null; then
  warn "PostgreSQL is not running. Attempting to start..."
  sudo systemctl start postgresql 2>/dev/null || warn "Could not start PostgreSQL automatically. Please start it manually."
fi

# Create user and database (ignore errors if already exists)
sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';" 2>/dev/null || warn "  User '$DB_USER' already exists (OK)"
sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" 2>/dev/null || warn "  Database '$DB_NAME' already exists (OK)"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;" 2>/dev/null || true

success "Database '$DB_NAME' ready."
echo ""

# ── 3. Backend setup ───────────────────────────────────────────────────────
info "Setting up backend..."
cd "$SCRIPT_DIR/backend"

# Virtual environment
if [ ! -d ".venv" ]; then
  info "  Creating Python virtual environment..."
  python3 -m venv .venv
fi
source .venv/bin/activate

info "  Installing Python dependencies..."
pip install -q --upgrade pip
pip install -q -r requirements.txt
success "  Python packages installed."

# .env file
if [ ! -f ".env" ]; then
  cp .env.example .env
  success "  Created backend/.env from .env.example"
else
  info "  backend/.env already exists, skipping."
fi

# Run migrations
info "  Running database migrations..."
alembic upgrade head
success "  Migrations applied."

# Seed data
echo ""
read -p "  Seed demo data? (y/N): " SEED_CHOICE
if [[ "$SEED_CHOICE" =~ ^[Yy]$ ]]; then
  info "  Seeding Phase 1 data..."
  python seed.py
  info "  Seeding Phase 2 data..."
  python seed_phase2.py
  success "  Demo data loaded."
fi

deactivate
echo ""

# ── 4. Frontend setup ──────────────────────────────────────────────────────
info "Setting up frontend..."
cd "$SCRIPT_DIR/frontend"

if [ ! -f ".env.local" ]; then
  cp .env.local.example .env.local
  success "  Created frontend/.env.local from example"
else
  info "  frontend/.env.local already exists, skipping."
fi

info "  Installing Node.js dependencies (this may take a minute)..."
npm install --silent
success "  Node packages installed."
echo ""

# ── 5. Done ────────────────────────────────────────────────────────────────
cd "$SCRIPT_DIR"
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Setup complete! Start the platform:                         ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║                                                              ║"
echo "║  Terminal 1 — Backend:                                       ║"
echo "║    cd backend                                                ║"
echo "║    source .venv/bin/activate                                 ║"
echo "║    uvicorn app.main:app --reload                             ║"
echo "║    → http://localhost:8000/docs                              ║"
echo "║                                                              ║"
echo "║  Terminal 2 — Frontend:                                      ║"
echo "║    cd frontend                                               ║"
echo "║    npm run dev                                               ║"
echo "║    → http://localhost:3000                                   ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
