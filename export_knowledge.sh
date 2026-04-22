#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# MedSoft — Knowledge Base Export
#
# Exports all knowledge_entries to backend/fixtures/knowledge_base.sql
# Commit that file to Git → available on every PC via git pull.
#
# Usage:
#   bash export_knowledge.sh          → export current DB → fixtures file
#   bash export_knowledge.sh import   → import fixtures file → DB (used by setup.sh)
# ─────────────────────────────────────────────────────────────────────────────
set -e

DB_NAME="medsoft"; DB_USER="medsoft"; DB_HOST="localhost"; DB_PORT="5432"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURE="$SCRIPT_DIR/backend/fixtures/knowledge_base.sql"

GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()    { echo -e "${CYAN}[INFO]${NC}  $1"; }
success() { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $1"; }

mkdir -p "$SCRIPT_DIR/backend/fixtures"

ACTION="${1:-export}"

if [ "$ACTION" = "export" ]; then
  info "Exporting knowledge_entries → $FIXTURE"

  PGPASSWORD="$DB_USER" pg_dump \
    -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" \
    --table=knowledge_entries \
    --data-only \
    --no-owner \
    --no-acl \
    --column-inserts \
    "$DB_NAME" > "$FIXTURE"

  COUNT=$(grep -c "^INSERT" "$FIXTURE" || echo "0")
  success "Exported $COUNT entries → backend/fixtures/knowledge_base.sql"
  echo ""
  echo "  Next steps to share via GitHub:"
  echo "    git add backend/fixtures/knowledge_base.sql"
  echo "    git commit -m 'Update knowledge base fixture'"
  echo "    git push"
  echo ""
  echo "  On another PC after git pull:"
  echo "    bash export_knowledge.sh import"
  echo "    (setup.sh does this automatically)"

elif [ "$ACTION" = "import" ]; then
  [ -f "$FIXTURE" ] || { echo "No fixture at $FIXTURE — nothing to import."; exit 0; }

  info "Importing $FIXTURE → $DB_NAME..."
  PGPASSWORD="$DB_USER" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    -c "TRUNCATE TABLE knowledge_entries RESTART IDENTITY CASCADE;" 2>/dev/null || true
  PGPASSWORD="$DB_USER" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" < "$FIXTURE"

  COUNT=$(grep -c "^INSERT" "$FIXTURE" || echo "?")
  success "$COUNT knowledge entries imported."

else
  echo "Usage: bash export_knowledge.sh [export|import]"
  exit 1
fi
