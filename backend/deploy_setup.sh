#!/bin/bash
# Helper script to set up Cloudflare D1 and Secrets for production

echo "=== MusicSync Cloudflare Setup Helper ==="

# 1. Check wrangler login
echo "Checking Wrangler authentication..."
npx wrangler whoami || { echo "Please log in to Wrangler first using: npx wrangler login"; exit 1; }

# 2. Create D1 Database if not exists
echo "Creating D1 database 'musicsync-db'..."
npx wrangler d1 create musicsync-db || echo "Database might already exist, proceeding..."

echo ""
echo "To set secrets on Cloudflare Workers, run the following commands in your terminal:"
echo "--------------------------------------------------------------------------------"
echo "cd backend"
echo "npx wrangler secret put TELEGRAM_BOT_TOKEN"
echo "npx wrangler secret put TELEGRAM_WEBHOOK_SECRET"
echo "npx wrangler secret put AUTHORIZED_TELEGRAM_IDS"
echo "npx wrangler secret put SYNC_TOKEN"
echo "npx wrangler secret put YOUTUBE_API_KEY"
echo "npx wrangler secret put SPOTIFY_CLIENT_ID"
echo "npx wrangler secret put SPOTIFY_CLIENT_SECRET"
echo "--------------------------------------------------------------------------------"
echo ""
echo "To run locally with wrangler dev:"
echo "1. Fill in your credentials in backend/.dev.vars"
echo "2. Run: cd backend && npx wrangler dev"
